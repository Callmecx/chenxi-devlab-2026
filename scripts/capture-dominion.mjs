import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { resolve, relative, join } from "node:path";

// Production evidence only: no runtime injection, fake task completion or image edits.
// node scripts/capture-dominion.mjs http://127.0.0.1:4173/#/intelligence [output-directory]
const target = new URL(
  process.argv[2] || "http://127.0.0.1:4173/#/intelligence",
);
if (!target.hash) target.hash = "/intelligence";
const out = resolve(
  process.argv[3] ||
    `.local/v4/capture/${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
);
await mkdir(out, { recursive: true });
for (const name of ["tmp", "downloads", "video", "screenshots", "records"])
  await mkdir(join(out, name), { recursive: true });
process.env.TEMP = join(out, "tmp");
process.env.TMP = process.env.TEMP;
const metadataURL = new URL("build-meta.json", target);
metadataURL.hash = "";
const manifest = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  url: target.href,
  host: { platform: platform(), release: release(), cpu: cpus()[0]?.model },
  conditions: {
    deviceScaleFactor: 1,
    desktop: "1440×900, high",
    mobile: "390×844, mobile quality; viewport simulation only",
    audio: "muted by application default",
    capture: "unaltered browser pixels and original Playwright WebM",
  },
  captures: [],
  guide: { transitions: [] },
  errors: [],
  files: [],
};
const lab = (page) => page.getByTestId("dominion-lab");
const button = (page, name) => page.getByRole("button", { name, exact: true });
const canvas = (page) => page.locator("canvas[data-dominion-canvas]");
const files = new Set();
const localPath = (path) => relative(process.cwd(), path).replaceAll("\\", "/");
let browser;

async function buildMetadata() {
  const response = await fetch(metadataURL, { cache: "no-store" });
  if (!response.ok)
    throw new Error(`Build metadata unavailable: ${response.status}`);
  const metadata = await response.json();
  if (
    !/^[a-f0-9]{40}$/.test(metadata.sourceRevision) ||
    typeof metadata.sourceTreeDirty !== "boolean"
  )
    throw new Error(
      "Build metadata must include the actual source revision and dirty flag",
    );
  if (metadata.sourceTreeDirty && process.env.CAPTURE_ALLOW_DIRTY !== "1")
    throw new Error(
      "Formal capture requires a clean build. CAPTURE_ALLOW_DIRTY=1 labels candidate captures only.",
    );
  if (
    process.env.EXPECTED_REVISION &&
    metadata.sourceRevision !== process.env.EXPECTED_REVISION
  )
    throw new Error("Build revision differs from EXPECTED_REVISION");
  return metadata;
}
async function state(page) {
  return lab(page).evaluate((element) => ({ ...element.dataset }));
}
function observe(page, label) {
  page.on("pageerror", (error) =>
    manifest.errors.push({ label, kind: "pageerror", message: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      manifest.errors.push({ label, kind: "console", message: message.text() });
  });
}
async function closeDrawer(page) {
  if (await button(page, "关闭面板").isVisible())
    await button(page, "关闭面板").click();
}
async function view(page, name) {
  await closeDrawer(page);
  await page
    .getByRole("navigation", { name: "工作视图" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function open(page, width) {
  await page.goto(target.href, { waitUntil: "networkidle" });
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(canvas(page)).toHaveAttribute("data-rendering", "active", {
    timeout: 30000,
  });
  await button(page, "世界设置").click();
  await page
    .getByRole("combobox", { name: "图形质量", exact: true })
    .selectOption(width < 500 ? "mobile" : "high");
  await closeDrawer(page);
}
async function scenario(page, name) {
  await closeDrawer(page);
  await button(page, "世界设置").click();
  await page
    .getByRole("combobox", { name: "世界场景", exact: true })
    .selectOption(name);
  await button(page, "重置并应用场景").click();
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
}
async function recording(page, name) {
  await view(page, "工程档案");
  const pending = page.waitForEvent("download");
  await button(page, "导出 JSON").click();
  const download = await pending;
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  if (
    data.schemaVersion !== 4 ||
    data.final.sessionId !== (await state(page)).sessionId
  )
    throw new Error("Export is not the visible V4 session");
  if (name) {
    const file = join(out, "records", `${name}.json`);
    await writeFile(file, JSON.stringify(data, null, 2));
    files.add(file);
  }
  await download.delete();
  return data;
}
async function advanceTo(page, predicate, name) {
  // Use explicit paused simulation steps. The predicate reads the exported
  // authoritative snapshot instead of assuming a particular successful tick.
  for (let count = 0; count < 100; count++) {
    await button(page, "单步").click();
    const record = await recording(page);
    const ship = record.final.ships.find(predicate);
    if (ship) {
      const file = join(out, "records", `${name}.json`);
      await writeFile(file, JSON.stringify(record, null, 2));
      files.add(file);
      return { ship, record };
    }
    if (
      record.final.status === "closed" ||
      record.final.missions.every((mission) =>
        ["completed", "failed", "cancelled"].includes(mission.status),
      )
    )
      throw new Error(
        `Actual action for ${name} was not reached before the session finished`,
      );
  }
  throw new Error(
    `Actual action for ${name} was not reached within 100 explicit steps`,
  );
}
async function selectShip(page, id) {
  await view(page, "指挥中枢");
  await button(page, "查看世界对象").click();
  const list = page.locator(".dom-object-list");
  if (!(await list.isVisible()))
    await page.getByText("选择站点、舰船与航道", { exact: true }).click();
  await list.locator(`[data-ship-id="${id}"]`).click();
  await closeDrawer(page);
}
async function camera(page, label, mode) {
  await page
    .locator(".dom-camera-bar")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(canvas(page)).toHaveAttribute("data-camera", mode);
  const id = await canvas(page).getAttribute("data-dominion-canvas");
  const frames = Number(await canvas(page).getAttribute("data-frames"));
  await expect
    .poll(async () => Number(await canvas(page).getAttribute("data-frames")))
    .toBeGreaterThan(frames);
  await page.waitForTimeout(900);
  await expect(canvas(page)).toHaveAttribute("data-camera", mode);
  await expect(canvas(page)).toHaveAttribute("data-dominion-canvas", id);
}
async function shot(page, name, facts = {}) {
  if (await button(page, "关闭提示").isVisible())
    await button(page, "关闭提示").click();
  await page.mouse.move(2, 2);
  const file = join(out, "screenshots", `${name}.png`);
  await page.screenshot({ path: file });
  files.add(file);
  const rendering = await canvas(page).evaluateAll((elements) =>
    elements.map((element) => ({ ...element.dataset })),
  );
  const dimensions = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
  }));
  if (dimensions.scrollWidth > dimensions.viewport.width + 1)
    throw new Error(`Horizontal overflow in ${name}`);
  manifest.captures.push({
    name,
    file: localPath(file),
    state: await state(page),
    rendering,
    ...dimensions,
    facts,
  });
  console.log(`Captured ${name}`);
}
async function sceneSet(width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 500 ? 844 : 900 },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    observe(page, `screenshots-${width}`);
    await open(page, width);
    await camera(page, "全域", "overview");
    await shot(page, `${width}-S1-overview`);
    await camera(page, "指挥桥", "cockpit");
    await shot(page, `${width}-S2-cockpit`);
    await scenario(page, "supply");
    const loading = await advanceTo(
      page,
      (ship) =>
        ship.role === "transport" &&
        ship.action?.kind === "load" &&
        ship.action.elapsed > 0,
      `${width}-S3-loading`,
    );
    await selectShip(page, loading.ship.id);
    await camera(page, "靠港", "docking");
    await shot(page, `${width}-S3-loading`, {
      ship: loading.ship,
      sourceRecord: `records/${width}-S3-loading.json`,
    });
    await scenario(page, "expedition");
    const scanning = await advanceTo(
      page,
      (ship) =>
        ship.role === "survey" &&
        ship.action?.kind === "scan" &&
        ship.action.elapsed > 0,
      `${width}-S4-scanning`,
    );
    await selectShip(page, scanning.ship.id);
    await camera(page, "扫描", "scan");
    await shot(page, `${width}-S4-scanning`, {
      ship: scanning.ship,
      sourceRecord: `records/${width}-S4-scanning.json`,
    });
    const repairing = await advanceTo(
      page,
      (ship) =>
        ship.role === "repair" &&
        ["repair", "rescue"].includes(ship.action?.kind) &&
        ship.action.elapsed >= 2,
      `${width}-S5-repairing`,
    );
    await selectShip(page, repairing.ship.id);
    await camera(page, "靠港", "docking");
    await shot(page, `${width}-S5-repairing`, {
      ship: repairing.ship,
      sourceRecord: `records/${width}-S5-repairing.json`,
    });
    const before = await recording(page, `${width}-S6-comparison-source`);
    await button(page, "暂停并比较策略").click();
    for (const branch of ["a", "b"]) {
      await expect(page.locator(`[data-branch="${branch}"] svg`)).toBeVisible({
        timeout: 20000,
      });
      await expect(page.locator(`[data-branch="${branch}"]`)).toContainText(
        "项任务完成",
      );
    }
    await expect(lab(page)).toHaveAttribute(
      "data-tick",
      String(before.final.tick),
    );
    await shot(page, `${width}-S6-comparison`, {
      sourceTick: before.final.tick,
      sourceWorldVersion: before.final.worldVersion,
      branches: await page.locator("[data-branch]").allTextContents(),
    });
    if (width < 500) {
      await page.locator('[data-branch="b"]').scrollIntoViewIfNeeded();
      await shot(page, `${width}-S6-comparison-lower`, {
        note: "Second actual viewport of the scrollable comparison panel, not a stitched image.",
      });
    }
    await closeDrawer(page);
    const after = await recording(page, `${width}-S6-comparison-after`);
    if (JSON.stringify(after.final) !== JSON.stringify(before.final))
      throw new Error(
        "Strategy comparison changed the authoritative paused world",
      );
  } finally {
    await context.close();
  }
}
async function guideFilm() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: join(out, "video"),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  observe(page, "guide-film");
  const video = page.video();
  try {
    await open(page, 1440);
    // A DOM observer retains short-lived states such as comparison -> hold;
    // polling alone could miss a valid fast Worker result between two samples.
    await lab(page).evaluate((element) => {
      const diagnostic = { records: [], observer: null };
      diagnostic.observer = new MutationObserver(() => {
        diagnostic.records.push({
          observedAt: performance.now(),
          ...element.dataset,
        });
      });
      diagnostic.observer.observe(element, {
        attributes: true,
        attributeFilter: ["data-guide"],
      });
      window.__dominionMediaObservation = diagnostic;
    });
    await button(page, "远征导览 · 约100秒").click();
    const initial = await state(page),
      started = performance.now();
    manifest.guide.sessionId = initial.sessionId;
    let prior = "";
    while (performance.now() - started < 190000) {
      const current = await state(page);
      if (current.sessionId !== initial.sessionId)
        throw new Error("Guide session changed during the recording");
      if (current.guide !== prior) {
        console.log(`Guide ${current.guide}, T${current.tick}`);
        prior = current.guide;
      }
      if (["completed", "stopped", "taken-over"].includes(current.guide)) break;
      // Observation only: no clicks, wheel, focus changes or screenshot interactions
      // after starting the guide, so the product retains camera ownership.
      await page.waitForTimeout(250);
    }
    const final = await state(page);
    manifest.guide.transitions = await page.evaluate(() => {
      const diagnostic = window.__dominionMediaObservation;
      diagnostic.observer.disconnect();
      const start = diagnostic.records[0]?.observedAt || 0;
      const result = diagnostic.records.map(({ observedAt, ...record }) => ({
        elapsedMs: observedAt - start,
        ...record,
      }));
      delete window.__dominionMediaObservation;
      return result;
    });
    manifest.guide.guideElapsedMs = performance.now() - started;
    manifest.guide.final = final;
    if (final.guide !== "completed")
      throw new Error(`Guide ended in ${final.guide}; kept as failed evidence`);
    const required = [
      "intro",
      "scan",
      "closure",
      "repair",
      "comparison",
      "comparison-hold",
      "delivery",
      "completed",
    ];
    const observed = new Set(
      manifest.guide.transitions.map((transition) => transition.guide),
    );
    if (required.some((phase) => !observed.has(phase)))
      throw new Error("A required guide phase was not observed");
    await page.waitForTimeout(1500);
    await shot(page, "guide-completed", {
      guideElapsedMs: manifest.guide.guideElapsedMs,
    });
    await button(page, "继续自由探索").click();
    const record = await recording(page, "guide-complete-recording");
    const relay = record.final.missions.find(
      (mission) => mission.kind === "relay",
    );
    if (
      relay?.status !== "completed" ||
      !record.events.some((event) => event.type === "relay.repaired") ||
      !record.final.discoveries.length
    )
      throw new Error(
        "Guide completion lacks actual relay repair, discovery or delivery evidence",
      );
    manifest.guide.business = {
      tick: record.final.tick,
      worldVersion: record.final.worldVersion,
      missions: record.final.missions.map(
        ({ id, kind, status, delivered }) => ({ id, kind, status, delivered }),
      ),
      events: record.events.length,
      closedLane: record.final.lanes.find((lane) => lane.id === "forge-relay"),
      discoveryCount: record.final.discoveries.length,
    };
  } finally {
    await context.close();
    if (video) {
      const file = join(out, "video", "dominion-guide-original.webm");
      await video.saveAs(file);
      await video.delete();
      files.add(file);
      manifest.guide.videoFile = localPath(file);
      try {
        const metadata = JSON.parse(
          execFileSync(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration,size:stream=codec_name,width,height,r_frame_rate",
              "-of",
              "json",
              file,
            ],
            { encoding: "utf8", windowsHide: true },
          ),
        );
        manifest.guide.encodedMedia = metadata;
      } catch {
        manifest.guide.encodedMedia = null;
        manifest.guide.durationNote =
          "ffprobe unavailable; guideElapsedMs is automation observation elapsed time, not encoded video duration.";
      }
    }
  }
}

try {
  manifest.buildBefore = await buildMetadata();
  manifest.classification = manifest.buildBefore.sourceTreeDirty
    ? "candidate-preview-dirty"
    : "clean-production-capture";
  browser = await chromium.launch({
    channel: process.env.CI ? undefined : "chrome",
    downloadsPath: join(out, "downloads"),
    headless: true,
  });
  manifest.browser = browser.version();
  await sceneSet(1440);
  await sceneSet(390);
  await guideFilm();
  manifest.buildAfter = await buildMetadata();
  if (
    JSON.stringify(manifest.buildBefore) !== JSON.stringify(manifest.buildAfter)
  )
    throw new Error("Production build changed during capture");
  if (manifest.errors.length)
    throw new Error(
      "Browser errors were recorded; evidence is retained without a pass claim",
    );
  manifest.passed = true;
} catch (error) {
  manifest.passed = false;
  manifest.failure = String(error?.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  console.log("Capture browser closed.");
  for (const file of files) {
    const bytes = await readFile(file);
    manifest.files.push({
      path: localPath(file),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  manifest.finishedAt = new Date().toISOString();
  await writeFile(
    join(out, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(
    `Evidence manifest: ${localPath(join(out, "manifest.json"))}; passed=${manifest.passed}`,
  );
}
