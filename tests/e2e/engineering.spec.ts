import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('.local/qa/content');
const errors = new WeakMap<Page, string[]>();
test.beforeAll(async () => { await mkdir(output, { recursive: true }); });
test.beforeEach(({ page }) => { const list: string[] = []; errors.set(page, list); page.on('pageerror', error => list.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
async function open(page: Page) { await page.goto('/#/labs/engineering'); await expect(page.getByRole('heading', { level: 1 })).toContainText('可以亲手验证'); }
async function connect(page: Page) { await page.getByRole('button', { name: '连接演示服务', exact: true }).click(); await expect(page.getByTestId('experiment-connection')).toHaveText('真实 API · 当前会话已验证'); }
async function select(page: Page, name: string) { await page.getByRole('button', { name: new RegExp(name) }).click(); }
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
  test(`真实 API 竞态与订单原请求恢复 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page);
    await expect(page.getByRole('button', { name: '并发争抢一件库存' })).toBeDisabled();
    await connect(page);
    const claims: Array<{ key: string | undefined; actor: string }> = [];
    page.on('request', request => { if (request.url().includes('/claim')) claims.push({ key: request.headers()['idempotency-key'], actor: request.postDataJSON()?.actor }); });
    await page.getByRole('button', { name: '并发争抢一件库存' }).click();
    await expect(page.getByTestId('race-invariant')).toHaveText('终态核对：2 次尝试 / 1 次成功 / 库存 0');
    expect(claims.map(claim => claim.actor).sort()).toEqual(['A', 'B']); expect(new Set(claims.map(claim => claim.key)).size).toBe(2);
    await capture(page, `engineering-race-${width}.png`);
    await select(page, '响应消失');
    await page.getByRole('button', { name: '提交订单并丢弃响应' }).click();
    await expect(page.getByRole('status')).toContainText('客户端故障已注入');
    await expect(page.getByTestId('order-phase')).toHaveText('结果未知 · 保留原请求');
    await expect(page.getByRole('button', { name: '重置此实验会话' })).toBeDisabled();
    await expect(page.getByTestId('experiment-order-count')).toHaveText('未查询');
    const key = await page.getByTestId('order-intent-key').innerText();
    await page.reload(); await connect(page); await select(page, '响应消失');
    await expect(page.getByTestId('order-intent-key')).toHaveText(key);
    await page.getByRole('button', { name: '查询原操作', exact: true }).click();
    await expect(page.getByTestId('operation-state')).toHaveText('orders.create / SUCCEEDED');
    await expect(page.getByTestId('experiment-order-count')).toHaveText('1');
    await page.getByRole('button', { name: '原键原内容重试' }).click();
    await expect(page.getByRole('status')).toContainText('已重试同一幂等键');
    await expect(page.getByTestId('experiment-order-count')).toHaveText('1');
    await expect(page.getByTestId('order-intent-key')).toHaveText(key);
    await capture(page, `engineering-order-${width}.png`);
    await page.getByRole('button', { name: '重置此实验会话' }).click();
    await expect(page.getByRole('status')).toContainText('已重置当前实验会话');
    await expect(page.getByTestId('experiment-order-count')).toHaveText('0');
    await expect(page.getByTestId('order-phase')).toHaveText('尚未提交');
  });
  test(`十万行真实 Worker 搜索排序取消和虚拟渲染 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page); await select(page, '十万行');
    await expect(page.getByTestId('virtual-count')).toHaveText('100,000 / 100,000');
    await expect(page.getByTestId('virtual-timing')).toHaveText(/\d+\.\d \/ \d+\.\d ms/);
    expect(await page.getByTestId('virtual-row').count()).toBeLessThanOrEqual(20);
    await page.getByTestId('virtual-viewport').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByText('LAB-100000', { exact: true })).toBeVisible();
    expect(await page.getByTestId('virtual-row').count()).toBeLessThanOrEqual(20);
    await page.getByTestId('virtual-search').fill('LAB-100000'); await page.getByTestId('virtual-search').fill('LAB-000010');
    await expect(page.getByTestId('virtual-count')).toHaveText('1 / 100,000');
    await expect(page.getByTestId('virtual-row')).toHaveCount(1); await expect(page.getByTestId('virtual-row')).toContainText('LAB-000010');
    await page.getByTestId('virtual-search').fill('基础设施'); await page.getByRole('combobox', { name: '排序', exact: true }).selectOption('value-desc');
    await expect(page.getByTestId('virtual-count')).toHaveText('25,000 / 100,000');
    const values = await page.getByTestId('virtual-row').locator(':scope > strong').allTextContents();
    const numbers = values.map(value => Number(value.replaceAll(',', '')));
    expect(numbers.length).toBeGreaterThan(1); expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    await capture(page, `engineering-list-${width}.png`);
    await writeFile(resolve(output, `virtual-performance-${width}.json`), JSON.stringify({ executedAt: new Date().toISOString(), viewport: { width, height: 900 }, query: '基础设施', sort: 'value-desc', matched: await page.getByTestId('virtual-count').innerText(), rendered: await page.getByTestId('virtual-row').count(), measuredWorkerAndTotal: await page.getByTestId('virtual-timing').innerText(), userAgent: await page.evaluate(() => navigator.userAgent), note: 'One local browser sample, not a production benchmark; worker timing excludes DOM paint.' }, null, 2));
    await page.getByTestId('virtual-search').fill('不存在'); await expect(page.getByText('没有匹配记录。试试更短的关键词。')).toBeVisible();
    await page.getByTestId('virtual-search').fill(''); await page.getByRole('button', { name: '重新测量', exact: true }).click(); await select(page, '一件库存');
    await expect(page.getByTestId('virtual-viewport')).toHaveCount(0); await expect(page.getByRole('heading', { name: '同一件库存，只能有一位赢家。' })).toBeVisible();
    await select(page, '十万行'); await expect(page.getByTestId('virtual-count')).toHaveText('100,000 / 100,000');
  });
}

test('服务不可用不宣称成功，真实服务写入后网络响应丢失可恢复', async ({ page }) => {
  await page.route('**/api/v1/**', route => route.abort('connectionfailed'));
  await open(page); await page.getByRole('button', { name: '连接演示服务', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('experiment-connection')).toHaveText('尚未验证服务连接');
  await expect(page.getByRole('button', { name: '并发争抢一件库存' })).toBeDisabled();
  await page.unroute('**/api/v1/**'); await connect(page); await select(page, '响应消失');
  let committed = false;
  await page.route('**/api/v1/shop/orders', async route => {
    if (route.request().method() === 'POST') { const response = await route.fetch(); expect(response.status()).toBe(200); committed = true; await route.abort('connectionfailed'); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '提交订单并丢弃响应' }).click();
  await expect(page.getByRole('alert')).toBeVisible(); expect(committed).toBe(true);
  await expect(page.getByTestId('order-phase')).toHaveText('结果未知 · 保留原请求');
  const key = await page.getByTestId('order-intent-key').innerText();
  await page.unroute('**/api/v1/shop/orders');
  await page.getByRole('button', { name: '查询原操作', exact: true }).click();
  await expect(page.getByTestId('experiment-order-count')).toHaveText('1');
  await page.getByRole('button', { name: '原键原内容重试' }).click();
  await expect(page.getByRole('status')).toContainText('已重试同一幂等键');
  await expect(page.getByTestId('experiment-order-count')).toHaveText('1'); await expect(page.getByTestId('order-intent-key')).toHaveText(key);
});

test('恢复身份丢失时保留原请求，不创建新会话；unknown 禁止重置，明确放弃有界归档', async ({ page }) => {
  await open(page); await connect(page); await select(page, '响应消失');
  await page.getByRole('button', { name: '提交订单并丢弃响应' }).click();
  await expect(page.getByRole('status')).toContainText('客户端故障已注入');
  const key = await page.getByTestId('order-intent-key').innerText();
  await expect(page.getByRole('button', { name: '重置此实验会话' })).toBeDisabled();
  await page.evaluate(() => sessionStorage.removeItem('chenxi-engineering-experiments-v2'));
  await page.reload(); await select(page, '响应消失');
  let creates = 0;
  page.on('request', request => { if (request.url().endsWith('/demo/session') && request.method() === 'POST') creates++; });
  await page.getByRole('button', { name: '连接演示服务', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('身份已丢失'); expect(creates).toBe(0);
  await expect(page.getByTestId('order-intent-key')).toHaveText(key); await expect(page.getByRole('button', { name: '原键原内容重试' })).toBeDisabled();
  await page.getByText('会话已过期或需要放弃恢复？', { exact: true }).click();
  await page.getByRole('button', { name: '放弃旧恢复入口', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('原键与请求体已归档'); await expect(page.getByTestId('order-intent-key')).toHaveCount(0);
  expect(await page.evaluate(original => {
    const records = JSON.parse(sessionStorage.getItem('chenxi-engineering-experiments-v2-archive') ?? '[]');
    return records.length === 1 && records[0].key === original && !!records[0].body.quoteId && !('token' in records[0]);
  }, key)).toBe(true);
  await connect(page); expect(creates).toBe(1); await expect(page.getByTestId('experiment-order-count')).toHaveText('0');
});
