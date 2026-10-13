import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  OrbitRecording,
  OrbitSnapshot,
} from "../../packages/intelligence/src/orbit/types";

// These checks inspect exported browser facts, not renderer positions or planner internals.
const lab = (page: Page) => page.getByTestId("orbit-lab");
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const screenshotDir = resolve(".local/qa/orbit");
const errors = new WeakMap<Page, string[]>();
test.use({ viewport: { width: 1440, height: 900 } });
test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (error) => list.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

async function open(page: Page) {
  await page.goto("/#/intelligence/v3");
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  await expect(button(page, "开始补给任务")).toBeEnabled();
}
async function closePanel(page: Page) {
  if (await button(page, "关闭面板").isVisible())
    await button(page, "关闭面板").click();
}
async function single(page: Page) {
  const previous = Number(await lab(page).getAttribute("data-tick"));
  await button(page, "单步").click();
  await expect(lab(page)).toHaveAttribute("data-tick", String(previous + 1));
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
}
async function run(page: Page, terminal = "completed") {
  await page
    .getByRole("combobox", { name: "运行速度", exact: true })
    .selectOption("4");
  const status = await lab(page).getAttribute("data-status");
  await button(
    page,
    status === "ready"
      ? "开始补给任务"
      : status === "failed"
        ? "重试任务"
        : "继续执行",
  ).click();
  await expect(lab(page)).toHaveAttribute("data-status", terminal, {
    timeout: 25000,
  });
}
async function record(page: Page): Promise<OrbitRecording> {
  await button(page, "工程透视").click();
  const pending = page.waitForEvent("download");
  await button(page, "导出执行记录 JSON").click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const data = JSON.parse(await readFile(path!, "utf8")) as OrbitRecording;
  await closePanel(page);
  return data;
}
function last(data: OrbitRecording): OrbitSnapshot {
  return data.events.at(-1)?.snapshot ?? data.initial;
}
function physical(s: OrbitSnapshot) {
  return {
    runId: s.runId,
    tick: s.simTick,
    stations: s.stations,
    task: s.task,
    carriers: s.carriers.map((c) => ({
      id: c.id,
      node: c.nodeId,
      transit: c.transit,
      cargo: c.cargo,
      reserved: c.reserved,
      energy: c.energy,
      delivered: c.delivered,
    })),
    actions: s.actionIds,
  };
}
function assertEvidence(data: OrbitRecording) {
  expect(data.schemaVersion).toBe(3);
  expect(data.events.length).toBeGreaterThan(0);
  expect(new Set(data.events.map((e) => e.eventId)).size).toBe(
    data.events.length,
  );
  let previous = data.initial;
  for (const [index, e] of data.events.entries()) {
    const s = e.snapshot;
    expect(e.seq).toBe(index + 1);
    expect(e.runId).toBe(data.initial.runId);
    expect(s.runId).toBe(e.runId);
    expect(s.simTick).toBeGreaterThanOrEqual(previous.simTick);
    expect(s.worldVersion).toBeGreaterThanOrEqual(previous.worldVersion);
    expect(
      s.stations.reduce((n, st) => n + st.stock, 0) +
        s.carriers.reduce((n, c) => n + c.cargo, 0) +
        s.task.delivered,
    ).toBe(s.task.initialStock);
    expect(s.carriers.reduce((n, c) => n + c.delivered, 0)).toBe(
      s.task.delivered,
    );
    expect(new Set(s.actionIds).size).toBe(s.actionIds.length);
    expect(s.actionIds.slice(0, previous.actionIds.length)).toEqual(
      previous.actionIds,
    );
    for (const st of s.stations) {
      expect(st.stock).toBeGreaterThanOrEqual(0);
      expect(st.reserved).toBeGreaterThanOrEqual(0);
      expect(st.reserved).toBeLessThanOrEqual(st.stock);
      expect(
        s.carriers.filter((c) =>
          c.transit ? c.transit.to === st.id : c.nodeId === st.id,
        ).length,
      ).toBeLessThanOrEqual(st.dockCapacity);
    }
    for (const lane of s.lanes)
      expect(
        s.carriers.filter((c) => c.transit?.laneId === lane.id).length,
      ).toBeLessThanOrEqual(lane.capacity);
    for (const c of s.carriers) {
      expect(c.cargo + c.reserved).toBeLessThanOrEqual(c.capacity);
      expect(c.energy).toBeGreaterThanOrEqual(0);
      expect(c.energy).toBeLessThanOrEqual(
        previous.carriers.find((p) => p.id === c.id)!.energy,
      );
      if (c.route.length) expect(c.planVersion).toBe(s.worldVersion);
    }
    if (e.type === "carrier.departed")
      expect(s.lanes.find((l) => l.id === e.payload.laneId)?.open).toBe(true);
    previous = s;
  }
}
async function scenario(page: Page, value: string) {
  await button(page, "任务设置").click();
  await page
    .getByRole("combobox", { name: "验收场景", exact: true })
    .selectOption(value);
  await button(page, "重置并应用场景").click();
  await closePanel(page);
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
}
async function chooseLane(page: Page, id: string) {
  await button(page, "查看世界对象").click();
  await page.locator(`[data-lane-id="${id}"]`).click();
}

for (const size of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]) {
  test(`ORBIT ${size.width}: 首屏主按钮可见、无横溢出、3D真实挂载与状态诚实`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await open(page);
    await expect(page.locator("canvas[data-orbit-canvas]")).toHaveAttribute(
      "data-rendering",
      "active",
    );
    await page.evaluate(() => document.fonts.ready);
    const bounds = await button(page, "开始补给任务").boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(size.width);
    await expect(lab(page)).toHaveAttribute("data-delivered", "0");
    await expect(button(page, "开启声音")).toBeVisible();
    await page.screenshot({
      path: resolve(screenshotDir, `orbit-${size.width}-initial.png`),
    });
  });
}

test("ORBIT 正常补给：两载体真实交付、所有事件资源/容量/能量守恒与动作唯一", async ({
  page,
}) => {
  await open(page);
  const id = await lab(page).getAttribute("data-run-id");
  await run(page);
  await expect(lab(page)).toHaveAttribute("data-run-id", id!);
  await expect(lab(page)).toHaveAttribute("data-delivered", "3");
  const data = await record(page);
  assertEvidence(data);
  expect(
    last(data)
      .carriers.map((c) => c.delivered)
      .sort(),
  ).toEqual([1, 2]);
  expect(
    data.events
      .filter((e) => e.type === "cargo.delivered")
      .reduce((n, e) => n + Number(e.payload.quantity), 0),
  ).toBe(3);
  expect(
    last(data).carriers.every((c) => c.cargo === 0 && c.reserved === 0),
  ).toBe(true);
  await expect(button(page, "单步")).toBeDisabled();
});

test("ORBIT 暂停/单步只前进一tick；五种镜头和二维切换不改业务身份或物资", async ({
  page,
}) => {
  await open(page);
  await single(page);
  await single(page);
  const before = last(await record(page));
  for (const camera of [
    "世界全景",
    "载体近景",
    "跟随载体",
    "工程透视",
    "切换任务星图",
  ]) {
    await button(page, camera).click();
    await closePanel(page);
    await expect(lab(page)).toHaveAttribute("data-run-id", before.runId);
    await expect(lab(page)).toHaveAttribute(
      "data-tick",
      String(before.simTick),
    );
    await expect(lab(page)).toHaveAttribute(
      "data-world-version",
      String(before.worldVersion),
    );
  }
  await expect(page.getByTestId("orbit-map")).toBeVisible();
  expect(physical(last(await record(page)))).toEqual(physical(before));
  await button(page, "继续执行").click();
  await expect
    .poll(async () => Number(await lab(page).getAttribute("data-tick")))
    .toBeGreaterThan(before.simTick);
  await button(page, "暂停任务").click();
  const paused = await lab(page).getAttribute("data-tick");
  await page.waitForTimeout(1100);
  await expect(lab(page)).toHaveAttribute("data-tick", paused!);
});

test("ORBIT 关闭在途航道：版本失效、已有载体到下一安全节点、后续不进入关闭边", async ({
  page,
}) => {
  await open(page);
  await single(page);
  await single(page);
  const before = last(await record(page));
  const moving = before.carriers.find((c) => c.transit)!;
  expect(moving.transit).not.toBeNull();
  const laneId = moving.transit!.laneId;
  await chooseLane(page, laneId);
  await button(page, "关闭这条航道").click();
  await expect(page.locator(`[data-lane-id="${laneId}"]`)).toHaveAttribute(
    "data-open",
    "false",
  );
  await expect(lab(page)).toHaveAttribute(
    "data-world-version",
    String(before.worldVersion + 1),
  );
  await closePanel(page);
  const closed = last(await record(page));
  expect(closed.carriers.find((c) => c.id === moving.id)!.transit).toEqual(
    moving.transit,
  );
  expect(closed.carriers.every((c) => !c.route.length)).toBe(true);
  await run(page);
  const data = await record(page);
  assertEvidence(data);
  const closure = data.events.findIndex(
    (e) => e.type === "world.lane-changed" && e.payload.laneId === laneId,
  );
  expect(closure).toBeGreaterThan(0);
  const subsequent = data.events.slice(closure + 1);
  expect(
    subsequent.some(
      (e) =>
        e.type === "carrier.arrived" &&
        e.payload.carrierId === moving.id &&
        e.payload.stationId === moving.transit!.to,
    ),
  ).toBe(true);
  expect(
    subsequent.filter(
      (e) => e.type === "carrier.departed" && e.payload.laneId === laneId,
    ),
  ).toHaveLength(0);
});

test("ORBIT 全封路真实失败，开放后同run重试恢复且不重复交付", async ({
  page,
}) => {
  await open(page);
  const id = await lab(page).getAttribute("data-run-id");
  await button(page, "封闭所有航道").click();
  await run(page, "failed");
  const failed = await record(page);
  expect(last(failed).failureCode).toBe("UNREACHABLE");
  expect(last(failed).task.delivered).toBe(0);
  expect(last(failed).stations.reduce((n, s) => n + s.stock, 0)).toBe(4);
  await button(page, "重新开放所有航道").click();
  await run(page);
  await expect(lab(page)).toHaveAttribute("data-run-id", id!);
  await expect(lab(page)).toHaveAttribute("data-delivered", "3");
  assertEvidence(await record(page));
});

for (const [value, code] of [
  ["sealed", "UNREACHABLE"],
  ["scarce", "INSUFFICIENT_STOCK"],
  ["low-energy", "INSUFFICIENT_ENERGY"],
]) {
  test(`ORBIT ${value}：明确有限失败，未虚构交付或扣成负库存`, async ({
    page,
  }) => {
    await open(page);
    const original = await lab(page).getAttribute("data-run-id");
    await scenario(page, value!);
    await expect(lab(page)).not.toHaveAttribute("data-run-id", original!);
    await run(page, "failed");
    const data = await record(page);
    assertEvidence(data);
    expect(last(data).failureCode).toBe(code);
    expect(last(data).task.delivered).toBe(0);
    expect(data.events.some((e) => e.type === "cargo.loaded")).toBe(false);
    const count = data.events.length;
    await page.waitForTimeout(700);
    expect((await record(page)).events).toHaveLength(count);
  });
}

test("ORBIT 预置绕行：tick4故障真实进入事件，自动重规划后送达", async ({
  page,
}) => {
  await open(page);
  await scenario(page, "detour");
  await run(page);
  const data = await record(page);
  assertEvidence(data);
  expect(last(data).appliedFaults).toEqual([0]);
  expect(last(data).worldVersion).toBeGreaterThan(1);
  expect(last(data).lanes.find((l) => l.id === "relay-target")!.open).toBe(
    false,
  );
  expect(data.events.some((e) => e.simTick === 4 && e.worldVersion === 2)).toBe(
    true,
  );
});

test("ORBIT 真Worker双分支隔离；采纳只换策略不导入未来动作", async ({
  page,
}) => {
  await open(page);
  await single(page);
  await single(page);
  const before = last(await record(page));
  const workerStarted = page.waitForEvent("worker");
  await button(page, "暂停并比较策略").click();
  const worker = await workerStarted;
  expect(worker.url()).toContain("orbit.worker");
  for (const strategy of ["time", "energy"]) {
    const branch = page.locator(`[data-branch="${strategy}"]`);
    await expect(branch).toBeVisible();
    await expect(branch).toContainText("3/3");
    await expect(
      branch
        .locator("dl > div")
        .filter({ has: page.locator("dt", { hasText: "约束违规" }) })
        .locator("dd"),
    ).toHaveText("0");
  }
  await expect(lab(page)).toHaveAttribute("data-tick", String(before.simTick));
  await expect(lab(page)).toHaveAttribute(
    "data-delivered",
    String(before.task.delivered),
  );
  await button(page, "采用能耗策略").click();
  const adopted = last(await record(page));
  expect(adopted.strategy).toBe("energy");
  expect(adopted.worldVersion).toBe(before.worldVersion + 1);
  expect(physical(adopted)).toEqual(physical(before));
  await run(page);
  assertEvidence(await record(page));
});

test("ORBIT 比较期间重置取消旧Worker，不把旧分支应用到新run", async ({
  page,
}) => {
  await open(page);
  await single(page);
  const old = await lab(page).getAttribute("data-run-id");
  const workerClosed = page
    .waitForEvent("worker")
    .then((worker) => worker.waitForEvent("close"));
  await button(page, "暂停并比较策略").click();
  await button(page, "重置世界").click();
  await workerClosed;
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(lab(page)).not.toHaveAttribute("data-run-id", old!);
  await page.waitForTimeout(700);
  await expect(page.locator("[data-branch]")).toHaveCount(0);
  const data = await record(page);
  expect(last(data).simTick).toBe(0);
  expect(last(data).actionIds).toHaveLength(0);
  expect(last(data).task.delivered).toBe(0);
});

test("ORBIT 导入有效历史是隔离只读投影，退出后恢复新的实时世界", async ({
  page,
}) => {
  await open(page);
  await run(page);
  const saved = await record(page);
  await button(page, "重置世界").click();
  const fresh = await record(page);
  expect(fresh.initial.runId).not.toBe(saved.initial.runId);
  await button(page, "工程透视").click();
  await page.getByLabel("导入执行记录", { exact: true }).setInputFiles({
    name: "verified-orbit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(lab(page)).toHaveAttribute("data-mode", "history-replay");
  await expect(lab(page)).toHaveAttribute("data-run-id", saved.initial.runId);
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
  await closePanel(page);
  await page
    .getByRole("slider", { name: "回放进度" })
    .fill(String(saved.events.length - 1));
  await expect(lab(page)).toHaveAttribute("data-delivered", "3");
  await expect(button(page, "封闭所有航道")).toBeDisabled();
  expect(await record(page)).toEqual(saved);
  await button(page, "返回实时世界").click();
  await expect(lab(page)).toHaveAttribute("data-run-id", fresh.initial.runId);
  await expect(lab(page)).toHaveAttribute("data-delivered", "0");
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  expect(await record(page)).toEqual(fresh);
});

test("ORBIT 分支结果过期后禁用采用，重新计算失败分支也不能伪报成功", async ({
  page,
}) => {
  await open(page);
  await single(page);
  await button(page, "暂停并比较策略").click();
  await expect(button(page, "采用能耗策略")).toBeEnabled();
  await button(page, "封闭所有航道").click();
  await expect(button(page, "采用能耗策略")).toBeDisabled();
  await expect(button(page, "采用时效策略")).toBeDisabled();
  await button(page, "从当前暂停快照计算").click();
  for (const strategy of ["time", "energy"]) {
    const branch = page.locator(`[data-branch="${strategy}"]`);
    await expect(branch).toContainText("任务受阻");
    await expect(branch).toContainText("0/3");
    await expect(
      branch
        .locator("dl > div")
        .filter({ has: page.locator("dt", { hasText: "约束违规" }) })
        .locator("dd"),
    ).toHaveText("0");
  }
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  await expect(lab(page)).toHaveAttribute("data-delivered", "0");
  const data = await record(page);
  assertEvidence(data);
  expect(last(data).simTick).toBe(1);
});

test("ORBIT 回放随机seek只读；返回实时保持全量事件，损坏记录拒绝导入", async ({
  page,
}) => {
  await open(page);
  await run(page);
  const before = await record(page);
  await button(page, "查看回放").click();
  await expect(lab(page)).toHaveAttribute("data-mode", "history-replay");
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
  await expect(button(page, "封闭所有航道")).toBeDisabled();
  const seek = page.getByRole("slider", { name: "回放进度" });
  for (const index of [
    before.events.length - 1,
    2,
    Math.floor(before.events.length / 2),
    -1,
  ]) {
    await seek.fill(String(index));
    const s = index < 0 ? before.initial : before.events[index]!.snapshot;
    await expect(lab(page)).toHaveAttribute("data-tick", String(s.simTick));
    await expect(lab(page)).toHaveAttribute(
      "data-delivered",
      String(s.task.delivered),
    );
    await expect(lab(page)).toHaveAttribute(
      "data-world-version",
      String(s.worldVersion),
    );
  }
  expect(await record(page)).toEqual(before);
  await button(page, "返回实时世界").click();
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  await expect(lab(page)).toHaveAttribute("data-status", "completed");
  const corrupted = structuredClone(before);
  corrupted.events.at(-1)!.snapshot.carriers[0]!.energy = -1;
  await button(page, "工程透视").click();
  await page.getByLabel("导入执行记录", { exact: true }).setInputFiles({
    name: "invalid-orbit.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(corrupted)),
  });
  await expect(page.locator(".orbit-notice")).toContainText("导入失败");
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  expect(await record(page)).toEqual(before);
});

test("ORBIT 取消释放未装载预留，保留已装载货物与能量；重置生成新run", async ({
  page,
}) => {
  await open(page);
  for (let i = 0; i < 5; i++) await single(page);
  const before = last(await record(page));
  expect(before.carriers.some((c) => c.cargo > 0)).toBe(true);
  await button(page, "取消任务").click();
  await expect(lab(page)).toHaveAttribute("data-status", "cancelled");
  const cancelled = await record(page);
  assertEvidence(cancelled);
  expect(last(cancelled).carriers.every((c) => c.reserved === 0)).toBe(true);
  expect(last(cancelled).carriers.map((c) => c.cargo)).toEqual(
    before.carriers.map((c) => c.cargo),
  );
  expect(last(cancelled).carriers.map((c) => c.energy)).toEqual(
    before.carriers.map((c) => c.energy),
  );
  await button(page, "重置世界").click();
  await expect(lab(page)).not.toHaveAttribute("data-run-id", before.runId);
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  expect(last(await record(page)).actionIds).toHaveLength(0);
});

test("ORBIT reduced-motion二维与键盘选航道可完成相同业务", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await expect(page.getByTestId("orbit-map")).toBeVisible();
  await expect(page.locator("canvas[data-orbit-canvas]")).toHaveCount(0);
  const lane = page.getByRole("button", {
    name: "航道 relay-target 畅通",
    exact: true,
  });
  await lane.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".orbit-object-detail h3")).toHaveText(
    "relay-target",
  );
  await button(page, "关闭这条航道").click();
  await closePanel(page);
  await expect(
    page.getByRole("button", { name: "航道 relay-target 关闭", exact: true }),
  ).toBeVisible();
  await run(page);
  assertEvidence(await record(page));
});

test("ORBIT WebGL上下文丢失自动二维，暂停事实保留后仍可完成", async ({
  page,
}) => {
  await open(page);
  const canvas = page.locator("canvas[data-orbit-canvas]");
  await expect(canvas).toHaveAttribute("data-rendering", "active");
  await single(page);
  const before = last(await record(page));
  const lost = await canvas.evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return !!extension;
  });
  expect(lost).toBe(true);
  await expect(page.getByTestId("orbit-map")).toBeVisible();
  await expect(page.locator(".orbit-notice")).toContainText("上下文不可用");
  expect(physical(last(await record(page)))).toEqual(physical(before));
  await run(page);
});

test("ORBIT 手机横竖切换保留身份与货物，主要动作触控高度至少44px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await single(page);
  const before = last(await record(page));
  for (const size of [
    { width: 844, height: 390 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await expect(lab(page)).toHaveAttribute("data-run-id", before.runId);
    await expect(lab(page)).toHaveAttribute(
      "data-tick",
      String(before.simTick),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(size.width);
  }
  for (const name of [
    "继续执行",
    "单步",
    "重置世界",
    "查看世界对象",
    "任务设置",
  ]) {
    const bounds = await button(page, name).boundingBox();
    expect(bounds, `${name} exists`).not.toBeNull();
    expect(bounds!.height, `${name} touch height`).toBeGreaterThanOrEqual(44);
  }
  expect(physical(last(await record(page)))).toEqual(physical(before));
});

test("ORBIT 十次挂载卸载释放实际WebGL上下文与canvas，回到新run", async ({
  page,
}) => {
  test.setTimeout(120000);
  const ids = new Set<string>();
  await open(page);
  for (let i = 0; i < 10; i++) {
    await expect(lab(page)).toHaveAttribute("data-status", "ready");
    const canvas = page.locator("canvas[data-orbit-canvas]");
    await expect(canvas).toHaveAttribute("data-rendering", "active");
    await expect(canvas).toHaveCount(1);
    const handle = await canvas.elementHandle();
    const id = (await lab(page).getAttribute("data-run-id"))!;
    expect(ids.has(id)).toBe(false);
    ids.add(id);
    await single(page);
    // Hash navigation preserves the document, so this checks component disposal, not a browser reload.
    await page.evaluate(() => {
      location.hash = "#/projects";
    });
    await expect(lab(page)).toHaveCount(0);
    expect(
      await handle!.evaluate((c) => ({
        connected: c.isConnected,
        lost: (c as HTMLCanvasElement).getContext("webgl2")?.isContextLost(),
      })),
    ).toEqual({ connected: false, lost: true });
    await handle!.dispose();
    await page.evaluate(() => {
      location.hash = "#/intelligence/v3";
    });
  }
});

test("ORBIT 优先级改变真实预留次序；更换目标触发新版本而不改变既有物资", async ({
  page,
}) => {
  await open(page);
  await button(page, "任务设置").click();
  const priority = page.getByRole("combobox", {
    name: "巡航者 A 优先级",
    exact: true,
  });
  await priority.selectOption("0");
  await expect(lab(page)).toHaveAttribute("data-world-version", "2");
  await page
    .getByRole("combobox", { name: "信使 B 优先级", exact: true })
    .selectOption("2");
  await expect(lab(page)).toHaveAttribute("data-world-version", "3");
  await closePanel(page);
  await single(page);
  const first = await record(page);
  expect(
    first.events.find((e) => e.type === "resource.reserved")!.payload.carrierId,
  ).toBe("carrier-b");
  const before = last(first);
  await button(page, "任务设置").click();
  await page
    .getByRole("combobox", { name: "目标站", exact: true })
    .selectOption("port");
  await closePanel(page);
  const after = last(await record(page));
  expect(after.worldVersion).toBe(before.worldVersion + 1);
  expect(after.task.targetId).toBe("port");
  expect(
    after.carriers.map((c) => ({
      cargo: c.cargo,
      energy: c.energy,
      reserved: c.reserved,
    })),
  ).toEqual(
    before.carriers.map((c) => ({
      cargo: c.cargo,
      energy: c.energy,
      reserved: c.reserved,
    })),
  );
  await run(page);
  const data = await record(page);
  assertEvidence(data);
  expect(
    data.events
      .filter((e) => e.type === "cargo.delivered")
      .every((e) => e.payload.targetId === "port"),
  ).toBe(true);
});

test("ORBIT 键盘 Space 与 Enter 都可操作星图对象", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const lane = page.getByRole("button", {
    name: "航道 relay-target 畅通",
    exact: true,
  });
  await lane.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".orbit-object-detail h3")).toHaveText(
    "relay-target",
  );
  await closePanel(page);
  const carrier = page.getByRole("button", {
    name: "载体 巡航者 A 货物 0",
    exact: true,
  });
  await carrier.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".orbit-object-detail h3")).toHaveText("巡航者 A");
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
});

test("ORBIT 减弱动效三维静止时按需绘制，镜头和世界变化后真实更新", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  await button(page, "切换任务星图").click();
  const canvas = page.locator("canvas[data-orbit-canvas]");
  await expect(canvas).toHaveAttribute("data-rendering", "active");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-frames")))
    .toBeGreaterThan(0);
  const identity = await lab(page).getAttribute("data-run-id");
  const frames = () => canvas.getAttribute("data-frames").then(Number);
  await page.mouse.move(10, 10);
  await page.waitForTimeout(150);
  const idleFrames = await frames();
  await page.waitForTimeout(500);
  expect(
    await frames(),
    "unchanged reduced-motion world must not redraw continuously",
  ).toBe(idleFrames);
  await button(page, "跟随载体").click();
  await expect.poll(frames).toBeGreaterThan(idleFrames);
  await expect(lab(page)).toHaveAttribute("data-run-id", identity!);
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
  const cameraFrames = await frames();
  await single(page);
  await expect.poll(frames).toBeGreaterThan(cameraFrames);
  await expect(lab(page)).toHaveAttribute("data-tick", "1");
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  const worldFrames = await frames();
  await page.waitForTimeout(500);
  expect(
    await frames(),
    "paused snapshot should settle after rendering its change",
  ).toBe(worldFrames);
  await expect(lab(page)).toHaveAttribute("data-run-id", identity!);
  await expect(lab(page)).toHaveAttribute("data-delivered", "0");
});

// Keep each camera journey in its own browser context. Slow software-rendered
// screenshot readback must not carry performance-degradation state into the next
// independent journey; the real adaptive fallback remains enabled throughout.
for (const preset of ["世界全景", "跟随载体"]) {
  test(`ORBIT ${preset}按钮恢复拖动前实际构图，而非只改模式标签`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    await button(page, "切换任务星图").click();
    const canvas = page.locator("canvas[data-orbit-canvas]");
    await expect(canvas).toHaveAttribute("data-rendering", "active");
    const original = await lab(page).getAttribute("data-run-id");
    const measurements: {
      preset: string;
      draggedDifference: number;
      restoredDifference: number;
    }[] = [];
    const difference = async (left: Buffer, right: Buffer) =>
      page.evaluate(
        async ({ left, right }) => {
          const pixels = async (base64: string) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const surface = document.createElement("canvas");
            surface.width = 160;
            surface.height = 100;
            const context = surface.getContext("2d")!;
            context.drawImage(image, 0, 0, 160, 100);
            return context.getImageData(0, 0, 160, 100).data;
          };
          const a = await pixels(left),
            b = await pixels(right);
          let sum = 0;
          for (let i = 0; i < a.length; i += 4)
            for (let c = 0; c < 3; c++) sum += Math.abs(a[i + c]! - b[i + c]!);
          return sum / (160 * 100 * 3 * 255);
        },
        { left: left.toString("base64"), right: right.toString("base64") },
      );
    const initialFrames = Number(await canvas.getAttribute("data-frames"));
    await button(page, preset).click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-frames")))
      .toBeGreaterThan(initialFrames);
    const bounds = (await canvas.boundingBox())!;
    // Clear real raycast hover before comparing camera composition. Leaving the
    // canvas alone retains the last hover highlight, which is a separate effect.
    await page.mouse.move(bounds.x + 5, bounds.y + 5);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(150);
    const before = await canvas.screenshot();
    await page.mouse.move(
      bounds.x + bounds.width * 0.65,
      bounds.y + bounds.height - 35,
    );
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width * 0.4,
      bounds.y + bounds.height - 70,
      { steps: 12 },
    );
    await page.mouse.up();
    // A locator screenshot includes overlaid DOM. Dismiss the real camera-help
    // notice so its rectangle does not count as a changed 3D composition.
    await button(page, "关闭提示").click();
    await page.mouse.move(bounds.x + 5, bounds.y + 5);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(150);
    const dragged = await canvas.screenshot();
    const draggedFrames = Number(await canvas.getAttribute("data-frames"));
    await button(page, preset).click();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-frames")))
      .toBeGreaterThan(draggedFrames);
    await page.mouse.move(bounds.x + 5, bounds.y + 5);
    await page.mouse.move(10, 10);
    await page.waitForTimeout(150);
    const restored = await canvas.screenshot();
    await expect(canvas).toBeAttached();
    await expect(canvas).toHaveAttribute("data-rendering", "active");
    for (const [name, pixels] of [
      ["before", before],
      ["dragged", dragged],
      ["restored", restored],
    ] as const)
      await writeFile(info.outputPath(`${name}.png`), pixels);
    const draggedDifference = await difference(before, dragged),
      restoredDifference = await difference(before, restored);
    measurements.push({ preset, draggedDifference, restoredDifference });
    await info.attach(`${preset}-before`, {
      contentType: "image/png",
      body: before,
    });
    await info.attach(`${preset}-dragged`, {
      contentType: "image/png",
      body: dragged,
    });
    await info.attach(`${preset}-restored`, {
      contentType: "image/png",
      body: restored,
    });
    await info.attach(`${preset}-pixel-differences`, {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(measurements.at(-1))),
    });
    expect(
      draggedDifference,
      `${preset} drag visibly changed the actual canvas`,
    ).toBeGreaterThan(0.01);
    expect(
      restoredDifference,
      `${preset} same-preset returns actual canvas`,
    ).toBeLessThan(0.004);
    await expect(lab(page)).toHaveAttribute("data-run-id", original!);
    await expect(lab(page)).toHaveAttribute("data-tick", "0");
    await expect(lab(page)).toHaveAttribute("data-delivered", "0");
    await info.attach("camera-pixel-differences", {
      contentType: "application/json",
      body: Buffer.from(JSON.stringify(measurements, null, 2)),
    });
  });
}

test("ORBIT 慢文件导入不能覆盖reset、新导入、returnLive或卸载后的用户意图", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const text = File.prototype.text;
    File.prototype.text = async function () {
      if (this.name.startsWith("delayed-"))
        await new Promise((resolve) => setTimeout(resolve, 900));
      return text.call(this);
    };
  });
  await open(page);
  await run(page);
  const saved = await record(page);
  await button(page, "重置世界").click();
  const input = page.getByLabel("导入执行记录", { exact: true });
  const upload = async (data: OrbitRecording, name: string) => {
    await button(page, "工程透视").click();
    await input.setInputFiles({
      name,
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  };
  await upload(saved, "delayed-reset.json");
  await button(page, "重置世界").click();
  const resetId = await lab(page).getAttribute("data-run-id");
  await page.waitForTimeout(1100);
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  await expect(lab(page)).toHaveAttribute("data-run-id", resetId!);
  await expect(lab(page)).toHaveAttribute("data-tick", "0");
  const fresh = await record(page);
  await upload(saved, "delayed-older.json");
  await input.setInputFiles({
    name: "newer.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fresh)),
  });
  await expect(lab(page)).toHaveAttribute("data-mode", "history-replay");
  await page.waitForTimeout(1100);
  await expect(lab(page)).toHaveAttribute("data-run-id", fresh.initial.runId);
  await upload(saved, "delayed-return-live.json");
  await button(page, "返回实时世界").click();
  await page.waitForTimeout(1100);
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  await expect(lab(page)).toHaveAttribute("data-run-id", fresh.initial.runId);
  await upload(saved, "delayed-unmount.json");
  await page.evaluate(() => {
    location.hash = "#/projects";
  });
  await expect(lab(page)).toHaveCount(0);
  await page.waitForTimeout(1100);
  await page.evaluate(() => {
    location.hash = "#/intelligence/v3";
  });
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(lab(page)).not.toHaveAttribute(
    "data-run-id",
    saved.initial.runId,
  );
  await expect(lab(page)).not.toHaveAttribute(
    "data-run-id",
    fresh.initial.runId,
  );
});
