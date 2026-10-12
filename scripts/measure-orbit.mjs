import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
const base = process.argv[2] || "http://127.0.0.1:4173/";
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const samples = [];
try {
  for (const width of [1440, 390])
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
        deviceScaleFactor: 1,
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(new URL("#/intelligence", base).href);
        await expect(page.locator("[data-orbit-canvas]")).toBeVisible();
        await expect
          .poll(async () =>
            Number(
              await page
                .locator("[data-orbit-canvas]")
                .getAttribute("data-frames"),
            ),
          )
          .toBeGreaterThan(100);
        await page
          .getByRole("button", { name: "任务设置", exact: true })
          .click();
        await page
          .getByRole("combobox", { name: "设置运行速度", exact: true })
          .selectOption("0.5");
        await page
          .getByRole("button", { name: "关闭面板", exact: true })
          .click();
        await page
          .getByRole("button", { name: "开始补给任务", exact: true })
          .click();
        const timing = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const frames = [],
                longTasks = [];
              let last = 0,
                handle;
              const observer = new PerformanceObserver((list) =>
                longTasks.push(
                  ...list
                    .getEntries()
                    .map((e) => ({ start: e.startTime, duration: e.duration })),
                ),
              );
              observer.observe({ type: "longtask", buffered: false });
              function frame(now) {
                if (last) frames.push(now - last);
                last = now;
                handle = requestAnimationFrame(frame);
              }
              handle = requestAnimationFrame(frame);
              setTimeout(() => {
                cancelAnimationFrame(handle);
                observer.disconnect();
                frames.sort((a, b) => a - b);
                resolve({
                  frames: frames.length,
                  p50: frames[Math.floor(frames.length * 0.5)],
                  p95: frames[Math.floor(frames.length * 0.95)],
                  longTasks,
                });
              }, 10000);
            }),
        );
        const lab = page.getByTestId("orbit-lab");
        const renderer = JSON.parse(
          (await lab.getAttribute("data-render-metrics")) || "null",
        );
        const canvas = await page
          .locator("[data-orbit-canvas]")
          .evaluateAll((els) =>
            els.map((el) => ({
              width: el.width,
              height: el.height,
              cssWidth: el.clientWidth,
              cssHeight: el.clientHeight,
            })),
          );
        const sample = {
          width,
          run,
          quality: "standard",
          deviceScaleFactor: 1,
          windowMs: 10000,
          timing,
          renderer,
          canvas,
          status: await lab.getAttribute("data-status"),
          tick: Number(await lab.getAttribute("data-tick")),
          fallback: canvas.length === 0,
          errors,
        };
        if (errors.length || sample.tick < 1 || sample.status !== "running")
          throw Error(JSON.stringify(sample));
        samples.push(sample);
        console.log(
          `${width}px run ${run}: p50 ${timing.p50.toFixed(1)}ms / p95 ${timing.p95.toFixed(1)}ms, ${timing.longTasks.length} long tasks`,
        );
      } finally {
        await context.close();
      }
    }
  const report = {
    measuredAt: new Date().toISOString(),
    base,
    browser: browser.version(),
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCores: cpus().length,
    },
    mode: "Real headless desktop Chrome, standard WebGL, active two-carrier execution, ten-second samples; mobile viewport is emulation, not a phone GPU.",
    samples,
    limits: [
      "Frame intervals are wall-clock requestAnimationFrame samples, not GPU timestamps.",
      "No real phone device is attached; do not generalize these measurements to all phones.",
      "Measurements are independent of still screenshot captures and retain all long tasks.",
    ],
  };
  await mkdir("docs/intelligence-lab-v3", { recursive: true });
  await writeFile(
    "docs/intelligence-lab-v3/performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
