import { describe, expect, it } from "vitest";
import { createDominionRuntime, MAX_TICKS } from "./runtime";
import { assertDominionInvariants } from "./invariants";
import { compareStrategies } from "./comparison";
import { sourceKey } from "./identity";
import { createFixture } from "./fixtures";
import type { DominionRuntime } from "./runtime";
import type { Scenario } from "./types";

function run(runtime: DominionRuntime) {
  runtime.dispatch({ type: "resume" });
  let guard = MAX_TICKS + 1;
  while (runtime.snapshot.status === "running" && guard-- > 0) {
    runtime.dispatch({ type: "step" });
    expect(assertDominionInvariants(runtime.snapshot)).toEqual([]);
  }
  expect(guard).toBeGreaterThan(0);
  return runtime.snapshot;
}
function until(
  runtime: DominionRuntime,
  condition: (r: DominionRuntime) => boolean,
  max = 100,
) {
  while (!condition(runtime) && max-- > 0) runtime.dispatch({ type: "step" });
  expect(condition(runtime)).toBe(true);
}

describe("V4 authoritative fleet runtime", () => {
  it.each(["supply", "expedition", "four-missions"] as Scenario[])(
    "finishes %s by world facts and conserves resources throughout",
    (scenario) => {
      const r = createDominionRuntime({
        scenario,
        sessionId: `test-${scenario}`,
      });
      const state = run(r);
      expect(
        state.missions.map((m) => ({
          id: m.id,
          status: m.status,
          reason: m.message,
        })),
      ).toEqual(
        state.missions.map((m) => ({
          id: m.id,
          status: "completed",
          reason: "前置依赖、资源账本与交付事实已核验。",
        })),
      );
      expect(
        state.missions.every((m) =>
          m.steps.every((s) => s.status === "completed"),
        ),
      ).toBe(true);
      expect(
        r.events.filter((e) => e.type === "cargo.delivered").length,
      ).toBeGreaterThan(0);
      expect(state.status).toBe("paused");
    },
  );
  it("T03/T10 three regions, six role-constrained ships, real relay sequence and repair consumption", () => {
    const r = createDominionRuntime({ scenario: "expedition" });
    const end = run(r),
      m = end.missions.find((m) => m.kind === "relay")!;
    expect(new Set(end.stations.map((s) => s.regionId)).size).toBe(3);
    expect(end.stations.length).toBeGreaterThanOrEqual(10);
    expect(end.lanes.length).toBeGreaterThanOrEqual(14);
    expect(end.ships.map((s) => s.role).sort()).toEqual([
      "repair",
      "repair",
      "survey",
      "survey",
      "transport",
      "transport",
    ]);
    expect(m.steps.map((s) => s.role)).toEqual([
      "survey",
      "repair",
      "transport",
    ]);
    expect(m.steps[1].startedAt!).toBeGreaterThanOrEqual(
      m.steps[0].completedAt!,
    );
    expect(m.steps[2].startedAt!).toBeGreaterThanOrEqual(
      m.steps[1].completedAt!,
    );
    expect(end.ledger.consumed.parts).toBe(2);
    expect(end.stations.find((s) => s.id === "lab")!.stock.supplies).toBe(2);
  });
  it("T04/T05 closures preserve an entered segment then replan; damage repair does not reopen user bans", () => {
    const r = createDominionRuntime({ scenario: "supply" });
    until(r, (r) => !!r.snapshot.ships.find((s) => s.transit));
    const entered = r.snapshot.ships.find((s) => s.transit)!;
    r.dispatch({
      type: "set-lane",
      laneId: entered.transit!.laneId,
      open: false,
    });
    expect(r.snapshot.ships.find((s) => s.id === entered.id)!.transit).toEqual(
      entered.transit,
    );
    expect(run(r).missions[0].status).toBe("completed");
    expect(
      r.events.some(
        (e) => e.type === "ship.arrived" && e.payload.shipId === entered.id,
      ),
    ).toBe(true);
    const relay = createDominionRuntime({ scenario: "expedition" });
    relay.dispatch({ type: "set-lane", laneId: "relay-lab", open: false });
    const end = run(relay),
      lane = end.lanes.find((l) => l.id === "relay-lab")!;
    expect(lane.damaged).toBe(false);
    expect(lane.open).toBe(false);
    expect(end.missions.every((m) => m.status === "completed")).toBe(true);
  });
  it.each([
    ["sealed", "UNREACHABLE"],
    ["low-energy", "INSUFFICIENT_ENERGY"],
  ] as const)(
    "T06/T09 %s fails explicitly without teleporting or fabricated stock",
    (scenario, code) => {
      const r = createDominionRuntime({ scenario }),
        before = r.snapshot;
      const end = run(r);
      expect(end.missions[0].failureCode).toBe(code);
      expect(end.ships.map((s) => s.nodeId)).toEqual(
        before.ships.map((s) => s.nodeId),
      );
      expect(end.ledger.consumed.energy).toBe(0);
      expect(end.ledger.generated).toEqual(before.ledger.generated);
    },
  );
  it("T02 finite resource conflict does not oversell and cancel releases only unloaded reservations", () => {
    const r = createDominionRuntime({ scenario: "competition" });
    r.dispatch({ type: "step" });
    expect(r.snapshot.missions.map((m) => m.status)).toContain("waiting");
    expect(
      r.snapshot.stations.find((s) => s.id === "forge")!.reserved.supplies,
    ).toBe(2);
    r.dispatch({ type: "cancel-mission", missionId: "mission-1" });
    expect(
      r.snapshot.stations.find((s) => s.id === "forge")!.reserved.supplies,
    ).toBe(0);
    const end = run(r);
    expect(end.missions[1].status).toBe("completed");
    expect(end.stations.find((s) => s.id === "forge")!.stock.supplies).toBe(1);
  });
  it("T13/T16 cancelled loaded cargo remains owned until physically returned at its current station", () => {
    const r = createDominionRuntime({ scenario: "supply" });
    until(r, (r) => r.snapshot.ships.some((s) => s.cargo.supplies > 0));
    const ship = r.snapshot.ships.find((s) => s.cargo.supplies > 0)!;
    r.dispatch({ type: "cancel-mission", missionId: ship.missionId! });
    expect(r.snapshot.ships.find((s) => s.id === ship.id)!.cargo).toEqual(
      ship.cargo,
    );
    expect(
      r.dispatch({ type: "retry-mission", missionId: "mission-1" }).accepted,
    ).toBe(false);
    const source = r.snapshot.stations.find((s) => s.id === ship.nodeId)!.stock
      .supplies;
    expect(r.dispatch({ type: "return-cargo", shipId: ship.id }).accepted).toBe(
      true,
    );
    expect(
      r.snapshot.stations.find((s) => s.id === ship.nodeId)!.stock.supplies,
    ).toBe(source + ship.cargo.supplies);
  });
  it("T09 rescue uses actual transferred fuel and parts, including persisted interrupted work", () => {
    const r = createDominionRuntime({ scenario: "four-missions" });
    const start = r.snapshot;
    const end = run(r),
      rescued = end.ships.find((s) => s.id === "transport-b")!;
    expect(start.ships.find((s) => s.id === rescued.id)!.disabled).toBe(true);
    expect(rescued.disabled).toBe(false);
    expect(
      r.events.find((e) => e.type === "ship.rescued")!.payload
        .transferredEnergy,
    ).toBe(18);
    expect(end.ledger.consumed.parts).toBe(3);
    expect(end.ledger.generated.energy).toBe(0);
  });
  it("T21 discovery precedes generated samples and their real transfer", () => {
    const r = createDominionRuntime({ scenario: "four-missions" });
    expect(r.snapshot.ledger.generated.samples).toBe(0);
    const end = run(r),
      science = end.missions.find((m) => m.kind === "science")!;
    expect(end.discoveries.find((d) => d.kind === "samples")).toMatchObject({
      stationId: "sample",
      missionId: science.id,
      quantity: 4,
    });
    expect(end.ledger.generated.samples).toBe(4);
    expect(end.stations.find((s) => s.id === "lab")!.stock.samples).toBe(2);
    expect(end.stations.find((s) => s.id === "sample")!.stock.samples).toBe(2);
  });
  it("T13/T16 idempotent commands and closed sessions never duplicate or revive facts", () => {
    const r = createDominionRuntime({ scenario: "supply" });
    expect(r.dispatch({ type: "step" }, "once").accepted).toBe(true);
    const before = r.exportRecording();
    expect(r.dispatch({ type: "step" }, "once").duplicate).toBe(true);
    expect(r.exportRecording()).toEqual(before);
    r.dispatch({ type: "close-session" });
    const closed = r.exportRecording();
    expect(r.dispatch({ type: "resume" }).accepted).toBe(false);
    expect(
      r.dispatch({ type: "set-lane", laneId: "port-forge", open: false })
        .accepted,
    ).toBe(false);
    expect(r.exportRecording()).toEqual(closed);
  });
  it("T07 failure retry creates a new attempt preserving history and partial facts", () => {
    const r = createDominionRuntime({ scenario: "sealed" });
    run(r);
    r.dispatch({ type: "set-all-lanes", open: true });
    expect(
      r.dispatch({ type: "retry-mission", missionId: "mission-1" }).accepted,
    ).toBe(true);
    const end = run(r);
    expect(end.missions[0].status).toBe("completed");
    expect(end.missions[0].attempts.map((a) => a.outcome)).toEqual([
      "failed",
      "completed",
    ]);
    expect(end.missions[0].delivered.supplies).toBe(2);
  });
  it("T08/T12 dock exclusion is a resource constraint with finite stop, then explicit recovery", () => {
    const r = createDominionRuntime({ scenario: "supply" });
    expect(
      r.dispatch({ type: "hold-dock", stationId: "forge", berths: 3 }).accepted,
    ).toBe(true);
    const blocked = run(r);
    expect(blocked.missions[0].status).toBe("failed");
    expect(blocked.tick).toBeLessThan(80);
    expect(blocked.ships.every((s) => s.nodeId !== "forge")).toBe(true);
    r.dispatch({ type: "hold-dock", stationId: "forge", berths: 0 });
    r.dispatch({ type: "retry-mission", missionId: "mission-1" });
    expect(run(r).missions[0].status).toBe("completed");
  });
  it("T11/T22 priority updates preserve entered commitments and connection loss safely pauses", () => {
    const r = createDominionRuntime({ scenario: "expedition" });
    r.dispatch({ type: "step" });
    const inFlight = r.snapshot.ships.map((s) => s.transit);
    r.dispatch({ type: "set-priority", missionId: "mission-2", priority: 9 });
    expect(r.snapshot.ships.map((s) => s.transit)).toEqual(inFlight);
    r.dispatch({ type: "set-connection", connected: false });
    const tick = r.snapshot.tick;
    expect(r.dispatch({ type: "step" }).accepted).toBe(false);
    expect(r.snapshot.tick).toBe(tick);
    r.dispatch({ type: "set-connection", connected: true });
    expect(r.snapshot.status).toBe("paused");
    expect(run(r).missions.every((m) => m.status === "completed")).toBe(true);
  });
  it("T17/T18 same snapshot branches are real, isolated and stale adoption is refused", () => {
    const r = createDominionRuntime({ scenario: "supply" });
    r.dispatch({ type: "pause" });
    const before = r.snapshot,
      recording = r.exportRecording();
    const comparison = compareStrategies(
      before,
      "time",
      "energy",
      r.events.length,
    );
    expect(r.exportRecording()).toEqual(recording);
    expect(comparison.a.completed).toBe(1);
    expect(comparison.b.completed).toBe(1);
    expect(comparison.a.ticks).toBeLessThan(comparison.b.ticks);
    expect(comparison.a.energyUsed).toBeGreaterThan(comparison.b.energyUsed);
    expect(comparison.a.violations).toEqual([]);
    expect(comparison.b.violations).toEqual([]);
    expect(comparison.a.sourceKey).toBe(comparison.b.sourceKey);
    r.dispatch({ type: "set-lane", laneId: "gate-ice", open: false });
    expect(
      r.dispatch({
        type: "set-strategy",
        strategy: "time",
        sourceKey: comparison.sourceKey,
      }).accepted,
    ).toBe(false);
    const fresh = sourceKey(r.snapshot);
    expect(
      r.dispatch({ type: "set-strategy", strategy: "energy", sourceKey: fresh })
        .accepted,
    ).toBe(true);
    expect(r.snapshot.tick).toBe(before.tick);
  });
  it("T17 cloning forks preserves the same queued fault condition and identity", () => {
    const s = createFixture("supply", 4217, "fault-branch");
    s.status = "paused";
    s.faults.push({
      id: "fault-1",
      tick: 2,
      kind: "close-lane",
      targetId: "gate-ice",
    });
    const result = compareStrategies(s, "balanced", "robust", 12);
    for (const branch of [result.a, result.b]) {
      expect(branch.parentSessionId).toBe(s.sessionId);
      expect(branch.forkSeq).toBe(12);
      expect(branch.snapshot.appliedFaults).toContain("fault-1");
      expect(branch.violations).toEqual([]);
    }
  });
  it('T17 identical policies reproduce the same constrained future', () => {
    const r = createDominionRuntime({ scenario: 'four-missions', sessionId: 'same-policy', seed: 913 });
    for (let i = 0; i < 8; i++) r.dispatch({ type: 'step' });
    const result = compareStrategies(r.snapshot, 'balanced', 'balanced', r.events.length);
    expect(sourceKey(result.a.snapshot)).toBe(sourceKey(result.b.snapshot));
    expect(result.a.trace).toEqual(result.b.trace);
    expect(result.a.completed).toBe(4); expect(result.b.violations).toEqual([]);
  });
  it('T11 urgent insertion keeps prior in-flight cargo and both tasks eventually complete', () => {
    const r = createDominionRuntime({ scenario: 'supply' });
    r.dispatch({ type: 'set-priority', missionId: 'mission-1', priority: 0 });
    until(r, r => r.snapshot.ships.some(s => s.cargo.supplies > 0 && s.transit));
    const committed = r.snapshot.ships.find(s => s.cargo.supplies > 0)!;
    r.dispatch({ type: 'add-mission', kind: 'supply', targetId: 'lab' });
    r.dispatch({ type: 'set-priority', missionId: 'mission-2', priority: 9 });
    const preserved = r.snapshot.ships.find(s => s.id === committed.id)!;
    expect(preserved.transit).toEqual(committed.transit);
    expect(preserved.cargo).toEqual(committed.cargo);
    expect(preserved.missionId).toBe('mission-1');
    const final = run(r); expect(final.missions.every(m => m.status === 'completed')).toBe(true);
    expect(final.missions.map(m => m.delivered.supplies)).toEqual([2,2]);
  });
});
