import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve('.local/qa/content');
const errors = new WeakMap<Page, string[]>();
test.beforeAll(async () => { await mkdir(output, { recursive: true }); });
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', error => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
async function capture(page: Page, file: string) {
  // Finish the user's smooth navigation before resetting the camera for evidence.
  // Jumping to top mid-animation can otherwise be overwritten by the in-flight scroll.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    let last = scrollY; let stableSince = performance.now(); const started = stableSince;
    function frame(now: number) {
      if (scrollY !== last) { last = scrollY; stableSince = now; }
      if (now - stableSince >= 180) { resolve(); return; }
      if (now - started > 4000) { reject(new Error('Scrolling did not settle before screenshot')); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.screenshot({ path: resolve(output, file), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
for (const width of [390, 1440]) {
  test(`回放无未来数据、缺口重算、重复与切换取消 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/#/labs/market-replay');
    await expect(page.getByRole('button', { name: '单步 +1' })).toBeEnabled();
    const slider = page.locator('#market-seek'); await slider.focus(); await slider.press('Home');
    for (let step = 0; step < 10; step++) await slider.press('ArrowRight');
    await expect(page.getByTestId('market-prefix')).toHaveText('10 / 10');
    await page.getByRole('button', { name: '移除当前事件' }).click(); await page.getByRole('button', { name: '单步 +1' }).click();
    await expect(page.getByTestId('market-prefix')).toHaveText('9 / 11');
    await page.getByRole('button', { name: '回补并重算' }).click(); await expect(page.getByTestId('market-prefix')).toHaveText('11 / 11');
    const price = await page.getByTestId('market-price').innerText(); await page.getByRole('button', { name: '重复投递当前事件' }).click(); await expect(page.getByTestId('market-price')).toHaveText(price);
    await page.getByRole('combobox', { name: '合成标的' }).selectOption('LUMEN'); await page.getByRole('combobox', { name: '合成标的' }).selectOption('ATLAS');
    await expect(page.getByRole('button', { name: '单步 +1' })).toBeEnabled(); await page.getByRole('button', { name: '单步 +1' }).click(); await expect(page.getByTestId('market-price')).toHaveText('100.00');
    await page.getByRole('combobox', { name: '倍速' }).selectOption('4'); await page.getByRole('button', { name: '播放回放' }).click();
    await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThanOrEqual(3); await page.getByRole('button', { name: '暂停回放' }).click();
    await slider.focus(); await slider.press('End'); await capture(page, `market-${width}.png`);
    await page.getByRole('button', { name: '重置', exact: true }).click(); await expect(page.getByTestId('market-prefix')).toHaveText('0 / 0');
  });
  test(`企业库存到分次结算，非法动作和幂等重放 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/#/labs/enterprise-flow');
    await page.getByRole('button', { name: '全量出库', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('收货');
    const steps = [['审批销售', '已审批 · 待补货'], ['关联采购', '采购在途'], ['确认收货', '已收货 · 可出库'], ['全量出库', '已出库 · 待结清']];
    for (const [button, phase] of steps) { await page.getByRole('button', { name: button, exact: true }).click(); await expect(page.getByTestId('enterprise-phase')).toHaveText(phase); }
    await expect(page.getByTestId('enterprise-stock')).toContainText('0');
    await page.getByLabel('本次模拟收款金额（元）').fill('100000'); await page.getByRole('button', { name: '登记收款' }).click(); await expect(page.getByTestId('enterprise-balance')).toContainText('150,000.00');
    const count = await page.locator('.journal li').count(); await page.getByRole('button', { name: '重放上次有效请求' }).click(); await expect(page.getByRole('status')).toContainText('没有重复记账'); await expect(page.locator('.journal li')).toHaveCount(count);
    await page.getByLabel('本次模拟收款金额（元）').fill('150000'); await page.getByRole('button', { name: '登记收款' }).click(); await expect(page.getByTestId('enterprise-phase')).toHaveText('已结清');
    await capture(page, `enterprise-${width}.png`);
    await page.getByRole('button', { name: '重置独立仿真' }).click(); await expect(page.getByTestId('enterprise-phase')).toHaveText('销售草稿');
  });
}
test('工程文章、历史验收边界、准确图片说明与案例跳转', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/#/writing#prefix-replay');
  await expect(page.locator('#prefix-replay')).toBeVisible(); await expect(page.locator('#prefix-replay')).toContainText('本轮领域单元测试');
  await page.getByRole('button', { name: /库存预留与现货/ }).click(); await expect(page.locator('#business-invariants')).toBeInViewport();
  await capture(page, 'writing-390.png');
  await page.goto('/#/projects/enterprise-flow');
  await expect(page.locator('.case-facts')).toContainText('未确认，不以审阅日期替代'); await expect(page.locator('.case-decision')).toHaveCount(2);
  await page.getByRole('button', { name: '放大项目证据图' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: '打开独立业务仿真' }).click(); await expect(page).toHaveURL(/#\/labs\/enterprise-flow$/);
  await page.goto('/#/projects/solana-radar'); await expect(page.locator('.screenshot-button img')).toHaveAttribute('alt', /历史运行报告摘录/);
});
