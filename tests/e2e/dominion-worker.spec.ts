import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DominionRecording } from '../../packages/intelligence/src/dominion/types';

const lab = (page: Page) => page.getByTestId('dominion-lab');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const route = process.env.DOMINION_E2E_ROUTE ?? '/#/intelligence';
const pageErrors = new WeakMap<Page, string[]>();
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => expect(pageErrors.get(page) ?? []).toEqual([]));

async function closeDrawer(page: Page) {
  const close = button(page, '关闭面板');
  if (await close.isVisible()) await close.click();
}

async function pausedWorld(page: Page) {
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute('data-status', 'ready');
  // Select the scenario explicitly: the product's first-visit default may evolve.
  await button(page, '世界设置').click();
  await page.getByLabel('世界场景', { exact: true }).selectOption('supply');
  await button(page, '重置并应用场景').click();
  await button(page, '单步').click();
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  await expect(lab(page)).toHaveAttribute('data-tick', '1');
  await button(page, '工程档案').click();
}

async function record(page: Page): Promise<DominionRecording> {
  await closeDrawer(page);
  await button(page, '工程档案').click();
  const pending = page.waitForEvent('download');
  await button(page, '导出 JSON').click();
  const path = await (await pending).path();
  expect(path).not.toBeNull();
  return JSON.parse(await readFile(path!, 'utf8')) as DominionRecording;
}

async function startComparison(page: Page) {
  await closeDrawer(page);
  await button(page, '工程档案').click();
  await button(page, '暂停并比较策略').click();
}

async function realResults(page: Page, expectedCompleted = 1) {
  for (const id of ['a', 'b']) {
    const branch = page.locator(`[data-branch="${id}"]`);
    await expect(branch).toBeVisible();
    await expect(branch.locator('h3')).toHaveText(`${expectedCompleted}项任务完成`);
    await expect(branch.locator('dl > div').filter({ has: page.locator('dt', { hasText: '约束违规' }) }).locator('dd')).toHaveText('0');
    await expect(branch.locator('dl > div').filter({ has: page.locator('dt', { hasText: '失败 / 超期' }) }).locator('dd')).toHaveText('0 / 0');
    await expect.poll(() => branch.locator('[data-trace-ship]').count()).toBeGreaterThan(0);
    await expect(branch.getByRole('button', { name: /^采用/ })).toBeEnabled();
  }
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  await expect(lab(page)).toHaveAttribute('data-completed', '0');
}

for (const fault of ['constructor', 'postMessage'] as const) {
  test(`DOMINION Worker ${fault} 同步失败保留源记录，重试获得真实分支与航迹`, async ({ page }) => {
    await page.addInitScript(({ fault }) => {
      const NativeWorker = window.Worker;
      let injected = false;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args) {
          if (String(args[0]).includes('dominion.worker') && !injected) {
            injected = true;
            if (fault === 'constructor') {
              console.info('DOMINION_PLATFORM_FAILURE');
              throw new DOMException('Injected construction failure', 'SecurityError');
            }
            const instance = Reflect.construct(target, args) as Worker;
            instance.postMessage = () => {
              console.info('DOMINION_PLATFORM_FAILURE');
              throw new DOMException('Injected postMessage failure', 'DataCloneError');
            };
            return instance;
          }
          return Reflect.construct(target, args) as Worker;
        },
      });
    }, { fault });
    await pausedWorld(page);
    const before = await record(page);
    const injected = page.waitForEvent('console', { predicate: m => m.text() === 'DOMINION_PLATFORM_FAILURE' });
    await startComparison(page);
    await injected;
    await expect(page.locator('.dom-notice')).toContainText('无法启动分支计算');
    await expect(button(page, '从当前暂停快照计算')).toBeEnabled();
    await expect(page.locator('[data-branch]')).toHaveCount(0);
    expect(await record(page)).toEqual(before);
    const native = page.waitForEvent('worker', { predicate: worker => worker.url().includes('dominion.worker') });
    await startComparison(page);
    expect((await native).url()).toContain('dominion.worker');
    await realResults(page);
    expect(await record(page)).toEqual(before);
  });
}

for (const changedField of ['generation', 'sourceKey'] as const) {
  test(`DOMINION 忽略错误 ${changedField} 响应，随后接受同一个真实 Worker 的匹配结果`, async ({ page }) => {
    await page.addInitScript(({ changedField }) => {
      const NativeWorker = window.Worker;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args) {
          const instance = Reflect.construct(target, args) as Worker;
          if (!String(args[0]).includes('dominion.worker')) return instance;
          const nativePost = instance.postMessage.bind(instance);
          instance.postMessage = (message: unknown) => {
            const handler = instance.onmessage;
            instance.onmessage = event => {
              const data = { ...event.data } as { generation: number; sourceKey: string };
              if (changedField === 'generation') data.generation--;
              else data.sourceKey += '-old-world-version';
              handler?.call(instance, new MessageEvent('message', { data }));
              console.info('DOMINION_INVALID_ENVELOPE_DELIVERED');
              // Retain the actual native response; no branch facts are fabricated.
              setTimeout(() => handler?.call(instance, event), 700);
            };
            nativePost(message);
          };
          return instance;
        },
      });
    }, { changedField });
    await pausedWorld(page);
    const before = await record(page);
    const invalid = page.waitForEvent('console', { predicate: m => m.text() === 'DOMINION_INVALID_ENVELOPE_DELIVERED' });
    await startComparison(page);
    await invalid;
    await expect(page.locator('[data-branch]')).toHaveCount(0);
    await expect(button(page, '正在计算两条未来…')).toBeDisabled();
    await realResults(page);
    expect(await record(page)).toEqual(before);
  });
}

test('DOMINION Worker 拒绝请求内过期worldVersion，保留源世界并可重新实算', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let injected = false;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const instance = Reflect.construct(target, args) as Worker;
        if (!String(args[0]).includes('dominion.worker') || injected) return instance;
        injected = true;
        const nativePost = instance.postMessage.bind(instance);
        instance.postMessage = (message: unknown) => {
          const request = structuredClone(message) as { snapshot: { worldVersion: number } };
          request.snapshot.worldVersion++;
          console.info('DOMINION_REQUEST_WORLD_VERSION_CHANGED');
          // The request retains its original sourceKey. The actual bundled
          // Worker must detect this mismatch before computing a branch.
          nativePost(request);
        };
        return instance;
      },
    });
  });
  await pausedWorld(page);
  const before = await record(page);
  const injected = page.waitForEvent('console', { predicate: m => m.text() === 'DOMINION_REQUEST_WORLD_VERSION_CHANGED' });
  await startComparison(page);
  await injected;
  await expect(page.locator('.dom-notice')).toContainText('分支源快照与请求版本不一致');
  await expect(page.locator('[data-branch]')).toHaveCount(0);
  await expect(button(page, '从当前暂停快照计算')).toBeEnabled();
  expect(await record(page)).toEqual(before);
  await startComparison(page);
  await realResults(page);
  expect(await record(page)).toEqual(before);
});

for (const intervention of ['reset', 'scenario', 'cancel'] as const) {
  test(`DOMINION ${intervention} 后旧 Worker 的迟到结果和错误不污染新世界或终止新比较`, async ({ page }) => {
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      let count = 0;
      let oldWorker: Worker | undefined;
      let oldMessage: Worker['onmessage'];
      let oldError: Worker['onerror'];
      let oldEvent: MessageEvent | undefined;
      window.Worker = new Proxy(NativeWorker, {
        construct(target, args) {
          const instance = Reflect.construct(target, args) as Worker;
          if (!String(args[0]).includes('dominion.worker')) return instance;
          count++;
          const ordinal = count;
          const nativePost = instance.postMessage.bind(instance);
          instance.postMessage = (message: unknown) => {
            if (ordinal === 1) {
              oldWorker = instance;
              oldMessage = instance.onmessage;
              oldError = instance.onerror;
              instance.onmessage = event => {
                oldEvent = event;
                console.info('DOMINION_OLD_NATIVE_RESULT_HELD');
              };
              nativePost(message);
            } else {
              if (!oldWorker || !oldMessage || !oldError || !oldEvent) throw Error('Missing held native Worker callbacks');
              oldMessage.call(oldWorker, oldEvent);
              oldError.call(oldWorker, new ErrorEvent('error', { message: 'Queued error from a terminated Worker' }));
              console.info('DOMINION_STALE_CALLBACKS_DELIVERED');
              setTimeout(() => nativePost(message), 100);
            }
          };
          return instance;
        },
      });
    });
    await pausedWorld(page);
    const original = await record(page);
    const held = page.waitForEvent('console', { predicate: m => m.text() === 'DOMINION_OLD_NATIVE_RESULT_HELD' });
    const started = page.waitForEvent('worker', { predicate: worker => worker.url().includes('dominion.worker') });
    await startComparison(page);
    const first = await started;
    await held;
    await expect(page.locator('[data-branch]')).toHaveCount(0);
    const closed = first.waitForEvent('close');
    await closeDrawer(page);
    if (intervention === 'cancel') {
      await button(page, '任务编排').click();
      await page.locator('[data-mission-id="mission-1"]').click();
      await button(page, '取消任务').click();
      await expect(page.locator('[data-mission-id="mission-1"]')).toHaveAttribute('data-mission-status', 'cancelled');
      // Create a new real task through the visible task form, so the replacement
      // Worker has an independently checkable successful journey to compute.
      await page.getByText('添加沙箱任务', { exact: true }).click();
      await button(page, '提交任务').click();
    } else {
      await button(page, '世界设置').click();
      await page.getByLabel('世界场景', { exact: true }).selectOption(intervention === 'scenario' ? 'expedition' : 'supply');
      await button(page, '重置并应用场景').click();
      await expect(lab(page)).toHaveAttribute('data-status', 'ready');
      await expect(lab(page)).not.toHaveAttribute('data-session-id', original.initial.sessionId);
      await button(page, '单步').click();
    }
    await closed;
    const beforeNewComparison = await record(page);
    const stale = page.waitForEvent('console', { predicate: m => m.text() === 'DOMINION_STALE_CALLBACKS_DELIVERED' });
    await startComparison(page);
    await stale;
    await realResults(page, intervention === 'scenario' ? 2 : 1);
    await expect(page.locator('.dom-notice')).not.toContainText('分支计算异常');
    expect(await record(page)).toEqual(beforeNewComparison);
    if (intervention === 'cancel') expect(beforeNewComparison.final.missions[0].status).toBe('cancelled');
  });
}

test('DOMINION 真实 WebGL context loss 后二维保留世界，恢复三维并继续单步', async ({ page }) => {
  await pausedWorld(page);
  // Reduced motion intentionally starts in 2D. A real user opts into 3D before
  // we require and lose an actual WebGL context.
  await button(page, '三维').click();
  const canvas = page.locator('canvas[data-dominion-canvas]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'active');
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(0);
  const before = await record(page);
  const firstRenderer = await canvas.getAttribute('data-dominion-canvas');
  // This evaluation touches only the standard WebGL failure API, not application state.
  const supported = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(supported, 'Chrome must exercise actual context loss, not skip the assertion').toBe(true);
  await expect(page.getByTestId('dominion-map')).toBeVisible();
  await expect(canvas).toHaveCount(0);
  expect(await record(page)).toEqual(before);
  await button(page, '三维').click();
  await expect(canvas).toBeVisible();
  await expect(canvas).not.toHaveAttribute('data-dominion-canvas', firstRenderer!);
  await expect(canvas).toHaveAttribute('data-rendering', 'active');
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(0);
  expect(await record(page)).toEqual(before);
  await button(page, '单步').click();
  await expect(lab(page)).toHaveAttribute('data-tick', '2');
  await expect(canvas).toHaveAttribute('data-tick', '2');
  const after = await record(page);
  expect(after.final.sessionId).toBe(before.final.sessionId);
  expect(after.commands).toHaveLength(before.commands.length + 1);
});

test('DOMINION 场景资源加载失败保留可操作二维世界并可重试资源', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let failedRequests = 0;
  await page.route(/\/.*DominionScene[^/]*\.(?:js|vue)(?:\?.*)?$/, async route => {
    if (failedRequests++ === 0) await route.abort('failed');
    else await route.continue();
  });
  await page.goto(route);
  await expect(page.getByTestId('dominion-map')).toBeVisible();
  expect(failedRequests).toBeGreaterThan(0);
  await expect(page.locator('.dom-notice')).toContainText('三维资源加载失败');
  await expect(lab(page)).toHaveAttribute('data-status', 'ready');
  await button(page, '单步').click();
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  const before = await record(page);
  await button(page, '三维').click();
  const canvas = page.locator('canvas[data-dominion-canvas]');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rendering', 'active');
  await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(0);
  expect(await record(page)).toEqual(before);
});
