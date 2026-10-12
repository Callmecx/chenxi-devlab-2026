import { test, expect } from '@playwright/test';

test('Pulse completes persisted selection → validation → failed mock → retry → receipt → cancellation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/pulse/#/');
  await page.getByRole('link', { name: '探索你的灵感日', exact: true }).click();
  await expect(page.getByRole('heading', { name: /你的灵感.*不止一种打开方式/ })).toBeVisible();
  await page.getByRole('button', { name: '加入我的灵感日：把城市，印在纸上', exact: true }).click();
  await page.getByRole('button', { name: '加入我的灵感日：换个角度，读成都', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('时间有重叠');
  await page.getByRole('button', { name: '加入我的灵感日：灵感，不必等天亮', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('button', {
      name: '已加入我的灵感日：把城市，印在纸上（点击移除）',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '去预约', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('虚构昵称');
  await page.getByLabel('虚构昵称').fill('橘子星人E2E');
  await page.getByLabel('我知道这是演示项目', { exact: false }).check();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('模拟服务失败', { exact: false }).check();
  await page.getByRole('button', { name: '确认模拟预约', exact: true }).click();
  await expect(page.getByRole('button', { name: '正在模拟提交…', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('模拟服务暂时不可用');
  await page.getByLabel('模拟服务失败', { exact: false }).uncheck();
  await page.getByRole('button', { name: '确认模拟预约', exact: true }).click();
  await expect(page).toHaveURL(/#\/success\/PL-/);
  await expect(page.getByRole('heading', { name: '你的灵感日，已就位。' })).toBeVisible();
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('chenxi-pulse-v1') || '{}') as { bookings: unknown[] },
  );
  expect(saved.bookings).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('heading', { name: '你的灵感日，已就位。' })).toBeVisible();
  await page.getByRole('link', { name: '查看我的行程', exact: true }).click();
  await expect(page.locator('.stat-grid > div').nth(0).locator('strong')).toHaveText('01');
  await expect(page.locator('.stat-grid > div').nth(1).locator('strong')).toHaveText('02');
  await expect(page.locator('.stat-grid > div').nth(2).locator('strong')).toHaveText('02');
  await page.getByRole('button', { name: '取消预约', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '确认取消', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('名额已释放');
  await expect(page.locator('.stat-grid > div').first().locator('strong')).toHaveText('00');
  await expect(page.locator('.record-status')).toHaveText('已取消');
  expect(errors).toEqual([]);
});

test('Pulse recovers from malformed storage, shows an empty state and handles unknown routes', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('chenxi-pulse-v1', '{bad-json'));
  await page.goto('/pulse/#/records');
  await expect(page.getByRole('status')).toContainText('本地记录无法读取');
  await expect(page.getByRole('heading', { name: '这里还有一点空白。' })).toBeVisible();
  await page.goto('/pulse/#/missing');
  await expect(page.getByRole('heading', { name: '灵感在另一条路上。' })).toBeVisible();
});

for (const width of [1440, 768, 390, 320]) {
  test(`Pulse responsive ${width}px, useful controls, detail navigation and screenshot`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    await page.goto('/pulse/#/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('灵感脉冲');
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/pulse-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '城市漫游', exact: true }).click();
    await expect(page.locator('.session-card')).toHaveCount(1);
    await page.getByRole('link', { name: '查看换个角度，读成都详情', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '换个角度，读成都', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: '加入我的灵感日', exact: true }).click();
    await page.getByRole('link', { name: '前往预约', exact: true }).click();
    await expect(page.getByRole('heading', { name: '挑选你的灵感现场' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await expect(page.getByLabel('虚构昵称')).toBeVisible();
    await page.getByLabel('虚构昵称').fill('演示昵称');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
