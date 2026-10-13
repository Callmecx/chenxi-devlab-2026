import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const routes = [
  ["intelligence", "/#/intelligence", "智能演化实验室"],
  ["market", "/#/labs/market-replay", "金融事件回放"],
  ["enterprise", "/#/labs/enterprise-flow", "企业业务闭环"],
  ["engineering", "/#/labs/engineering", "三个工程实验"],
  ["writing", "/#/writing", "工程笔记"],
] as const;

test.beforeAll(async () => {
  await mkdir("docs/screenshots/v2", { recursive: true });
  await mkdir("docs/screenshots/v4", { recursive: true });
});
for (const width of [360, 390, 768, 1440, 1920]) {
  test(`Whole-site initial views fit ${width}px without script errors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, route, title] of routes) {
      // These are initial-view captures. A fresh document prevents the previous
      // hash route's still-visible heading from satisfying the next route check.
      await page.goto("about:blank");
      await page.goto(route);
      await expect(page).toHaveTitle(new RegExp(title));
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(
        page.locator("main .page-enter-active, main .page-leave-active"),
      ).toHaveCount(0);
      await expect(page.locator("main > *").first()).toHaveCSS("opacity", "1");
      if (name === "intelligence")
        await expect(
          page.locator("[data-dominion-canvas], .dom-map").first(),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/${name === "intelligence" ? "v4" : "v2"}/${name}-${width}.png`,
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
  });
}

test("unknown portfolio routes keep the recovery page and navigation", async ({
  page,
}) => {
  await page.goto("/#/definitely-missing");
  await expect(page.locator("main")).toContainText("404");
  await expect(page.locator("main a").first()).toBeVisible();
});
