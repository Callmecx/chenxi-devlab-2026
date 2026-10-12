import { test, expect } from '@playwright/test';

test('ShopPilot: filter, SKU inventory, integer totals, failure retry, idempotency and order history', async ({ page }) => {
  await page.goto('/shop/');
  await expect(page.getByRole('heading', { name: /让日常好物/ })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索商品' }).fill('没有这个商品');
  await expect(page.getByText('没有找到这件好物')).toBeVisible();
  await page.getByRole('button', { name: '清除全部筛选' }).click();
  await page.getByRole('button', { name: '模拟加载失败', exact: true }).click();
  await expect(page.getByText('好物暂时没加载出来')).toBeVisible();
  await page.getByRole('button', { name: '重新加载商品' }).click();
  await page.getByTestId('product-cup').click();
  await page.getByRole('button', { name: '选择陶土棕', exact: true }).click();
  await expect(page.getByTestId('add-to-cart')).toBeDisabled();
  await page.getByRole('button', { name: '选择沙岩白', exact: true }).click();
  await page.getByRole('button', { name: '增加购买数量', exact: true }).click();
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('open-cart').click();
  await expect(page.getByText('¥270.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /新朋友礼遇/ }).click();
  await expect(page.getByText('¥240.00', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('¥240.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '勾选山间 · 陶瓷马克杯沙岩白' }).click();
  await expect(page.getByTestId('checkout')).toBeDisabled();
  await page.getByRole('button', { name: '勾选山间 · 陶瓷马克杯沙岩白' }).click();
  await page.getByTestId('checkout').click();
  await page.getByRole('button', { name: /体验用户 B/ }).click();
  await page.getByRole('button', { name: /模拟本次提交失败/ }).click();
  await page.getByTestId('submit-order').click();
  await expect(page.getByRole('alert')).toContainText('模拟网络失败');
  await page.getByRole('button', { name: /模拟本次提交失败/ }).click();
  await page.getByTestId('submit-order').dblclick();
  await expect(page.getByRole('heading', { name: '好物，已在期待中。' })).toBeVisible();
  await page.getByTestId('view-orders').click();
  await expect(page.locator('.order-card')).toHaveCount(1);
  await expect(page.locator('.order-status')).toHaveText('待发货');
  await page.getByRole('button', { name: /模拟发货/ }).click();
  await expect(page.locator('.order-status')).toHaveText('运输中');
  await page.getByRole('button', { name: /确认模拟收货/ }).click();
  await expect(page.locator('.order-status')).toHaveText('已完成');
  await page.reload();
  await expect(page.locator('.order-status')).toHaveText('已完成');
  await expect(page.locator('.order-card')).toHaveCount(1);
  await page.screenshot({ path: 'docs/screenshots/shop-order-complete.png', fullPage: true });
  await page.getByTestId('open-cart').click();
  await expect(page.getByText('购物袋还空着')).toBeVisible();
});

for (const width of [1440, 768, 390, 320]) {
  test(`ShopPilot responsive catalog and checkout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/shop/');
    await expect(page.getByTestId('product-cup')).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/shop-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('product-cup').click();
    await page.getByTestId('add-to-cart').click();
    await page.getByTestId('open-cart').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('checkout').click();
    await expect(page.getByRole('button', { name: /体验用户 A/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/shop-checkout-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
