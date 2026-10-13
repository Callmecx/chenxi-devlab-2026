import { STRATEGIES } from "./fixtures";
import { clone, sourceKey } from "./identity";
import { assertDominionInvariants } from "./invariants";
import { createDominionRuntime, MAX_TICKS } from "./runtime";
import type {
  BranchResult,
  DominionComparison,
  DominionSnapshot,
  Strategy,
} from "./types";

/** Pure local branches: no adapter, server, order, payment or other external tool. */
export function compareStrategies(
  snapshot: DominionSnapshot,
  a: Strategy = "time",
  b: Strategy = "energy",
  forkSeq = 0,
): DominionComparison {
  if (
    snapshot.status !== "paused" ||
    !snapshot.connected ||
    !STRATEGIES.includes(a) ||
    !STRATEGIES.includes(b) ||
    !Number.isSafeInteger(forkSeq) ||
    forkSeq < 0
  )
    throw Error("比较需要已连接的暂停快照和合法策略");
  const key = sourceKey(snapshot);
  function branch(strategy: Strategy): BranchResult {
    const runtime = createDominionRuntime({ snapshot: clone(snapshot) });
    runtime.dispatch(
      { type: "set-strategy", strategy, sourceKey: key },
      `${snapshot.sessionId}:fork:${strategy}:policy`,
    );
    runtime.dispatch(
      { type: "resume" },
      `${snapshot.sessionId}:fork:${strategy}:resume`,
    );
    let steps = 0;
    while (runtime.snapshot.status === "running" && steps++ < MAX_TICKS)
      runtime.dispatch(
        { type: "step" },
        `${snapshot.sessionId}:fork:${strategy}:tick:${steps}`,
      );
    const end = runtime.snapshot;
    const violations = assertDominionInvariants(end);
    if (end.status === "running") violations.push("branch-execution-budget");
    return {
      strategy,
      parentSessionId: snapshot.sessionId,
      forkSeq,
      sourceKey: key,
      snapshot: end,
      ticks: end.tick - snapshot.tick,
      energyUsed: end.ledger.consumed.energy - snapshot.ledger.consumed.energy,
      waitTicks:
        end.ships.reduce((n, s) => n + s.totalWait, 0) -
        snapshot.ships.reduce((n, s) => n + s.totalWait, 0),
      completed: end.missions.filter((m) => m.status === "completed").length,
      failed: end.missions.filter((m) => m.status === "failed").length,
      deadlineViolations: end.missions.filter(
        (m) => m.failureCode === "DEADLINE",
      ).length,
      violations,
      trace: runtime.events
        .filter((e) => e.type === "ship.departed")
        .map((e) => ({
          tick: e.tick,
          shipId: String(e.payload.shipId),
          laneId: String(e.payload.laneId),
        })),
    };
  }
  return { sourceKey: key, a: branch(a), b: branch(b) };
}
