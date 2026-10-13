import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { assertDominionInvariants } from "../../packages/intelligence/src/dominion/invariants";
import { validateRecording } from "../../packages/intelligence/src/dominion/recording";
import { compareStrategies } from "../../packages/intelligence/src/dominion/comparison";
import type { DominionRecording } from "../../packages/intelligence/src/dominion/types";

const route = process.env.DOMINION_E2E_ROUTE ?? "/#/intelligence";
const lab = (page: Page) => page.getByTestId("dominion-lab");
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const errors = new WeakMap<Page, string[]>();

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (error) => list.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page) ?? []).toEqual([]));

async function open(page: Page, reduced = true) {
  await page.emulateMedia({
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await page.goto(route);
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await expect(lab(page)).toHaveAttribute("data-mode", "local-simulation");
}

async function view(page: Page, name: string) {
  const close = button(page, "关闭面板");
  if (await close.isVisible()) await close.click();
  await page
    .getByRole("navigation", { name: "工作视图" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function recording(page: Page): Promise<DominionRecording> {
  await view(page, "工程档案");
  const pending = page.waitForEvent("download");
  await button(page, "导出 JSON").click();
  const file = await (await pending).path();
  expect(file).not.toBeNull();
  const data = JSON.parse(await readFile(file!, "utf8")) as DominionRecording;
  expect(validateRecording(data).recording.final).toEqual(data.final);
  expect(assertDominionInvariants(data.final)).toEqual([]);
  return data;
}

function assertRelayFacts(data: DominionRecording) {
  const relay = data.final.missions.find((m) => m.kind === "relay");
  const supply = data.final.missions.find((m) => m.kind === "supply");
  expect(relay?.status).toBe("completed");
  expect(supply?.status).toBe("completed");
  const scan = relay!.steps.find((s) => s.kind === "scan")!;
  const repair = relay!.steps.find((s) => s.kind === "repair")!;
  const delivery = relay!.steps.find((s) => s.kind === "deliver")!;
  expect([scan.role, repair.role, delivery.role]).toEqual([
    "survey",
    "repair",
    "transport",
  ]);
  expect([scan.status, repair.status, delivery.status]).toEqual([
    "completed",
    "completed",
    "completed",
  ]);
  expect(repair.startedAt).toBeGreaterThan(scan.completedAt!);
  expect(delivery.startedAt).toBeGreaterThan(repair.completedAt!);
  expect(relay!.delivered).toMatchObject({ supplies: 2 });
  expect(supply!.delivered).toMatchObject({ energy: 3, supplies: 2 });
  expect(data.final.stations.find((s) => s.id === "lab")!.stock.supplies).toBe(
    2,
  );
  expect(data.final.ledger.consumed.parts).toBe(2);
  expect(data.final.discoveries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        missionId: relay!.id,
        kind: "damage",
        tick: scan.completedAt,
      }),
    ]),
  );
  return { relay: relay!, scan, repair, delivery };
}

test("DOMINION G01 default expedition completes actual relay plus supply without changing fixture", async ({
  page,
}) => {
  await open(page);
  await view(page, "任务编排");
  await expect(page.locator(".dom-mission-tabs [data-mission-id]")).toHaveCount(
    2,
  );
  await page
    .getByRole("combobox", { name: "运行速度", exact: true })
    .selectOption("4");
  await button(page, "启动远征").click();
  await expect(lab(page)).toHaveAttribute("data-completed", "2", {
    timeout: 35000,
  });
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  const data = await recording(page);
  expect(data.initial.scenario).toBe("expedition");
  expect(data.initial.seed).toBe(4217);
  expect(data.final.sessionId).toBe(data.initial.sessionId);
  expect(data.final.missions).toHaveLength(2);
  assertRelayFacts(data);
  expect(data.events.some((e) => e.type === "mission.failed")).toBe(false);
  expect(
    data.commands.every(
      (c) => c.command.type === "start" || c.command.type === "step",
    ),
  ).toBe(true);
});

test("DOMINION G02 test-double rejection stale approval and double confirmation never create extra tasks", async ({
  page,
}) => {
  await open(page);
  await view(page, "任务编排");
  await page.getByText("添加沙箱任务", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "规划替身（不调用模型）", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "任务数量", exact: true })
    .fill("1");
  const missions = page.locator(".dom-mission-tabs [data-mission-id]");
  await expect(missions).toHaveCount(2);

  await button(page, "生成受控提案").click();
  await expect(page.locator("[data-proposal-id]")).toBeVisible();
  await expect(missions).toHaveCount(2);
  await page
    .getByText("只读工具输入 / 输出 / 来源（3）", { exact: true })
    .click();
  const tools = page.locator(".dom-proposal details pre");
  await expect(tools).toContainText("read-world");
  await expect(tools).toContainText("query-resources");
  await expect(tools).toContainText("suggest-mission");
  await button(page, "拒绝提案").click();
  await expect(
    page.getByText("已拒绝草案，没有创建任务。", { exact: true }),
  ).toBeVisible();
  await expect(missions).toHaveCount(2);

  await button(page, "生成受控提案").click();
  await expect(page.locator("[data-proposal-id]")).toBeVisible();
  await button(page, "单步").click();
  await expect(lab(page)).toHaveAttribute("data-tick", "1");
  await button(page, "批准一个任务").click();
  await expect(page.getByText(/执行未获接受：STALE_APPROVAL/)).toBeVisible();
  await expect(missions).toHaveCount(2);

  await button(page, "生成受控提案").click();
  await expect(page.locator("[data-proposal-id]")).toBeVisible();
  await button(page, "批准一个任务").dblclick();
  await expect(missions).toHaveCount(3);
  await expect(page.locator("[data-proposal-id]")).toHaveCount(0);
  await expect(
    page.getByText(
      "已明确批准一个高层任务。仍由运行时逐步执行，未声明交付完成。",
      { exact: true },
    ),
  ).toBeVisible();
  const data = await recording(page);
  const committed = data.commands.filter(
    (c) => c.accepted && c.command.type === "add-mission",
  );
  expect(committed).toHaveLength(1);
  expect(committed[0].id).toMatch(/^planner:/);
  expect(data.final.missions.at(-1)!.status).toBe("queued");
  expect(data.final.missions.at(-1)!.delivered).toEqual({
    energy: 0,
    supplies: 0,
    parts: 0,
    samples: 0,
  });
});

test("DOMINION G03 reduced-motion 2D tour is reachable and user takeover stops commands for three seconds", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sceneRequests: string[] = [];
  page.on("request", (request) => {
    if (/DominionScene[^/]*\.(js|vue)(\?|$)/.test(request.url()))
      sceneRequests.push(request.url());
  });
  await open(page);
  await expect(page.getByTestId("dominion-map")).toBeVisible();
  await expect(button(page, "三维")).toHaveAttribute("aria-pressed", "true");
  await expect(button(page, "远征导览 · 约100秒")).toBeVisible();
  // Reduced motion is initialized before the async scene's first render.
  // Observe both narrow layouts without loading or replacing the 2D world.
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: width === 360 ? 800 : 844 });
    const targets = await page
      .locator(
        ".dom-nav button, .dom-minor-controls button, .dom-minor-controls select",
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: element.getAttribute("aria-label") ?? element.textContent,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(
        target.width,
        `${width}px ${target.label} touch width`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        target.height,
        `${width}px ${target.label} touch height`,
      ).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  expect(sceneRequests).toHaveLength(0);
  const requestsBefore = sceneRequests.length;
  await button(page, "远征导览 · 约100秒").click();
  await expect
    .poll(async () => Number(await lab(page).getAttribute("data-tick")), {
      timeout: 15000,
    })
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator("[data-dominion-canvas]")).toHaveCount(0);
  expect(sceneRequests).toHaveLength(requestsBefore);
  await button(page, "暂停世界").click();
  await expect(lab(page)).toHaveAttribute("data-guide", "taken-over");
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  const before = await recording(page);
  await page.waitForTimeout(3000); // Explicitly prove no later scripted commands resume.
  const after = await recording(page);
  expect(after).toEqual(before);
  await view(page, "全息星图");
  const lane = page.getByRole("button", {
    name: "航道 gate-ice 可通行",
    exact: true,
  });
  await lane.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "世界对象", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lane).toBeFocused();
  await expect(page.locator("[data-dominion-canvas]")).toHaveCount(0);
  expect(sceneRequests).toHaveLength(requestsBefore);
});

interface TourObservation {
  elapsedMs: number;
  guide: string;
  tick: number;
  worldVersion: number;
  completed: number;
  status: string;
  sessionId: string;
}
interface BranchObservation {
  strategy: string;
  completed: string;
  metrics: Record<string, string>;
  traceCount: number;
}

test("DOMINION G04 full unaccelerated tour gates scan closure repair comparison and actual delivery", async ({
  page,
}, testInfo) => {
  test.setTimeout(150000);
  await open(page, false);
  await expect(page.locator("[data-dominion-canvas]")).toBeVisible();
  const observations: TourObservation[] = [];
  let branches: BranchObservation[] = [];
  const started = Date.now();
  await button(page, "远征导览 · 约100秒").click();
  try {
    while (Date.now() - started < 135000) {
      const state = await lab(page).evaluate((element) => ({
        guide: element.dataset.guide ?? "",
        tick: Number(element.dataset.tick),
        worldVersion: Number(element.dataset.worldVersion),
        completed: Number(element.dataset.completed),
        status: element.dataset.status ?? "",
        sessionId: element.dataset.sessionId ?? "",
      }));
      if (observations.at(-1)?.guide !== state.guide)
        observations.push({ elapsedMs: Date.now() - started, ...state });
      expect(
        ["stopped", "taken-over", "idle"],
        "Tour must report actual failure, never silently restart",
      ).not.toContain(state.guide);
      if (state.guide === "comparison-hold" && !branches.length) {
        expect(state.status).toBe("paused");
        expect(state.completed).toBe(1); // Branch predictions must not become the main-world deliveries.
        branches = await page.locator("[data-branch]").evaluateAll((elements) =>
          elements.map((element) => ({
            strategy: element.getAttribute("data-strategy") ?? "",
            completed:
              element.querySelector("h3")?.textContent?.replace(/\s/g, "") ??
              "",
            metrics: Object.fromEntries(
              Array.from(element.querySelectorAll("dl > div"), (row) => [
                row.querySelector("dt")?.textContent?.trim() ?? "",
                row.querySelector("dd")?.textContent?.trim() ?? "",
              ]),
            ),
            traceCount: element.querySelectorAll("[data-trace-ship]").length,
          })),
        );
      }
      if (state.guide === "completed") break;
      // Observe the real clock without clicking, changing speed, or faking timers.
      await page.waitForTimeout(250);
    }
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeGreaterThanOrEqual(90000);
    expect(elapsedMs).toBeLessThan(140000);
    await expect(lab(page)).toHaveAttribute("data-guide", "completed");
    await expect(page.locator(".dom-hero")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "接力任务已完成", exact: true }),
    ).toBeVisible();
    await expect(lab(page)).toHaveAttribute("data-completed", "2");
    expect(observations.map((s) => s.guide)).toEqual(
      expect.arrayContaining([
        "intro",
        "scan",
        "closure",
        "repair",
        "comparison-hold",
        "delivery",
        "completed",
      ]),
    );
    expect(new Set(observations.map((s) => s.sessionId)).size).toBe(1);
    expect(branches.map((b) => b.strategy)).toEqual(["time", "energy"]);

    // Only now may a test interaction take over: the real guide is already done.
    await button(page, "继续自由探索").click();
    const data = await recording(page);
    const valid = validateRecording(data);
    const { relay, scan, repair, delivery } = assertRelayFacts(data);
    const scanEvent = data.events.find(
      (e) =>
        e.type === "step.completed" &&
        e.missionId === relay.id &&
        e.payload.stepId === scan.id,
    )!;
    const closure = data.events.find(
      (e) =>
        e.type === "lane.permission-changed" &&
        e.payload.laneId === "forge-relay" &&
        e.payload.open === false,
    )!;
    const repaired = data.events.find((e) => e.type === "relay.repaired")!;
    const delivered = data.events.find(
      (e) => e.type === "cargo.delivered" && e.missionId === relay.id,
    )!;
    expect(closure).toBeDefined();
    expect(closure.tick).toBe(scan.completedAt);
    expect(closure.seq).toBeGreaterThan(scanEvent.seq);
    expect(repaired.seq).toBeGreaterThan(closure.seq);
    expect(repaired.payload.partsConsumed).toBe(2);
    expect(delivered.seq).toBeGreaterThan(repaired.seq);
    expect(delivered.tick).toBe(delivery.completedAt);
    expect(data.final.lanes.find((l) => l.id === "forge-relay")!.open).toBe(
      false,
    );
    expect(
      data.events.some(
        (e) =>
          e.seq > closure.seq &&
          e.type === "ship.departed" &&
          e.payload.laneId === "forge-relay",
      ),
    ).toBe(false);
    expect(data.events.some((e) => e.type === "mission.failed")).toBe(false);
    expect(data.commands.some((c) => c.command.type === "set-strategy")).toBe(
      false,
    );

    const comparisonPoint = observations.find(
      (s) => s.guide === "comparison-hold",
    )!;
    expect(comparisonPoint.tick).toBe(repair.completedAt);
    expect(comparisonPoint.tick).toBeLessThan(delivery.completedAt!);
    const frame = valid.frames.find(
      (f) =>
        f.snapshot.tick === comparisonPoint.tick &&
        f.snapshot.worldVersion === comparisonPoint.worldVersion &&
        f.snapshot.status === "paused",
    );
    expect(frame).toBeDefined();
    const expected = compareStrategies(
      frame!.snapshot,
      "time",
      "energy",
      data.events[frame!.eventCount - 1]?.seq ?? 0,
    );
    for (const [index, branch] of [expected.a, expected.b].entries()) {
      expect(branches[index].completed).toBe(`${branch.completed}项任务完成`);
      expect(branches[index].metrics["额外模拟步"]).toBe(String(branch.ticks));
      expect(branches[index].metrics["能源消耗"]).toBe(
        `${branch.energyUsed} EU`,
      );
      expect(branches[index].metrics["约束违规"]).toBe("0");
      expect(branches[index].metrics["失败 / 超期"]).toBe("0 / 0");
      expect(branches[index].traceCount).toBeGreaterThan(0);
    }
    await testInfo.attach("validated-guide-recording", {
      body: JSON.stringify(data),
      contentType: "application/json",
    });
  } finally {
    await testInfo.attach("actual-guide-observations", {
      body: JSON.stringify({ observations, branches }, null, 2),
      contentType: "application/json",
    });
  }
});
