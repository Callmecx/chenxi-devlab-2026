import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertDominionInvariants } from '../../packages/intelligence/src/dominion/invariants';
import { validateRecording } from '../../packages/intelligence/src/dominion/recording';
import type { DominionRecording, Scenario } from '../../packages/intelligence/src/dominion/types';

const path = process.env.DOMINION_E2E_ROUTE ?? '/#/intelligence';
const lab = (p: Page) => p.getByTestId('dominion-lab');
const button = (p: Page, name: string) => p.getByRole('button', { name, exact: true });
const canvas = (p: Page) => p.locator('canvas[data-dominion-canvas]');
const errors = new WeakMap<Page, string[]>();
const screenshotDir = resolve('.local/v4/browser');
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeAll(async () => { await mkdir(screenshotDir, { recursive: true }); });
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); });
test.afterEach(({ page }) => { expect(errors.get(page) ?? []).toEqual([]); });

async function open(p: Page, flat = true) {
  if (flat) await p.emulateMedia({ reducedMotion: 'reduce' });
  await p.goto(path);
  await expect(lab(p)).toHaveAttribute('data-status', 'ready');
  await expect(button(p, '启动远征')).toBeEnabled();
}
async function close(p: Page) { if (await button(p, '关闭面板').isVisible()) await button(p, '关闭面板').click(); }
async function view(p: Page, name: string) { await close(p); await p.getByRole('navigation', { name: '工作视图' }).getByRole('button', { name, exact: true }).click(); }
async function scenario(p: Page, name: Scenario) {
  await close(p); await button(p, '世界设置').click();
  await p.getByRole('combobox', { name: '世界场景', exact: true }).selectOption(name);
  await button(p, '重置并应用场景').click();
  await expect(lab(p)).toHaveAttribute('data-tick', '0');
}
async function record(p: Page): Promise<DominionRecording> {
  await view(p, '工程档案');
  const pending = p.waitForEvent('download');
  await button(p, '导出 JSON').click();
  const download = await pending, file = await download.path();
  expect(file).not.toBeNull();
  return JSON.parse(await readFile(file!, 'utf8')) as DominionRecording;
}
async function run(p: Page, expected: number) {
  await close(p);
  await p.getByRole('combobox', { name: '运行速度', exact: true }).selectOption('4');
  await button(p, await lab(p).getAttribute('data-status') === 'ready' ? '启动远征' : '继续远征').click();
  await expect(lab(p)).toHaveAttribute('data-completed', String(expected), { timeout: 35000 });
  await expect(lab(p)).toHaveAttribute('data-status', 'paused');
}
async function selectLane(p: Page, laneId: string) {
  await close(p); await button(p, '查看世界对象').click();
  const list = p.locator('.dom-object-list');
  if (!(await list.isVisible())) await p.getByText('选择站点、舰船与航道', { exact: true }).click();
  await list.locator(`[data-lane-id="${laneId}"]`).click();
}

test('DOMINION B01 actual supply, inspect, ledger, result and fresh session reset', async ({ page }) => {
  await open(page); await scenario(page, 'supply');
  const session = await lab(page).getAttribute('data-session-id');
  await button(page, '查看世界对象').click();
  await page.locator('.dom-object-list [data-ship-id="transport-a"]').click();
  await expect(page.getByRole('dialog', { name: '世界对象' })).toContainText('方舟 1');
  await close(page); await run(page, 1);
  const r = await record(page);
  expect(r.final.missions[0].delivered).toMatchObject({ energy: 3, supplies: 2 });
  expect(r.final.stations.find(s => s.id === 'ice')!.stock).toMatchObject({ energy: 3, supplies: 2 });
  expect(assertDominionInvariants(r.final)).toEqual([]);
  expect(validateRecording(r).recording.final).toEqual(r.final);
  await page.screenshot({ path: resolve(screenshotDir, 'supply-result.png'), fullPage: true });
  await button(page, '重置世界').click();
  await expect(lab(page)).not.toHaveAttribute('data-session-id', session!);
  await expect(lab(page)).toHaveAttribute('data-status', 'ready');
  await expect(lab(page)).toHaveAttribute('data-completed', '0');
});

test('DOMINION B02/B04 four tasks share six eligible ships; scan repair rescue and samples leave facts', async ({ page }) => {
  test.setTimeout(65000);
  await open(page); await scenario(page, 'four-missions');
  await view(page, '任务编排');
  await expect(page.locator('.dom-mission-tabs [data-mission-id]')).toHaveCount(4);
  await run(page, 4);
  const r = await record(page), end = r.final;
  expect(end.ships).toHaveLength(6); expect(end.missions.every(m => m.status === 'completed')).toBe(true);
  expect(end.ledger.consumed.parts).toBe(3);
  expect(end.discoveries.map(d => d.kind).sort()).toEqual(['damage','samples']);
  expect(end.stations.find(s => s.id === 'lab')!.stock).toMatchObject({ supplies: 2, samples: 2 });
  expect(r.events.some(e => e.type === 'ship.rescued')).toBe(true);
  expect(r.events.some(e => e.type === 'relay.repaired')).toBe(true);
  const assignments = r.events.filter(e => e.type === 'task.assigned');
  expect(new Set(assignments.map(e => e.payload.role))).toEqual(new Set(['survey','repair','transport']));
  expect(assertDominionInvariants(end)).toEqual([]);
  await view(page, '舰队协同');
  await expect(page.locator('.dom-ship-card')).toHaveCount(6);
  await expect(lab(page)).toHaveAttribute('data-completed', '4');
  await view(page, '任务编排');
  await expect(page.locator('[data-mission-status="completed"]')).toHaveCount(4);
});

test('DOMINION B03 future closure causes real alternate departures; unavailable paths require new attempt', async ({ page }) => {
  await open(page); await scenario(page, 'supply');
  await button(page, '单步').click();
  const before = await record(page);
  await selectLane(page, 'gate-ice'); await button(page, '关闭这条航道').click(); await close(page);
  await run(page, 1);
  const rerouted = await record(page);
  expect(rerouted.final.worldVersion).toBeGreaterThan(before.final.worldVersion);
  expect(rerouted.events.filter(e => e.type === 'ship.departed').map(e => e.payload.laneId)).not.toContain('gate-ice');
  expect(rerouted.events.some(e => e.type === 'ship.departed' && e.payload.laneId === 'silo-beacon')).toBe(true);
  await scenario(page, 'sealed'); await button(page, '启动远征').click();
  await expect(page.locator('.dom-failure-strip')).toContainText('UNREACHABLE');
  const failed = await record(page); expect(failed.final.missions[0].attempt).toBe(1);
  await button(page, '世界设置').click(); await button(page, '重新开放所有航道').click(); await close(page);
  await button(page, '重试 深空常规补给').click();
  await expect(lab(page)).toHaveAttribute('data-completed', '1', { timeout: 25000 });
  const recovered = await record(page);
  expect(recovered.final.sessionId).toBe(failed.final.sessionId);
  expect(recovered.final.missions[0].attempts.map(a => a.outcome)).toEqual(['failed','completed']);
  expect(recovered.final.missions[0].delivered.supplies).toBe(2);
});

test('DOMINION B06 isolated strategies retain paused facts and adoption changes only future policy', async ({ page }) => {
  await open(page); await scenario(page, 'supply'); await button(page, '单步').click();
  const before = await record(page); await button(page, '暂停并比较策略').click();
  for (const key of ['a','b']) {
    const branch = page.locator(`[data-branch="${key}"]`);
    await expect(branch).toContainText('1项任务完成');
    await expect(branch.locator('dl > div').filter({ has: page.locator('dt', { hasText: '约束违规' }) }).locator('dd')).toHaveText('0');
    await expect(branch.locator('svg')).toBeVisible();
  }
  await expect(lab(page)).toHaveAttribute('data-tick', String(before.final.tick));
  await expect(lab(page)).toHaveAttribute('data-completed', '0');
  await button(page, '采用能耗优先').click();
  const adopted = await record(page);
  expect(adopted.final.strategy).toBe('energy');
  expect(adopted.final.tick).toBe(before.final.tick);
  expect(adopted.final.ships.map(s => ({ node: s.nodeId, transit: s.transit, cargo: s.cargo, energy: s.energy }))).toEqual(before.final.ships.map(s => ({ node: s.nodeId, transit: s.transit, cargo: s.cargo, energy: s.energy })));
  await run(page, 1);
});

test('DOMINION B07 immutable replay seek and rejected JSON preserve authoritative live facts', async ({ page }) => {
  await open(page); await scenario(page, 'supply'); await run(page, 1);
  const before = await record(page);
  await page.getByLabel('导入执行记录', { exact: true }).setInputFiles({ name: 'corrupt.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":4,"commands":[]}') });
  await expect(page.locator('.dom-notice')).toContainText('导入拒绝');
  expect(await record(page)).toEqual(before);
  const network: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/') || r.method() !== 'GET') network.push(r.url()); });
  await button(page, '回放记录').click();
  await expect(lab(page)).toHaveAttribute('data-mode', 'history-replay');
  await expect(lab(page)).toHaveAttribute('data-tick', '0');
  await button(page, '回放单步').click();
  const range = page.getByRole('slider', { name: '历史记录进度' });
  await range.fill((await range.getAttribute('max'))!);
  await expect(lab(page)).toHaveAttribute('data-completed', '1');
  await range.fill('0'); await expect(lab(page)).toHaveAttribute('data-completed', '0');
  expect(await record(page)).toEqual(before);
  await button(page, '返回实时').click(); expect(await record(page)).toEqual(before);
  await page.getByLabel('导入执行记录', { exact: true }).setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
  await expect(lab(page)).toHaveAttribute('data-mode', 'history-replay');
  expect(await record(page)).toEqual(before);
  expect(network).toEqual([]);
});

test('DOMINION B08 communication reconnect and keyboard object control preserve one session', async ({ page }) => {
  await open(page); await scenario(page, 'supply'); await button(page, '单步').click();
  const session = await lab(page).getAttribute('data-session-id');
  await view(page, '全息星图');
  const route = page.getByRole('button', { name: '航道 gate-ice 可通行', exact: true });
  await route.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '世界对象' })).toBeVisible();
  await page.keyboard.press('Escape');
  await button(page, '世界设置').click(); await button(page, '模拟断开观测链路').click();
  await expect(lab(page)).toHaveAttribute('data-connected', 'false');
  await close(page); await expect(button(page, '单步')).toBeDisabled();
  await button(page, '世界设置').click(); await button(page, '重连并同步快照').click(); await close(page);
  await expect(lab(page)).toHaveAttribute('data-status', 'paused');
  await expect(lab(page)).toHaveAttribute('data-session-id', session!);
  await expect(lab(page)).toHaveAttribute('data-tick', '1');
  await run(page, 1);
});

for (const width of [360,390,768,1440,1920]) {
  test(`DOMINION B08 ${width}px responsive fallback has accessible actions and no page overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await open(page);
    await expect(page.getByTestId('dominion-map')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    await button(page, '启动远征').click();
    await expect(lab(page)).toHaveAttribute('data-status', 'running');
    await button(page, '暂停世界').click();
    await expect(lab(page)).toHaveAttribute('data-status', 'paused');
    await button(page, '世界设置').click();
    await expect(page.getByRole('dialog', { name: '世界设置' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(button(page, '世界设置')).toBeFocused();
    await page.screenshot({ path: resolve(screenshotDir, `${width}-reduced.png`), fullPage: true });
  });
}

test('DOMINION B05 distinct actual camera modes preserve the exact same paused world', async ({ page }) => {
  test.setTimeout(70000);
  await open(page); await scenario(page, 'supply');
  await button(page, '单步').click(); const before = await record(page);
  await view(page, '指挥中枢');
  await button(page, '三维').click();
  for (const [mode, id] of [['跟随','follow'],['指挥桥','cockpit'],['靠港','docking'],['天体','planet'],['扫描','scan'],['全域','overview']]) {
    await page.locator('.dom-camera-bar').getByRole('button', { name: mode, exact: true }).click();
    await expect(canvas(page)).toBeVisible();
    await expect(canvas(page)).toHaveAttribute('data-rendering', 'active');
    await expect(canvas(page)).toHaveAttribute('data-camera', id);
    await expect(canvas(page)).toHaveAttribute('data-bridge', id === 'cockpit' ? 'visible' : 'hidden');
    await expect(lab(page)).toHaveAttribute('data-tick', String(before.final.tick));
    await page.screenshot({ path: resolve(screenshotDir, `camera-${mode}.png`) });
  }
  await button(page, '二维').click(); await expect(page.getByTestId('dominion-map')).toBeVisible();
  await button(page, '三维').click(); await expect(canvas(page)).toBeVisible();
  const after = await record(page); expect(after).toEqual(before);
});
