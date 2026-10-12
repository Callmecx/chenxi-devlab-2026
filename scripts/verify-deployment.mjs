import { chromium, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base) || !base.endsWith("/"))
  throw new Error("Provide a deployment base URL ending in /");
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
const errors = [],
  failures = [],
  results = [],
  interactions = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400 && response.url().startsWith(base))
    failures.push({ url: response.url(), status: response.status() });
});
try {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const [path, expected] of [
      ["", "工程交付"],
      ["shop/", "Select"],
      ["pulse/", "Pulse"],
      ["#/intelligence", "智能演化实验室"],
      ["#/labs/market-replay", "金融事件回放"],
      ["#/labs/enterprise-flow", "企业业务闭环"],
      ["#/writing", "工程笔记"],
      ["#/labs/engineering", "三个工程实验"],
    ]) {
      await page.goto("about:blank");
      const response = await page.goto(new URL(path, base).href);
      await page.waitForLoadState("networkidle");
      const title = await page.title();
      if (!response || response.status() !== 200 || !title.includes(expected))
        throw new Error(
          `Unexpected page at ${path}: ${response?.status()} / ${title}`,
        );
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      )
        throw new Error(`Overflow at ${path}/${width}`);
      results.push({ path, width, status: response.status(), title });
    }
  }
  await page.goto(base + "#/intelligence");
  await page.getByRole("button", { name: "二维视图", exact: true }).click();
  await page.getByRole("button", { name: "生成计划", exact: true }).click();
  await page.getByRole("button", { name: "连续执行", exact: true }).click();
  await expect(page.locator(".il-stage")).toHaveAttribute(
    "data-status",
    "waiting-approval",
  );
  await page.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(page.locator(".il-stage")).toHaveAttribute(
    "data-status",
    "cancelled",
  );
  interactions.push(
    "Product planning and tools reach approval; rejecting cancels without committing.",
  );
  await page.goto(base + "#/projects/shop-pilot");
  await page.getByRole("link", { name: "运行演示", exact: true }).click();
  if (!page.url().startsWith(base + "shop/"))
    throw new Error("Shop link escaped deployment base");
  await page.getByTestId("product-cup").click();
  await page.getByTestId("add-to-cart").click();
  await page.getByTestId("open-cart").click();
  await expect(page.getByTestId("checkout")).toBeEnabled();
  await page.getByTestId("checkout").click();
  await expect(page.getByRole("button", { name: /体验用户 A/ })).toBeVisible();
  interactions.push(
    "Public local shop SKU → cart → checkout uses preserved deployment paths.",
  );
  await page
    .getByRole("button", { name: "返回作品集 ↗", exact: true })
    .first()
    .click();
  if (!page.url().startsWith(base) || page.url().includes("/shop/"))
    throw new Error("Shop return link escaped deployment base");
  await page.goto(base + "pulse/#/");
  await page.getByRole("link", { name: "探索你的灵感日", exact: true }).click();
  await page
    .getByRole("button", {
      name: "加入我的灵感日：把城市，印在纸上",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "去预约", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "挑选你的灵感现场" }),
  ).toBeVisible();
  interactions.push(
    "Public local activity selection reaches booking under the existing /pulse/ base.",
  );
  for (const asset of [
    "evidence/TEST_REPORT.md",
    "evidence/enterpriseflow-dashboard.png",
    "evidence/intelligence-lab/evaluation.json",
    "screenshots/shop-checkout-390.png",
  ]) {
    const response = await page.request.get(new URL(asset, base).href);
    if (!response.ok())
      throw new Error(`Missing public evidence asset: ${asset}`);
    results.push({ path: asset, status: response.status() });
  }
  if (errors.length || failures.length)
    throw new Error(JSON.stringify({ errors, failures }));
  await mkdir("docs/testing", { recursive: true });
  const report = {
    checkedAt: new Date().toISOString(),
    base,
    browser: browser.version(),
    anonymous: true,
    result: "PASS",
    pagesAndAssets: results,
    interactions,
    pageErrors: errors,
    failedAssets: failures,
    scope:
      "Static public modes and path preservation; no public backend, model or device claim.",
  };
  const name =
    new URL(base).hostname === "127.0.0.1"
      ? "deployment-path-check.json"
      : "online-smoke.json";
  await writeFile(
    `docs/testing/${name}`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
