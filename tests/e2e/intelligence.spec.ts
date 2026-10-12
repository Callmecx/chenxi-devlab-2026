import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const screenshots = resolve('.local/qa/intelligence-screenshots');
test.use({ viewport: { width: 1440, height: 1000 } });
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', error => errors.push(error.message)); });
test.afterEach(({ page }) => { expect(pageErrors.get(page) ?? []).toEqual([]); });
const stage = (page: Page) => page.locator('.il-stage');
const message = (page: Page) => page.locator('.il-message');
const writes = (page: Page) => page.locator('.il-node-detail dl').getByText(/次（隔离本地状态）/);
const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^坐标 ${x},${y} `) });
async function capture(page: Page, name: string, fullPage = true) {
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: resolve(screenshots, name), fullPage });
}
async function status(page: Page, value: string) { await expect(stage(page)).toHaveAttribute('data-status', value); }
async function step(page: Page) {
  const button = page.getByRole('button', { name: '单步', exact: true });
  await button.click();
  await expect(page.getByRole('button', { name: '生成计划', includeHidden: true })).toBeEnabled();
}
async function twoD(page: Page) {
  const button = page.getByRole('button', { name: '二维视图', exact: true });
  if (await button.isVisible()) await button.click();
}
async function openConfig(page: Page) {
  const toggle = page.getByRole('button', { name: '展开任务配置', exact: true });
  if (await toggle.isVisible()) await toggle.click();
}
async function prepare(page: Page, preset: '商品研究' | '活动助理' | '仓库取送' = '商品研究') {
  await page.goto('/#/intelligence/tasks');
  await expect(page.getByRole('heading', { name: '让智能，在行动中演化。' })).toBeVisible();
  await openConfig(page);
  await page.getByRole('button', { name: preset, exact: true }).click();
  await page.getByRole('combobox', { name: '速度', exact: true }).selectOption('4');
  await twoD(page);
  await status(page, 'running');
}
async function runToApproval(page: Page) {
  await page.getByRole('button', { name: '连续执行' }).click();
  await status(page, 'waiting-approval');
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
}
async function failureControl(page: Page) {
  await page.getByText('验证异常与恢复', { exact: true }).click();
  return page.getByLabel('下一工具注入');
}
test.beforeAll(async () => { await mkdir(screenshots, { recursive: true }); });

test('商品流程：真实查询比较、节点参数来源、审批后单次写入、实时时间线', async ({ page }) => {
  await prepare(page);
  await runToApproval(page);
  await page.locator('.il-node-list').getByRole('button', { name: /按预算与数量比较/ }).click();
  await expect(page.locator('.il-node-detail')).toContainText('note-book');
  await expect(page.locator('.il-node-detail')).toContainText('9800');
  await expect(page.locator('.il-node-detail')).toContainText('synthetic-catalog');
  await expect(page.locator('.il-timeline')).toContainText('tool.completed');
  await page.getByRole('button', { name: '批准', exact: true }).click();
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
  await step(page); await status(page, 'succeeded');
  await expect(writes(page)).toHaveText('1 次（隔离本地状态）');
  await expect(page.getByRole('button', { name: '单步', exact: true })).toBeDisabled();
  await page.locator('.il-node-list').getByRole('button', { name: /人工审批后本地写入/ }).click();
  await expect(page.locator('.il-node-detail')).toContainText('saved-listing');
});

test('活动流程：指定场次人数、确认一次隔离预约并显示真实剩余名额', async ({ page }) => {
  await prepare(page, '活动助理');
  await page.getByLabel('场次筛选').fill('slot-print');
  await page.getByLabel('人数', { exact: true }).fill('2');
  await page.getByRole('button', { name: '生成计划' }).click();
  await runToApproval(page);
  await page.getByRole('button', { name: '批准', exact: true }).click();
  await step(page); await status(page, 'succeeded');
  await page.locator('.il-node-list').getByRole('button', { name: /人工审批后本地写入/ }).click();
  await expect(page.locator('.il-node-detail')).toContainText('confirmed-local-booking');
  await expect(page.locator('.il-node-detail')).toContainText('"remainingSeats": 2');
  await expect(writes(page)).toHaveText('1 次（隔离本地状态）');
});

test('商品与活动人工拒绝均保持零写入', async ({ page }) => {
  await prepare(page);
  for (const preset of ['商品研究', '活动助理'] as const) {
    await page.getByRole('button', { name: preset, exact: true }).click();
    await runToApproval(page);
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await status(page, 'cancelled');
    await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
    await expect(message(page)).toContainText('未执行任何确认写入');
    await expect(page.getByRole('button', { name: '单步', exact: true })).toBeDisabled();
  }
});

test('预算不足明确失败，修改结构化预算重新规划可恢复', async ({ page }) => {
  await prepare(page);
  await page.getByLabel('预算（元）').fill('1');
  await page.getByRole('button', { name: '生成计划' }).click();
  await page.getByRole('button', { name: '连续执行' }).click();
  await status(page, 'failed');
  await expect(page.locator('.il-clarification')).toContainText('没有可行组合');
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
  await page.getByLabel('预算（元）').fill('500');
  await page.getByRole('button', { name: '按当前目标重新规划' }).click();
  await runToApproval(page);
});

test('超时失败与解除故障重试；在途取消不会被迟到响应改回运行', async ({ page }) => {
  await prepare(page);
  const fault = await failureControl(page);
  await fault.selectOption('timeout');
  await step(page); await status(page, 'failed');
  await expect(message(page)).toContainText('超时');
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
  await fault.selectOption('none'); await page.getByRole('button', { name: '重试失败步骤' }).click();
  await runToApproval(page);
  await page.getByRole('button', { name: '批准', exact: true }).click();
  await fault.selectOption('timeout');
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await status(page, 'cancelled');
  // Wait on the real in-flight tool's completion via its disabled UI, not a private runtime handle.
  await expect(page.getByRole('button', { name: '生成计划' })).toBeEnabled();
  await status(page, 'cancelled');
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
});

test('不完整结果被拒绝，重新查询后可以生成草稿', async ({ page }) => {
  await prepare(page); const fault = await failureControl(page);
  await fault.selectOption('partial'); await step(page);
  await fault.selectOption('none'); await step(page); await status(page, 'failed');
  await expect(message(page)).toContainText('查询结果不完整');
  await page.getByRole('button', { name: '重试失败步骤' }).click();
  await runToApproval(page);
});

test('仓库旧路径因新障碍失效，真实重规划后完成三货投递', async ({ page }) => {
  test.setTimeout(90000);
  await prepare(page, '仓库取送');
  await step(page);
  const next = page.locator('.il-world-grid .cell-path').first();
  const label = await next.getAttribute('aria-label'); expect(label).toBeTruthy();
  await next.click(); await status(page, 'replanning');
  await expect(page.locator('.il-stage-bottom')).toContainText('WORLD v2');
  await expect(page.locator('.il-world-grid .cell-path')).toHaveCount(0);
  await step(page);
  await expect(page.locator('.il-world-tools')).toContainText('重规划 1');
  await expect(page.getByRole('button', { name: label!.replace('path', 'obstacle'), exact: true })).toBeVisible();
  await capture(page, 'warehouse-detour-1440.png');
  await page.getByRole('button', { name: '连续执行' }).click();
  await expect(stage(page)).toHaveAttribute('data-status', 'succeeded', { timeout: 70000 });
  await expect(page.locator('.il-stage-bottom')).toContainText('3 / 3 送达');
  await expect(page.locator('.il-cargo-list')).toContainText('已送达');
  await expect(message(page)).toContainText('均已实际到达目标');
});

test('仓库全封闭明确不可达，打开通道后恢复真实移动', async ({ page }) => {
  await prepare(page, '仓库取送');
  for (const [x, y] of [[0, 1], [2, 1], [1, 0], [1, 2]]) await cell(page, x!, y!).click();
  await step(page); await status(page, 'failed');
  await expect(message(page)).toContainText('不可达');
  await expect(cell(page, 1, 1)).toHaveClass('cell-robot');
  await capture(page, 'warehouse-unreachable-1440.png');
  await cell(page, 2, 1).click(); await status(page, 'replanning');
  await step(page); await step(page);
  await expect(cell(page, 2, 1)).toHaveClass('cell-robot');
  await expect(page.locator('.il-world-tools')).toContainText('移动 1');
});

test('世界目标变化和缺货物在UI中产生新版本与明确失败', async ({ page }) => {
  await prepare(page, '仓库取送'); await step(page);
  await page.getByLabel('点击地图').selectOption('target'); await cell(page, 0, 7).click();
  await expect(cell(page, 0, 7)).toHaveClass('cell-target');
  await expect(page.locator('.il-stage-bottom')).toContainText('WORLD v2');
  await expect(page.locator('.il-world-grid .cell-path')).toHaveCount(0);
  await page.getByRole('button', { name: '移除货物', exact: true }).nth(1).click(); await step(page);
  await status(page, 'failed'); await expect(message(page)).toContainText('货物已不存在');
});

test('保存、JSON导出、载入、单步和seek均投影历史；回放不提供批准或新增写入', async ({ page }) => {
  await prepare(page); await runToApproval(page);
  await page.getByRole('button', { name: '批准', exact: true }).click(); await step(page);
  await status(page, 'succeeded'); await expect(writes(page)).toHaveText('1 次（隔离本地状态）');
  await page.getByRole('button', { name: '保存本次运行' }).click();
  await expect(page.getByRole('status')).toContainText('已保存');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 JSON' }).click();
  const file = await download;
  const path = await file.path(); expect(path).toBeTruthy();
  const record = JSON.parse(await readFile(path!, 'utf8')) as { events: Array<{ seq: number; snapshot: { writes: number } }>; seed: number; input: { seed: number } };
  expect(record.events.length).toBeGreaterThan(8); expect(record.seed).toBe(record.input.seed);
  await page.getByRole('button', { name: '载入上次记录' }).click();
  await expect(page.locator('.il-mode')).toContainText('历史回放');
  await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
  await step(page);
  await expect(page.locator('.il-seek')).toContainText(`事件 2 / ${record.events.length}`);
  const slider = page.getByRole('slider');
  await slider.fill(String(record.events.length - 1));
  await expect(writes(page)).toHaveText('1 次（隔离本地状态）');
  await expect(page.getByRole('button', { name: '批准', exact: true })).toHaveCount(0);
  await slider.fill('0'); await expect(writes(page)).toHaveText('0 次（隔离本地状态）');
  const replayDownload = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON' }).click();
  const replayPath = await (await replayDownload).path();
  // Save and export are separate artifact creation operations; their createdAt can differ.
  // Every actual event and snapshot must nevertheless be identical after seeking.
  expect(JSON.parse(await readFile(replayPath!, 'utf8'))).toMatchObject({ events: record.events, input: record.input, seed: record.seed });
});

test('3D真实canvas、减弱动效保留流程、可切二维；WebGL context loss自动降级保留任务', async ({ page }) => {
  await page.goto('/#/intelligence/tasks');
  const canvas = page.locator('[data-testid="intelligence-scene"] canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: '工程视图', exact: true }).click();
  await page.getByLabel('减弱动效（保留完整操作）').check();
  await page.getByRole('button', { name: '商品研究', exact: true }).click();
  await step(page);
  await expect(page.locator('.il-node-list [data-node-status="succeeded"]')).toHaveCount(1);
  await twoD(page); await expect(canvas).toHaveCount(0);
  await page.getByRole('button', { name: '启用 3D', exact: true }).click(); await expect(canvas).toBeVisible();
  const lost = await canvas.evaluate(element => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext(); return true;
  });
  expect(lost).toBe(true);
  await expect(page.getByRole('status')).toContainText('WebGL 上下文丢失');
  await expect(page.getByRole('button', { name: '启用 3D', exact: true })).toBeVisible();
  await expect(page.locator('.il-node-list [data-node-status="succeeded"]')).toHaveCount(1);
});

for (const width of [390, 1440]) {
  test(`${width}px布局截图：入口、真实任务详情和二维仓库均无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/#/intelligence/tasks');
    if (width <= 740) {
      await expect(page.locator('.il-flat-graph')).toBeVisible();
      expect(await page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('IntelligenceScene-') && entry.name.endsWith('.js')))).toBe(false);
      await page.getByRole('button', { name: '启用 3D', exact: true }).click();
    }
    await expect(page.locator('[data-testid="intelligence-scene"] canvas')).toBeVisible();
    const canvasBox = await page.locator('[data-testid="intelligence-scene"] canvas').boundingBox();
    const controlsBox = await page.locator('.il-controls').boundingBox();
    expect(canvasBox!.y + canvasBox!.height, '3D canvas must remain inside the stage and not overlap execution controls').toBeLessThanOrEqual(controlsBox!.y + 1);
    await expect(page.locator('.il-mode')).toContainText('本地算法仿真');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, `intelligence-home-${width}.png`);
    await capture(page, `intelligence-viewport-${width}.png`, false);
    await openConfig(page);
    await page.getByRole('button', { name: '商品研究', exact: true }).click();
    await page.getByRole('combobox', { name: '速度', exact: true }).selectOption('4');
    await runToApproval(page);
    await page.locator('.il-node-list').getByRole('button', { name: /生成 Listing 草稿/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, `intelligence-approval-${width}.png`);
    await page.getByRole('button', { name: '仓库取送', exact: true }).click(); await twoD(page); await step(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await capture(page, `intelligence-warehouse-${width}.png`);
  });
}

test('390px场景优先与抽屉配置：改预算、审批写入、折叠后可继续操作', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/#/intelligence/tasks');
  const toggle = page.getByRole('button', { name: '展开任务配置', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('预算（元）')).toBeHidden();
  const stageBox = await stage(page).boundingBox(); const taskBox = await page.locator('.il-task').boundingBox();
  expect(stageBox!.y).toBeLessThan(taskBox!.y);
  await toggle.click(); await page.getByRole('button', { name: '商品研究', exact: true }).click();
  await page.getByLabel('预算（元）').fill('100'); await page.getByRole('button', { name: '生成计划' }).click();
  await page.getByRole('button', { name: '收起任务配置', exact: true }).click();
  await page.getByRole('combobox', { name: '速度', exact: true }).selectOption('4');
  await runToApproval(page); await page.getByRole('button', { name: '批准', exact: true }).click();
  await step(page); await status(page, 'succeeded'); await expect(writes(page)).toHaveText('1 次（隔离本地状态）');
  await capture(page, 'intelligence-mobile-completed-390.png');
});

test('切预设与重置同步清除故障选项；用户输入种子真实进入新世界与导出', async ({ page }) => {
  await prepare(page); const fault = await failureControl(page);
  await fault.selectOption('timeout'); await page.getByRole('button', { name: '仓库取送', exact: true }).click();
  await expect(fault).toHaveValue('none');
  await page.getByLabel('世界种子').fill('99'); await page.getByRole('button', { name: '生成计划' }).click();
  await step(page); await expect(page.locator('.il-node-detail')).toContainText('simulator-state:seed:99');
  await fault.selectOption('failure'); await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(fault).toHaveValue('none'); await status(page, 'queued');
  await expect(page.getByLabel('世界种子')).toHaveValue('99');
});

test('导航10次真实卸载与重挂：离开后canvas移除且旧WebGL上下文已释放，每次仅一个新canvas', async ({ page }) => {
  test.setTimeout(60000); await page.goto('/#/intelligence/tasks');
  const canvas = page.locator('[data-testid="intelligence-scene"] canvas');
  const nav = page.getByRole('navigation', { name: '主导航' });
  for (let visit = 0; visit < 10; visit += 1) {
    await expect(canvas).toHaveCount(1); await expect(canvas).toBeVisible();
    const previous = await canvas.elementHandle(); expect(previous).toBeTruthy();
    await nav.getByRole('link', { name: '首页', exact: true }).click();
    await expect(canvas).toHaveCount(0);
    expect(await previous!.evaluate(element => !element.isConnected)).toBe(true);
    await expect.poll(() => previous!.evaluate(element => (element as HTMLCanvasElement).getContext('webgl2')?.isContextLost() ?? true)).toBe(true);
    await previous!.dispose();
    await nav.getByRole('link', { name: '智能实验室', exact: true }).click();
    await expect(page.getByTestId('orbit-lab')).toBeVisible();
    await page.getByRole('button', { name: '实用任务库', exact: true }).first().click();
    await page.getByRole('link', { name: /01 \/ 商品研究/ }).click();
  }
  await expect(canvas).toHaveCount(1);
});

test('系统减弱动效在reload后生效且保留真实单步执行', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/#/intelligence/tasks'); await page.reload();
  await page.getByRole('button', { name: '工程视图', exact: true }).click();
  await expect(page.getByLabel('减弱动效（保留完整操作）')).toBeChecked();
  await expect(page.locator('[data-testid="intelligence-scene"] canvas')).toBeVisible();
  await expect(page.locator('.il-engineer')).toContainText('尚无动态帧样本');
  await page.getByRole('button', { name: '商品研究', exact: true }).click(); await step(page);
  await expect(page.locator('.il-node-list [data-node-status="succeeded"]')).toHaveCount(1);
});
