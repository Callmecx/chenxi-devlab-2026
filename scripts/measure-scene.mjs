import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const samples = [];
try {
  for (const width of [1440, 390])
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      try {
        const page = await context.newPage();
        await page.goto(
          "http://127.0.0.1:4177/#/intelligence?view=engineering",
        );
        if (width < 741)
          await page
            .getByRole("button", { name: "启用 3D", exact: true })
            .click();
        await expect(page.locator("canvas")).toBeVisible();
        const panel = page.locator(".il-engineer");
        await expect
          .poll(
            async () =>
              Number(
                (await panel.innerText()).match(/采样\s+(\d+)\s+帧/)?.[1] || 0,
              ),
            { timeout: 45000 },
          )
          .toBeGreaterThanOrEqual(180);
        const text = await panel.innerText();
        const match = text.match(
          /采样\s+(\d+)\s+帧，帧间隔 p50\s+([\d.]+)\s+ms \/ p95\s+([\d.]+)\s+ms；draw calls\s+(\d+)，geometry\s+(\d+)，texture\s+(\d+)/,
        );
        if (!match) throw new Error("Renderer metrics were not readable");
        const canvas = await page.locator("canvas").evaluate((el) => ({
          width: el.width,
          height: el.height,
          cssWidth: el.clientWidth,
          cssHeight: el.clientHeight,
        }));
        samples.push({
          width,
          run,
          frames: Number(match[1]),
          p50FrameIntervalMs: Number(match[2]),
          p95FrameIntervalMs: Number(match[3]),
          drawCalls: Number(match[4]),
          geometries: Number(match[5]),
          textures: Number(match[6]),
          canvas,
        });
      } finally {
        await context.close();
      }
    }
  const report = {
    measuredAt: new Date().toISOString(),
    browser: browser.version(),
    mode: "Real opt-in Three.js WebGL in headless desktop Chrome; idle product constellation, 180+ frames per run, three fresh contexts per viewport.",
    samples,
    limits: [
      "rAF frame intervals are not GPU timestamp measurements or real-phone FPS.",
      "Mobile viewport explicitly enables 3D; the Lighthouse mobile navigation batch uses the lightweight 2D default.",
      "Hardware load varies; no general 60fps or memory-leak-free claim. Separate browser tests verify ten actual context disposal cycles.",
    ],
  };
  await mkdir("docs/acceptance", { recursive: true });
  await writeFile(
    "docs/acceptance/scene-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
