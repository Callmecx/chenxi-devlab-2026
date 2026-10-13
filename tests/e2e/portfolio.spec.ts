import { test, expect } from "@playwright/test";
test("portfolio navigation, filters, theme and actual contact", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "工程交付",
  );
  await page.getByRole("button", { name: "切换深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("link", { name: "查看工程作品", exact: true }).click();
  await page.getByRole("button", { name: "前端体验", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "搜索项目" }).fill("不存在项目");
  await expect(page.getByText("还没有匹配的项目")).toBeVisible();
  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(page.locator(".project-card")).toHaveCount(7);
  await page
    .getByRole("link", { name: "查看 EnterpriseFlow 项目详情" })
    .click();
  await expect(page.getByText("要解决什么问题？")).toBeVisible();
  await page.getByRole('link', { name: '04 证据与演示' }).click();
  await expect(page).toHaveURL(/#\/projects\/enterprise-flow$/);
  await page.getByRole('button', { name: '放大项目证据图' }).click();
  await expect(page.locator('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭截图' }).click();
  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(
    page
      .locator('a[href="https://github.com/Callmecx/enterprise-flow"]')
      .first(),
  ).toBeVisible();
  await page.goto("/#/contact");
  await expect(page.locator('a[href="mailto:496684212@qq.com"]')).toBeVisible();
  expect(errors).toEqual([]);
});
test('dark theme stays usable on small screens and skip navigation keeps route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '切换深色模式' }).click();
  await page.keyboard.press('Tab');
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('main')).toBeFocused();
  await page.locator('main').evaluate(element => element.blur());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/v4/regression/portfolio-dark-390.png', fullPage: true });
  for (const path of ['/#/projects', '/#/projects/enterprise-flow', '/#/contact']) {
    await page.goto(path); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
for (const width of [1920, 1440, 768, 390, 360, 320]) {
  test(`portfolio responsive ${width}px, routes and screenshot`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/#/projects",
      "/#/projects/shop-pilot",
      "/#/capabilities",
      "/#/contact",
    ]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path} overflow at ${width}`,
      ).toBe(true);
    }
    await page.goto("/");
    if (width < 601) {
      await page.getByRole("button", { name: "展开导航菜单" }).click();
      await page
        .locator("#mobile-nav")
        .getByRole("link", { name: "项目作品" })
        .click();
      await expect(page.locator("#mobile-nav")).toHaveCount(0);
      await page.goto("/");
    }
    await page.screenshot({
      path: `docs/screenshots/v4/regression/portfolio-${width}.png`,
      fullPage: true,
    });
  });
}
