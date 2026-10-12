import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve(".local/evidence/client-v2/screenshots");
async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: resolve(output, `${name}-${width}.png`),
      fullPage: true,
    });
    await page.screenshot({
      path: resolve(output, `${name}-viewport-${width}.png`),
    });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
}
async function openWeekend(page: Page) {
  await page.goto("http://127.0.0.1:5175/pulse/");
  await page.getByRole("button", { name: "连接本地服务", exact: true }).click();
  await expect(
    page.getByText("服务端演示已连接", { exact: true }),
  ).toBeVisible();
}
async function chooseWeekend(page: Page) {
  await page.getByRole("link", { name: "找到我的周末" }).click();
  await page.getByRole("button", { name: "看看适合我的路线" }).click();
  await page.getByRole("link", { name: "查看路线与场次" }).first().click();
  await page
    .getByRole("link", { name: "预约此场次", exact: true })
    .first()
    .click();
  await page.getByLabel("同行人数").selectOption("2");
  await page.getByLabel("虚构代号").fill("测试橘子");
  await page.getByRole("checkbox").check();
}
test("H5 service recommendation, booking, reload ownership, cancel and responsive views", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWeekend(page);
  await capture(page, "weekend-home");
  await chooseWeekend(page);
  await capture(page, "weekend-book");
  await page.getByRole("button", { name: "确认模拟预约", exact: true }).click();
  await expect(page.locator(".wk-record")).toHaveCount(1);
  await expect(page.locator(".wk-record")).toContainText("预约已确认");
  await page.reload();
  await expect(page.locator(".wk-record")).toContainText("预约已确认");
  await page.getByRole("button", { name: "取消预约", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "确认取消", exact: true }).click();
  await expect(page.locator(".wk-record")).toContainText("已主动取消");
  await capture(page, "weekend-cancelled");
  expect(errors).toEqual([]);
});
test("H5 committed response loss survives reload and confirms one original booking", async ({
  page,
}) => {
  await openWeekend(page);
  await chooseWeekend(page);
  let dropped = false;
  await page.route("**/api/v1/h5/bookings", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "确认模拟预约", exact: true }).click();
  await expect(page.locator(".wk-pending")).toBeVisible();
  await page.reload();
  await expect(page.locator(".wk-pending")).toBeVisible();
  await page
    .getByRole("button", { name: "使用原请求重试", exact: true })
    .click();
  await expect(page.locator(".wk-pending")).toHaveCount(0);
  await page
    .locator(".wk-nav")
    .getByRole("link", { name: "我的预约", exact: true })
    .click();
  await expect(page.locator(".wk-record")).toHaveCount(1);
});
async function openShop(page: Page) {
  await page.goto("http://127.0.0.1:5174/shop/");
  await page.getByRole("button", { name: "连接本地服务", exact: true }).click();
  await expect(
    page.getByText("● 服务端演示已连接", { exact: true }),
  ).toBeVisible();
}
async function shopQuote(page: Page) {
  await page.getByRole("button", { name: /晨间陶瓷杯/ }).click();
  await expect(
    page.getByRole("button", { name: "加入购物袋", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "加入购物袋", exact: true }).click();
  await expect(
    page.getByText("已加入服务端购物袋。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /查看购物袋/ }).click();
  await page
    .getByRole("button", { name: "获取结算报价 →", exact: true })
    .click();
  await page
    .locator(".xs-coupon")
    .first()
    .getByRole("button", { name: "领取演示券", exact: true })
    .click();
  await page.getByRole("button", { name: /满 100 减 10 · 可选择/ }).click();
  await page
    .getByRole("button", { name: "获取服务端报价", exact: true })
    .click();
  await expect(page.locator(".xs-total")).toContainText("119.00");
}
test("Shop server catalog, coupon, quote, payment failure/success, shipping and receipt", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openShop(page);
  await expect(page.locator(".xs-product")).toHaveCount(12);
  await capture(page, "select-home");
  await shopQuote(page);
  await capture(page, "select-quote");
  await page
    .getByRole("button", { name: "确认创建模拟订单", exact: true })
    .click();
  await expect(page.locator(".xs-order")).toHaveCount(1);
  await page.getByRole("button", { name: "模拟付款失败", exact: true }).click();
  await expect(page.locator(".xs-order")).toContainText("1 次付款尝试");
  await page.getByRole("button", { name: "模拟付款成功", exact: true }).click();
  await expect(page.locator(".xs-badge")).toContainText("已模拟付款");
  await page.getByRole("button", { name: "模拟发货", exact: true }).click();
  await page.getByRole("button", { name: "确认模拟收货", exact: true }).click();
  await expect(page.locator(".xs-badge")).toContainText("已完成");
  await page.reload();
  await expect(page.locator(".xs-badge")).toContainText("已完成");
  await capture(page, "select-completed");
  expect(errors).toEqual([]);
});
test("Shop lost create-order response retains original intent after reload without duplicate order", async ({
  page,
}) => {
  await openShop(page);
  await shopQuote(page);
  let dropped = false;
  await page.route("**/api/v1/shop/orders", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "确认创建模拟订单", exact: true })
    .click();
  await expect(page.locator(".xs-pending")).toBeVisible();
  await page.reload();
  await expect(page.locator(".xs-pending")).toBeVisible();
  await page
    .getByRole("button", { name: "使用原请求重试", exact: true })
    .click();
  await expect(page.locator(".xs-pending")).toHaveCount(0);
  await page
    .locator(".xs-desktop-nav")
    .getByRole("button", { name: "我的订单", exact: true })
    .click();
  await expect(page.locator(".xs-order")).toHaveCount(1);
  await page.getByRole("button", { name: "取消订单", exact: true }).click();
  await page.getByText("确认取消", { exact: true }).click();
  await expect(page.locator(".xs-badge")).toContainText("已取消");
});
test("Disconnected service remains explicitly disconnected until local mode is chosen", async ({
  page,
}) => {
  await page.route("**/api/v1/**", (route) => route.abort("failed"));
  await page.goto("http://127.0.0.1:5175/pulse/");
  await page.getByRole("button", { name: "连接本地服务", exact: true }).click();
  await expect(page.getByText("服务尚未连接", { exact: true })).toBeVisible();
  await expect(page.locator(".wk-alert")).toContainText("无法连接");
  await expect(
    page.getByRole("button", { name: "连接本地服务", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "本地演示", exact: true }).click();
  await expect(page.locator(".weekend-v2")).toHaveCount(0);
  await page.goto("http://127.0.0.1:5174/shop/");
  await page.getByRole("button", { name: "连接本地服务", exact: true }).click();
  await expect(page.getByText("○ 服务尚未连接", { exact: true })).toBeVisible();
  await expect(page.locator(".xs-alert")).toContainText("无法连接");
  await page.getByRole("button", { name: "本地演示", exact: true }).click();
  await expect(page.locator(".select-v2")).toHaveCount(0);
});
test("H5 lost identity cannot replay into a new session; explicit abandonment archives unknown intent", async ({
  page,
}) => {
  await openWeekend(page);
  await chooseWeekend(page);
  let sessionRequests = 0;
  let dropped = false;
  page.on("request", (request) => {
    if (request.url().endsWith("/demo-sessions")) sessionRequests++;
  });
  await page.route("**/api/v1/h5/bookings", async (route) => {
    if (route.request().method() === "POST" && !dropped) {
      dropped = true;
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "确认模拟预约", exact: true }).click();
  await expect(page.locator(".wk-pending")).toBeVisible();
  await page.context().clearCookies();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "停止原会话恢复", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "使用原请求重试", exact: true })
    .click();
  await expect(page.locator(".wk-pending")).toBeVisible();
  const before = sessionRequests;
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "停止原会话恢复", exact: true })
    .click();
  await expect(page.locator(".wk-pending")).toHaveCount(0);
  expect(sessionRequests).toBe(before);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("chenxi-weekend-pending-v2-archive-"),
        ).length,
    ),
  ).toBe(1);
});
test("Shop missing token blocks recovery and only archives after explicit confirmation", async ({
  page,
}) => {
  await openShop(page);
  await shopQuote(page);
  let sessionRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/demo/session")) sessionRequests++;
  });
  await page.route("**/api/v1/shop/orders", async (route) => {
    if (route.request().method() === "POST") {
      expect((await route.fetch()).ok()).toBe(true);
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "确认创建模拟订单", exact: true })
    .click();
  await expect(page.locator(".xs-pending")).toBeVisible();
  await page.evaluate(() =>
    localStorage.removeItem("chenxi-select-session-v2"),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "停止原会话恢复", exact: true }),
  ).toBeVisible();
  const before = sessionRequests;
  await page
    .getByRole("button", { name: "停止原会话恢复", exact: true })
    .click();
  await page.getByText("停止恢复", { exact: true }).click();
  await expect(page.locator(".xs-pending")).toHaveCount(0);
  expect(sessionRequests).toBe(before);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("chenxi-select-pending-v2-archive-"),
        ).length,
    ),
  ).toBe(1);
});
