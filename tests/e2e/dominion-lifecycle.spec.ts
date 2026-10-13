import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assertDominionInvariants } from '../../packages/intelligence/src/dominion/invariants';
import type { DominionRecording, Scenario } from '../../packages/intelligence/src/dominion/types';

const route = process.env.DOMINION_E2E_ROUTE ?? '/#/intelligence';
const lab = (page: Page) => page.getByTestId('dominion-lab');
const canvas = (page: Page) => page.locator('canvas[data-dominion-canvas]');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
type Probe = {
  workers: { created: number; terminated: number; active: number };
  raf: { scheduled: number; fired: number; cancelled: number; active: number };
  listeners: { active: number; byType: Record<string, number> };
  webgl: { contextsCreated: number; contextsActive: number; objectsCreated: number; objectsDeleted: number; objectsReleasedByContextLoss: number; active: Record<string, number> };
};
type WindowWithProbe = Window & { __dominionLifecycleProbe: { read(): Probe } };
const errors = new WeakMap<Page, string[]>();
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
  await page.addInitScript(() => {
    // Transparent platform instrumentation only. No runtime commands, Worker
    // messages, renderer facts or planner outcomes are replaced by this probe.
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;
    type Listener = EventListenerOrEventListenerObject;
    type Entry = { target: EventTarget; type: string; capture: boolean; original: Listener; wrapped: EventListener; signal?: AbortSignal; aborted?: EventListener };
    const entries = new Set<Entry>();
    const forget = (entry: Entry) => {
      entries.delete(entry);
      if (entry.signal && entry.aborted) nativeRemove.call(entry.signal, 'abort', entry.aborted);
    };
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if ((this !== window && this !== document) || !callback) return nativeAdd.call(this, type, callback, options);
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const found = [...entries].find(entry => entry.target === this && entry.type === type && entry.capture === capture && entry.original === callback);
      if (found) return nativeAdd.call(this, type, found.wrapped, options);
      const signal = typeof options === 'object' ? options.signal : undefined;
      if (signal?.aborted) return nativeAdd.call(this, type, callback, options);
      const once = typeof options === 'object' && options.once;
      const entry: Entry = { target: this, type, capture, original: callback, signal, wrapped: () => undefined };
      entry.wrapped = function (event) {
        if (once) forget(entry);
        if (typeof callback === 'function') callback.call(this, event);
        else callback.handleEvent(event);
      };
      nativeAdd.call(this, type, entry.wrapped, options);
      entries.add(entry);
      if (signal) {
        entry.aborted = () => forget(entry);
        nativeAdd.call(signal, 'abort', entry.aborted, { once: true });
      }
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      const capture = typeof options === 'boolean' ? options : !!options?.capture;
      const entry = [...entries].find(entry => entry.target === this && entry.type === type && entry.capture === capture && entry.original === callback);
      if (entry) {
        forget(entry);
        nativeRemove.call(this, type, entry.wrapped, options);
      } else nativeRemove.call(this, type, callback, options);
    };

    const NativeWorker = window.Worker;
    const workers = { created: 0, terminated: 0, active: 0 };
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const instance = Reflect.construct(target, args) as Worker;
        workers.created++; workers.active++;
        let ended = false;
        const terminate = instance.terminate.bind(instance);
        instance.terminate = () => {
          terminate();
          if (!ended) { ended = true; workers.active--; workers.terminated++; }
        };
        return instance;
      },
    });
    const nativeRaf = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const pendingRaf = new Set<number>();
    const raf = { scheduled: 0, fired: 0, cancelled: 0 };
    window.requestAnimationFrame = callback => {
      const id = nativeRaf(time => { pendingRaf.delete(id); raf.fired++; callback(time); });
      pendingRaf.add(id); raf.scheduled++;
      return id;
    };
    window.cancelAnimationFrame = id => {
      if (pendingRaf.delete(id)) raf.cancelled++;
      nativeCancel(id);
    };

    type GL = WebGLRenderingContext | WebGL2RenderingContext;
    type GLFacts = { gl: GL; objects: Map<object, string> };
    const contexts = new Map<GL, GLFacts>();
    const gpu = { objectsCreated: 0, objectsDeleted: 0, objectsReleasedByContextLoss: 0 };
    const contextFacts = (gl: GL) => {
      let facts = contexts.get(gl);
      if (!facts) { facts = { gl, objects: new Map() }; contexts.set(gl, facts); }
      return facts;
    };
    const resourceTypes = ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Shader', 'Program', 'VertexArray', 'Sampler', 'Query', 'TransformFeedback'];
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const kind of resourceTypes) {
        for (const prefix of ['create', 'delete']) {
          const key = `${prefix}${kind}`;
          const descriptor = Object.getOwnPropertyDescriptor(proto, key);
          if (!descriptor || typeof descriptor.value !== 'function') continue;
          const original = descriptor.value as (...args: unknown[]) => unknown;
          Object.defineProperty(proto, key, { ...descriptor, value: function (this: GL, ...args: unknown[]) {
            const result = Reflect.apply(original, this, args);
            const facts = contextFacts(this);
            if (prefix === 'create' && result && typeof result === 'object') { facts.objects.set(result, kind); gpu.objectsCreated++; }
            if (prefix === 'delete' && args[0] && typeof args[0] === 'object' && facts.objects.delete(args[0])) gpu.objectsDeleted++;
            return result;
          } });
        }
      }
    }
    (window as unknown as WindowWithProbe).__dominionLifecycleProbe = { read() {
      const byType: Record<string, number> = {};
      for (const entry of entries) {
        const key = `${entry.target === window ? 'window' : 'document'}:${entry.type}:${entry.capture ? 'capture' : 'bubble'}`;
        byType[key] = (byType[key] ?? 0) + 1;
      }
      let contextsActive = 0;
      const active: Record<string, number> = Object.fromEntries(resourceTypes.map(kind => [kind, 0]));
      for (const facts of contexts.values()) {
        if (facts.gl.isContextLost()) {
          // Browser context loss really releases GPU objects. Distinguish this
          // from explicit deletes instead of falsely reporting delete calls.
          gpu.objectsReleasedByContextLoss += facts.objects.size;
          facts.objects.clear();
        } else {
          contextsActive++;
          for (const kind of facts.objects.values()) active[kind] = (active[kind] ?? 0) + 1;
        }
      }
      return {
        workers: { ...workers }, raf: { ...raf, active: pendingRaf.size },
        listeners: { active: entries.size, byType },
        webgl: { contextsCreated: contexts.size, contextsActive, ...gpu, active },
      };
    } };
  });
});
test.afterEach(async ({ page }, info) => {
  if (!page.isClosed()) {
    const last = await probe(page).catch(error => ({ probeReadError: String(error) }));
    await info.attach('last-platform-resource-counts', { contentType: 'application/json', body: Buffer.from(JSON.stringify(last, null, 2)) });
  }
  expect(errors.get(page) ?? []).toEqual([]);
});

const probe = (page: Page) => page.evaluate(() => (window as unknown as WindowWithProbe).__dominionLifecycleProbe.read());

async function closeDrawer(page: Page) {
  if (await button(page, '关闭面板').isVisible()) await button(page, '关闭面板').click();
}

async function rendered(page: Page) {
  await expect(canvas(page)).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'active');
  await expect.poll(async () => Number(await canvas(page).getAttribute('data-frames'))).toBeGreaterThan(0);
  await expect(canvas(page)).toHaveAttribute('data-raf-pending', '0');
}

async function settled(page: Page) {
  await rendered(page);
  await expect.poll(async () => (await probe(page)).workers.active).toBe(0);
  await expect.poll(async () => (await probe(page)).raf.active).toBe(0);
  const value = await probe(page);
  expect(value.webgl.contextsActive).toBe(1);
  expect(value.webgl.active.Buffer).toBeGreaterThan(0);
  expect(value.webgl.active.Program).toBeGreaterThan(0);
  return value;
}

async function record(page: Page): Promise<DominionRecording> {
  await closeDrawer(page);
  await button(page, '工程档案').click();
  const pending = page.waitForEvent('download');
  await button(page, '导出 JSON').click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  const data = JSON.parse(await readFile(path!, 'utf8')) as DominionRecording;
  expect(data.schemaVersion).toBe(4);
  expect(assertDominionInvariants(data.final)).toEqual([]);
  expect(new Set(data.final.actionIds).size).toBe(data.final.actionIds.length);
  return data;
}

async function compare(page: Page) {
  await closeDrawer(page);
  await button(page, '工程档案').click();
  const previous = (await probe(page)).workers.created;
  await button(page, '暂停并比较策略').click();
  await expect(page.locator('[data-branch]')).toHaveCount(2);
  for (const branch of ['a', 'b']) await expect(page.locator(`[data-branch="${branch}"] dl > div`).filter({ has: page.locator('dt', { hasText: '约束违规' }) }).locator('dd')).toHaveText('0');
  await expect.poll(async () => (await probe(page)).workers.active).toBe(0);
  expect((await probe(page)).workers.created).toBe(previous + 1);
  await closeDrawer(page);
}

function noGrowth(current: Probe, ceiling: Probe, label: string) {
  expect(current.workers.active, `${label}: live Worker`).toBe(0);
  expect(current.raf.active, `${label}: scheduled RAF after idle`).toBe(0);
  expect(current.webgl.contextsActive, `${label}: live WebGL contexts`).toBeLessThanOrEqual(ceiling.webgl.contextsActive);
  for (const [kind, count] of Object.entries(current.webgl.active)) expect(count, `${label}: active GL ${kind}`).toBeLessThanOrEqual(ceiling.webgl.active[kind] ?? 0);
  for (const [kind, count] of Object.entries(current.listeners.byType)) {
    // Installed Playwright's InjectedScript._setupGlobalListenersRemovalDetection
    // registers this exact probe lazily. Keep it in the raw ledger, but never
    // attribute a test-harness listener to the application. All other events,
    // including application visibility/pointer/key listeners, retain zero tolerance.
    if (kind === 'window:__playwright_global_listeners_check__:bubble') continue;
    expect(count, `${label}: ${kind} listeners`).toBeLessThanOrEqual(ceiling.listeners.byType[kind] ?? 0);
  }
}

async function attach(info: TestInfo, category: string, samples: unknown[]) {
  await info.attach(`${category}-10-round-resource-ledger`, {
    contentType: 'application/json', body: Buffer.from(JSON.stringify({ category, rounds: 10, samples, excludedFromApplicationGrowthAssertion: ['window:__playwright_global_listeners_check__:bubble (installed Playwright InjectedScript, retained in raw counts)'], boundaries: 'Transparent main-document platform counters; explicit delete and context-loss releases separated. Does not claim JS heap/GC or physical GPU memory measurement.' }, null, 2)),
  });
}

async function openPaused(page: Page) {
  await page.goto(route);
  await expect(page.getByTestId('dominion-map')).toBeVisible();
  await button(page, '三维').click();
  await rendered(page);
  await button(page, '世界设置').click();
  await page.getByLabel('世界场景', { exact: true }).selectOption('supply');
  await button(page, '重置并应用场景').click();
  await button(page, '单步').click();
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  await expect(lab(page)).toHaveAttribute('data-tick', '1');
}

test('DOMINION 生命周期：进入离开旗舰10轮释放3D上下文、Worker、RAF和全局监听', async ({ page }, info) => {
  test.setTimeout(180_000);
  const samples: unknown[] = [], ids = new Set<string>();
  let mountedCeiling: Probe | undefined, unmountedCeiling: Probe | undefined;
  await page.goto(route);
  for (let round = 0; round < 10; round++) {
    await expect(page.getByTestId('dominion-map')).toBeVisible();
    await button(page, '三维').click();
    await rendered(page);
    const id = (await lab(page).getAttribute('data-session-id'))!;
    expect(ids.has(id)).toBe(false); ids.add(id);
    await expect(lab(page)).toHaveAttribute('data-status', 'ready');
    await button(page, '单步').click();
    await compare(page);
    const currentRecord = await record(page);
    expect(currentRecord.final.tick).toBe(1);
    const mounted = await settled(page);
    mountedCeiling ??= mounted;
    noGrowth(mounted, mountedCeiling, `mount ${round + 1}`);
    const previous = await canvas(page).elementHandle();
    await page.getByRole('link', { name: /返回作品集/ }).click();
    await expect(lab(page)).toHaveCount(0);
    await expect.poll(() => previous!.evaluate(element => ({ connected: element.isConnected, lost: (element as HTMLCanvasElement).getContext('webgl2')?.isContextLost() }))).toEqual({ connected: false, lost: true });
    await previous!.dispose();
    await expect.poll(async () => (await probe(page)).webgl.contextsActive).toBe(0);
    await expect.poll(async () => (await probe(page)).raf.active).toBe(0);
    const unmounted = await probe(page);
    unmountedCeiling ??= unmounted;
    noGrowth(unmounted, unmountedCeiling, `unmount ${round + 1}`);
    expect(Object.values(unmounted.webgl.active).every(count => count === 0)).toBe(true);
    samples.push({ round: round + 1, sessionId: id, mounted, unmounted });
    if (round < 9) await page.evaluate(hash => { location.hash = hash; }, route.slice(route.indexOf('#')));
  }
  await attach(info, 'navigation', samples);
});

test('DOMINION 生命周期：体验舱镜头往返10轮资源有界且不推进世界', async ({ page }, info) => {
  test.setTimeout(180_000);
  await openPaused(page);
  const before = await record(page), samples: unknown[] = [];
  let ceiling: Probe | undefined;
  for (let round = 0; round < 10; round++) {
    await button(page, '体验舱').click();
    for (const preset of ['指挥桥', '跟随', '扫描', '靠港', '天体', '全域']) {
      const frames = Number(await canvas(page).getAttribute('data-frames'));
      await button(page, preset).click();
      await expect.poll(async () => Number(await canvas(page).getAttribute('data-frames'))).toBeGreaterThan(frames);
      await expect(button(page, preset)).toHaveAttribute('aria-pressed', 'true');
    }
    await compare(page);
    expect(await record(page)).toEqual(before);
    const current = await settled(page);
    ceiling ??= current; noGrowth(current, ceiling, `camera ${round + 1}`);
    samples.push({ round: round + 1, current });
  }
  await attach(info, 'camera', samples);
});

test('DOMINION 生命周期：切换场景10轮保留合法新会话且不积累渲染资源', async ({ page }, info) => {
  test.setTimeout(180_000);
  await openPaused(page);
  const samples: unknown[] = [], ceilings = new Map<Scenario, Probe>();
  const sequence: Scenario[] = ['supply', 'expedition', 'four-missions', 'sealed', 'competition'];
  let previousId = (await lab(page).getAttribute('data-session-id'))!;
  for (let round = 0; round < 10; round++) {
    const scenario = sequence[round % sequence.length]!;
    await button(page, '世界设置').click();
    await page.getByLabel('世界场景', { exact: true }).selectOption(scenario);
    await button(page, '重置并应用场景').click();
    await expect(lab(page)).toHaveAttribute('data-status', 'ready');
    await expect(lab(page)).not.toHaveAttribute('data-session-id', previousId);
    previousId = (await lab(page).getAttribute('data-session-id'))!;
    await button(page, '单步').click();
    await compare(page);
    const currentRecord = await record(page);
    expect(currentRecord.initial.scenario).toBe(scenario);
    expect(currentRecord.final.tick).toBe(1);
    const current = await settled(page);
    if (!ceilings.has(scenario)) ceilings.set(scenario, current);
    noGrowth(current, ceilings.get(scenario)!, `scenario ${scenario} ${round + 1}`);
    samples.push({ round: round + 1, scenario, current });
  }
  await attach(info, 'scenario', samples);
});

test('DOMINION 生命周期：合法导入回放返回实时10轮无隐写且资源有界', async ({ page }, info) => {
  test.setTimeout(180_000);
  await openPaused(page);
  await button(page, '单步').click();
  await button(page, '单步').click();
  const before = await record(page), samples: unknown[] = [];
  let ceiling: Probe | undefined;
  for (let round = 0; round < 10; round++) {
    await page.getByLabel('导入执行记录', { exact: true }).setInputFiles({ name: `lifecycle-${round}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
    await expect(lab(page)).toHaveAttribute('data-mode', 'history-replay');
    await expect(lab(page)).toHaveAttribute('data-tick', '0');
    await page.getByRole('slider', { name: '历史记录进度' }).fill(String(before.commands.length));
    await expect(lab(page)).toHaveAttribute('data-tick', String(before.final.tick));
    expect(await record(page)).toEqual(before);
    await button(page, '返回实时').click();
    await expect(lab(page)).toHaveAttribute('data-mode', 'local-simulation');
    await compare(page);
    expect(await record(page)).toEqual(before);
    const current = await settled(page);
    ceiling ??= current; noGrowth(current, ceiling, `import ${round + 1}`);
    samples.push({ round: round + 1, current });
  }
  await attach(info, 'import-replay-live', samples);
});

test('DOMINION 生命周期：世界重置10轮清除旧事实并释放每轮Worker', async ({ page }, info) => {
  test.setTimeout(180_000);
  await openPaused(page);
  const samples: unknown[] = [], ids = new Set<string>();
  let ceiling: Probe | undefined;
  for (let round = 0; round < 10; round++) {
    await button(page, '重置世界').click();
    await expect(lab(page)).toHaveAttribute('data-status', 'ready');
    await expect(lab(page)).toHaveAttribute('data-tick', '0');
    const fresh = await record(page);
    expect(ids.has(fresh.final.sessionId)).toBe(false); ids.add(fresh.final.sessionId);
    expect(fresh.commands).toHaveLength(0);
    expect(fresh.events).toHaveLength(0);
    expect(fresh.final.actionIds).toHaveLength(0);
    expect(fresh.final.missions.every(mission => mission.status === 'queued')).toBe(true);
    await button(page, '单步').click();
    await compare(page);
    const stepped = await record(page);
    expect(stepped.final.sessionId).toBe(fresh.final.sessionId);
    expect(stepped.final.tick).toBe(1);
    expect(stepped.commands).toHaveLength(1);
    const current = await settled(page);
    ceiling ??= current; noGrowth(current, ceiling, `reset ${round + 1}`);
    samples.push({ round: round + 1, current });
  }
  await attach(info, 'reset', samples);
});
