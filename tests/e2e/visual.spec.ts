import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const routes = [
  ["intelligence", "/#/intelligence"],
  ["market", "/#/labs/market-replay"],
  ["enterprise", "/#/labs/enterprise-flow"],
  ["engineering", "/#/labs/engineering"],
  ["writing", "/#/writing"],
] as const;

test.beforeAll(async () => {
  await mkdir("docs/screenshots/v2", { recursive: true });
});
for (const width of [360, 390, 768, 1440, 1920]) {
  test(`V2 initial views fit ${width}px without script errors`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [name, route] of routes) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (name === "intelligence")
        await expect(
          page.locator("canvas, .il-world-grid, .il-flat-graph").first(),
        ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        route,
      ).toBe(true);
      await page.screenshot({
        path: `docs/screenshots/v2/${name}-${width}.png`,
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
