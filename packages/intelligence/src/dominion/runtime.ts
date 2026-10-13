import { z } from "zod";
import {
  createFixture,
  createMission,
  PLANNER_VERSION,
  RESOURCES,
  resources,
  SCENARIOS,
  STRATEGIES,
  total,
} from "./fixtures";
import { assertDominionInvariants } from "./invariants";
import { clone, sourceKey } from "./identity";
import { feasiblePath, findPath } from "./planner";
import type {
  Command,
  CommandRecord,
  CommandResult,
  DominionEvent,
  DominionRecording,
  Mission,
  MissionStep,
  RuntimeOptions,
  Ship,
} from "./types";

export const MAX_TICKS = 600;
export const MAX_COMMANDS = 1024;
export const MAX_EVENTS = 8192;
export const MAX_WAIT = 36;
const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/);
const whole = (max: number) => z.number().int().min(0).max(max);
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.enum(["start", "pause", "resume", "step", "close-session"]),
    })
    .strict(),
  z
    .object({ type: z.literal("set-lane"), laneId: id, open: z.boolean() })
    .strict(),
  z.object({ type: z.literal("damage-lane"), laneId: id }).strict(),
  z.object({ type: z.literal("set-all-lanes"), open: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("set-priority"),
      missionId: id,
      priority: whole(9),
    })
    .strict(),
  z
    .object({
      type: z.literal("set-strategy"),
      strategy: z.enum(["time", "energy", "robust", "balanced"]),
      sourceKey: z.string().max(200).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("add-mission"),
      kind: z.enum(["supply", "relay", "rescue", "science"]),
      targetId: id.optional(),
      quantity: whole(6).min(1).optional(),
      deadline: whole(500).min(5).optional(),
    })
    .strict(),
  z.object({ type: z.literal("cancel-mission"), missionId: id }).strict(),
  z.object({ type: z.literal("retry-mission"), missionId: id }).strict(),
  z.object({ type: z.literal("distress"), shipId: id }).strict(),
  z.object({ type: z.literal("rescue"), shipId: id }).strict(),
  z
    .object({ type: z.literal("hold-dock"), stationId: id, berths: whole(8) })
    .strict(),
  z.object({ type: z.literal("return-cargo"), shipId: id }).strict(),
  z
    .object({ type: z.literal("set-connection"), connected: z.boolean() })
    .strict(),
]);
const terminal = (m: Mission) =>
  m.status === "completed" || m.status === "cancelled";
let sessionSequence = 0;

/** Single synchronous owner. DOM, frames, Workers and model prose cannot mutate facts. */
export function createDominionRuntime(options: RuntimeOptions = {}) {
  if (
    !SCENARIOS.includes(options.scenario ?? "expedition") ||
    !Number.isSafeInteger(options.seed ?? 4217) ||
    (options.seed ?? 4217) < 0 ||
    (options.seed ?? 4217) > 2147483647
  )
    throw Error("场景或种子无效");
  let state = options.snapshot
    ? clone(options.snapshot)
    : createFixture(
        options.scenario ?? "expedition",
        options.seed ?? 4217,
        options.sessionId ??
          `dominion-${Date.now().toString(36)}-${++sessionSequence}`,
      );
  if (
    state.schemaVersion !== 4 ||
    state.plannerVersion !== PLANNER_VERSION ||
    assertDominionInvariants(state).length
  )
    throw Error("V4初始状态不符合契约");
  const initial = clone(state);
  const events: DominionEvent[] = [];
  const commands: CommandRecord[] = [];
  const results = new Map<string, CommandResult>();
  const commandBodies = new Map<string, string>();
  let serial = state.commandIds.length;
  let pendingFailure: string | null = null;
  const station = (stationId: string) =>
    state.stations.find((s) => s.id === stationId)!;
  const missionFor = (ship: Ship) =>
    state.missions.find((m) => m.id === ship.missionId);
  const stepFor = (ship: Ship) =>
    missionFor(ship)?.steps.find((s) => s.id === ship.stepId);
  const occupied = (stationId: string) =>
    state.ships.filter((s) =>
      s.transit ? s.transit.to === stationId : s.nodeId === stationId,
    ).length;

  function emit(
    type: string,
    payload: Record<string, unknown> = {},
    mission: Mission | null = null,
    action = false,
    toolCallId: string | null = null,
  ) {
    const actionId = action
      ? `${state.sessionId}:action:${state.actionIds.length + 1}`
      : null;
    if (actionId) state.actionIds.push(actionId);
    const violations = assertDominionInvariants(state);
    if (violations.length)
      throw Error(`DOMINION invariant: ${violations.join(",")}`);
    const seq = events.length + 1;
    events.push({
      schemaVersion: 4,
      sessionId: state.sessionId,
      missionId: mission?.id ?? null,
      attempt: mission?.attempt ?? null,
      eventId: `${state.sessionId}:event:${seq}`,
      seq,
      tick: state.tick,
      wallTime: new Date().toISOString(),
      worldVersion: state.worldVersion,
      mode: "local-simulation",
      type,
      actionId,
      toolCallId,
      payload: clone(payload),
    });
  }
  function tool(
    name: string,
    input: Record<string, unknown>,
    work: () => unknown,
    mission: Mission | null = null,
  ) {
    const start = performance.now(),
      output = work(),
      toolId = `${state.sessionId}:tool:${events.length + 1}`;
    state.tools.push({
      id: toolId,
      tool: name,
      input: clone(input),
      output: clone(output),
      sources: [
        `world:${state.worldVersion}`,
        `seed:${state.seed}`,
        PLANNER_VERSION,
      ],
      durationMs: Math.max(0, performance.now() - start),
    });
    if (state.tools.length > 40) state.tools.shift();
    emit(
      "tool.completed",
      { tool: name, input, output, durationMs: state.tools.at(-1)!.durationMs },
      mission,
      false,
      toolId,
    );
    return output;
  }
  function invalidate(type: string, payload: Record<string, unknown>) {
    state.worldVersion++;
    for (const ship of state.ships) {
      ship.route = [];
      ship.planVersion = 0;
    }
    state.message =
      "世界版本已更新；旧计划失效。在途舰先安全到下一节点，新动作重新校验。";
    emit(type, payload);
  }
  function releaseReservation(ship: Ship) {
    if (ship.sourceId)
      for (const k of RESOURCES)
        station(ship.sourceId).reserved[k] -= ship.reserved[k];
    ship.reserved = resources();
    if (!total(ship.cargo)) ship.cargoOwner = null;
  }
  function finishAttempt(
    m: Mission,
    outcome: "failed" | "completed" | "cancelled",
    reason: string | null,
  ) {
    const attempt = m.attempts.at(-1)!;
    if (attempt.outcome === "active") {
      attempt.outcome = outcome;
      attempt.endedAt = state.tick;
      attempt.reason = reason;
    }
  }
  function fail(m: Mission, code: string, message: string) {
    if (terminal(m) || m.status === "failed") return;
    m.status = "failed";
    m.failureCode = code;
    m.message = message;
    finishAttempt(m, "failed", code);
    for (const ship of state.ships.filter((s) => s.missionId === m.id)) {
      ship.route = [];
      ship.planVersion = 0;
      ship.status = ship.transit
        ? "moving"
        : ship.disabled
          ? "disabled"
          : "waiting";
    }
    state.message = `${m.label}受阻：${message}`;
    emit("mission.failed", { code, message }, m);
  }
  function wait(ship: Ship, m: Mission, reason: string) {
    ship.status = ship.disabled ? "disabled" : "waiting";
    ship.waitTicks++;
    ship.totalWait++;
    m.status = "waiting";
    m.message = reason;
    m.waitTicks++;
    emit(
      "ship.waiting",
      { shipId: ship.id, reason, waitTicks: ship.waitTicks, limit: MAX_WAIT },
      m,
    );
    if (ship.waitTicks >= MAX_WAIT)
      fail(m, "WAIT_LIMIT", `等待已到上限：${reason}。改变环境后显式重试。`);
  }
  function progress(ship: Ship, m: Mission) {
    ship.waitTicks = 0;
    m.waitTicks = 0;
    m.lastProgress = state.tick;
    m.status = "running";
  }
  function finishStep(ship: Ship, m: Mission, step: MissionStep) {
    step.status = "completed";
    step.completedAt = state.tick;
    ship.missionId = null;
    ship.stepId = null;
    ship.action = null;
    ship.phase = "idle";
    ship.status = "idle";
    ship.sourceId = null;
    ship.cargoOwner = null;
    ship.route = [];
    ship.planVersion = 0;
    m.lastProgress = state.tick;
    m.waitTicks = 0;
    for (const next of m.steps)
      if (
        next.status === "blocked" &&
        next.dependsOn.every((id) =>
          m.steps.some((s) => s.id === id && s.status === "completed"),
        )
      )
        next.status = "queued";
    emit(
      "step.completed",
      { stepId: step.id, shipId: ship.id, kind: step.kind },
      m,
      true,
    );
    if (m.steps.every((s) => s.status === "completed")) {
      m.status = "completed";
      m.failureCode = null;
      m.message = "前置依赖、资源账本与交付事实已核验。";
      finishAttempt(m, "completed", null);
      emit("mission.completed", { delivered: m.delivered }, m);
    }
  }
  function targetOf(step: MissionStep) {
    return step.kind === "rescue"
      ? state.ships.find((s) => s.id === step.targetId)?.nodeId
      : step.targetId;
  }
  function beginAction(
    ship: Ship,
    m: Mission,
    step: MissionStep,
    kind: NonNullable<Ship["action"]>["kind"],
    targetId: string,
  ) {
    ship.action = {
      kind,
      elapsed: 0,
      duration:
        kind === "scan" ? 4 : kind === "repair" ? 6 : kind === "rescue" ? 4 : 2,
      targetId,
      missionId: m.id,
    };
    ship.phase = "working";
    ship.status =
      kind === "load"
        ? "loading"
        : kind === "deliver"
          ? "delivering"
          : kind === "scan"
            ? "scanning"
            : "repairing";
    progress(ship, m);
    emit(
      "action.started",
      { shipId: ship.id, stepId: step.id, ...ship.action },
      m,
      true,
    );
  }
  function act(ship: Ship) {
    // Entered edges are commitments even if a task is cancelled, fails, or an edge closes.
    if (ship.transit) {
      ship.transit.elapsed++;
      if (ship.transit.elapsed >= ship.transit.duration) {
        const from = ship.transit.from,
          to = ship.transit.to;
        ship.nodeId = to;
        ship.transit = null;
        ship.status = ship.disabled ? "disabled" : "idle";
        ship.waitTicks = 0;
        emit(
          "ship.arrived",
          { shipId: ship.id, from, to },
          missionFor(ship) ?? null,
          true,
        );
      }
      return;
    }
    const m = missionFor(ship),
      step = stepFor(ship);
    if (!m || !step || terminal(m) || m.status === "failed") return;
    if (ship.disabled) {
      wait(ship, m, "设备故障，等待合法救援");
      return;
    }
    if (ship.action) {
      ship.action.elapsed++;
      if (ship.action.elapsed < ship.action.duration) return;
      const action = ship.action;
      if (action.kind === "load") {
        const source = station(ship.sourceId!);
        if (
          RESOURCES.some(
            (k) =>
              source.stock[k] < ship.reserved[k] ||
              source.reserved[k] < ship.reserved[k],
          )
        ) {
          fail(m, "RESERVATION_CONFLICT", "预留失效，未装载。");
          return;
        }
        for (const k of RESOURCES) {
          source.stock[k] -= ship.reserved[k];
          source.reserved[k] -= ship.reserved[k];
          ship.cargo[k] += ship.reserved[k];
        }
        ship.reserved = resources();
        ship.action = null;
        ship.phase = "to-target";
        ship.status = "idle";
        emit(
          "cargo.loaded",
          { shipId: ship.id, sourceId: source.id, cargo: ship.cargo },
          m,
          true,
        );
        return;
      }
      if (action.kind === "deliver") {
        if (RESOURCES.some((k) => ship.cargo[k] !== step.resources[k])) {
          fail(m, "CARGO_MISMATCH", "载货与当前步骤需求不一致。");
          return;
        }
        for (const k of RESOURCES) {
          station(step.targetId).stock[k] += ship.cargo[k];
          m.delivered[k] += ship.cargo[k];
          ship.cargo[k] = 0;
        }
        emit(
          "cargo.delivered",
          {
            shipId: ship.id,
            targetId: step.targetId,
            resources: step.resources,
          },
          m,
          true,
        );
      } else if (action.kind === "scan") {
        const target = station(step.targetId);
        if (target.kind === "sample") {
          if (
            !state.discoveries.some(
              (d) => d.stationId === target.id && d.kind === "samples",
            )
          ) {
            const quantity = 4;
            target.stock.samples += quantity;
            state.ledger.generated.samples += quantity;
            state.discoveries.push({
              id: `${m.id}:discovery:${state.discoveries.length + 1}`,
              stationId: target.id,
              missionId: m.id,
              shipId: ship.id,
              tick: state.tick,
              kind: "samples",
              quantity,
            });
          }
        } else
          state.discoveries.push({
            id: `${m.id}:discovery:${state.discoveries.length + 1}`,
            stationId: target.id,
            missionId: m.id,
            shipId: ship.id,
            tick: state.tick,
            kind: "damage",
            quantity: 0,
          });
        invalidate("survey.discovered", {
          shipId: ship.id,
          stationId: target.id,
          missionId: m.id,
          discoveredAt: state.tick,
        });
      } else if (action.kind === "repair") {
        if (
          !state.discoveries.some(
            (d) => d.stationId === step.targetId && d.kind === "damage",
          )
        ) {
          fail(m, "UNDISCOVERED", "必须先获得当前运行中的勘测信息。");
          return;
        }
        if (ship.cargo.parts < step.resources.parts) {
          fail(m, "PARTS_REQUIRED", "维修件不足，设施未恢复。");
          return;
        }
        ship.cargo.parts -= step.resources.parts;
        state.ledger.consumed.parts += step.resources.parts;
        station(step.targetId).damaged = false;
        for (const lane of state.lanes)
          if (lane.from === step.targetId || lane.to === step.targetId)
            lane.damaged = false;
        invalidate("relay.repaired", {
          shipId: ship.id,
          stationId: step.targetId,
          partsConsumed: step.resources.parts,
          permissionRule: "user-closed lanes stay closed",
        });
      } else if (action.kind === "rescue") {
        const target = state.ships.find((s) => s.id === step.targetId);
        if (
          !target ||
          target.transit ||
          target.nodeId !== ship.nodeId ||
          target.id === ship.id ||
          ship.cargo.energy < step.resources.energy ||
          ship.cargo.parts < step.resources.parts
        ) {
          fail(m, "RESCUE_CONDITION", "救援目标/资源/共址条件发生改变。");
          return;
        }
        target.energy += step.resources.energy;
        ship.cargo.energy -= step.resources.energy;
        ship.cargo.parts -= step.resources.parts;
        state.ledger.consumed.parts += step.resources.parts;
        target.disabled = false;
        target.status = "idle";
        target.waitTicks = 0;
        invalidate("ship.rescued", {
          shipId: ship.id,
          targetId: target.id,
          transferredEnergy: step.resources.energy,
          consumedParts: step.resources.parts,
        });
      }
      finishStep(ship, m, step);
      return;
    }
    const destination =
      ship.phase === "to-source" ? ship.sourceId : targetOf(step);
    if (!destination || !state.stations.some((s) => s.id === destination)) {
      fail(m, "INVALID_TARGET", "目标不存在。");
      return;
    }
    if (ship.nodeId === destination) {
      beginAction(
        ship,
        m,
        step,
        ship.phase === "to-source" ? "load" : step.kind,
        destination,
      );
      return;
    }
    if (ship.planVersion !== state.worldVersion || !ship.route.length) {
      if (state.replans >= 512) {
        fail(m, "REPLAN_LIMIT", "重规划次数已达安全上限。");
        return;
      }
      const route = feasiblePath(state, ship, ship.nodeId, destination);
      tool(
        "estimate-route",
        {
          shipId: ship.id,
          from: ship.nodeId,
          to: destination,
          strategy: state.strategy,
          worldVersion: state.worldVersion,
        },
        () => route,
        m,
      );
      state.replans++;
      if (!route) {
        const topology = findPath(
          state,
          ship,
          ship.nodeId,
          destination,
          "energy",
        );
        fail(
          m,
          topology ? "INSUFFICIENT_ENERGY" : "UNREACHABLE",
          topology
            ? "当前能量不足，需有账本的补给/救援后重试。"
            : "当前目标不可达，改变环境后显式重试。",
        );
        return;
      }
      ship.route = route.lanes;
      ship.planVersion = state.worldVersion;
      emit("plan.created", { shipId: ship.id, destination, route }, m);
    }
    const lane = state.lanes.find((l) => l.id === ship.route[0]);
    const to =
      lane?.from === ship.nodeId
        ? lane.to
        : lane?.to === ship.nodeId
          ? lane.from
          : null;
    if (
      !lane ||
      !to ||
      !lane.open ||
      lane.damaged ||
      !lane.roles.includes(ship.role)
    ) {
      ship.route = [];
      ship.planVersion = 0;
      wait(ship, m, "当前动作计划失效");
      return;
    }
    if (ship.energy < lane.energy) {
      fail(m, "INSUFFICIENT_ENERGY", "发车前能量校验拒绝动作。");
      return;
    }
    if (
      state.ships.filter((s) => s.transit?.laneId === lane.id).length >=
      lane.capacity
    ) {
      wait(ship, m, "航道已被预约");
      return;
    }
    if (occupied(to) + station(to).blockedBerths >= station(to).dockCapacity) {
      wait(ship, m, "下一安全泊位已满，保留当前位置");
      return;
    }
    ship.energy -= lane.energy;
    state.ledger.consumed.energy += lane.energy;
    ship.transit = {
      laneId: lane.id,
      from: ship.nodeId,
      to,
      elapsed: 0,
      duration: Math.ceil(lane.ticks / ship.speed),
    };
    ship.route.shift();
    ship.status = "moving";
    progress(ship, m);
    emit(
      "ship.departed",
      {
        shipId: ship.id,
        laneId: lane.id,
        from: ship.nodeId,
        to,
        energy: lane.energy,
        duration: ship.transit.duration,
        planVersion: ship.planVersion,
      },
      m,
      true,
    );
  }
  function schedule() {
    const active = state.missions
      .filter((m) => !terminal(m) && m.status !== "failed")
      .sort(
        (a, b) =>
          b.priority +
            Math.floor(b.waitTicks / 8) -
            (a.priority + Math.floor(a.waitTicks / 8)) ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id),
      );
    for (const m of active) {
      const step = m.steps.find((s) => s.status === "queued");
      if (!step) continue;
      const targetId = targetOf(step);
      if (!targetId || !state.stations.some((s) => s.id === targetId)) {
        fail(m, "INVALID_TARGET", "任务目标不存在。");
        continue;
      }
      const fleet = state.ships.filter(
        (s) =>
          s.role === step.role &&
          !s.missionId &&
          !s.transit &&
          !s.disabled &&
          !total(s.cargo) &&
          !total(s.reserved),
      );
      const capable = fleet.filter((s) => s.capacity >= total(step.resources));
      if (!capable.length) {
        m.status = "waiting";
        m.waitTicks++;
        m.message = `等待可用${step.role}舰（老化加权${Math.floor(m.waitTicks / 8)}）`;
        continue;
      }
      if (
        step.sourceId &&
        RESOURCES.some(
          (k) => station(step.sourceId!).stock[k] < step.resources[k],
        )
      ) {
        fail(m, "INSUFFICIENT_STOCK", "源站剩余库存不足，不能凭空补充。");
        continue;
      }
      if (
        step.sourceId &&
        RESOURCES.some(
          (k) =>
            station(step.sourceId!).stock[k] -
              station(step.sourceId!).reserved[k] <
            step.resources[k],
        )
      ) {
        m.status = "waiting";
        m.waitTicks++;
        m.message = "货物已由其他任务预留，等待释放";
        continue;
      }
      const candidates = capable
        .flatMap((ship) => {
          const firstTarget = step.sourceId ?? targetId;
          const a = feasiblePath(state, ship, ship.nodeId, firstTarget);
          const b =
            a && step.sourceId
              ? feasiblePath(
                  state,
                  ship,
                  firstTarget,
                  targetId,
                  ship.energy - a.energy,
                )
              : a
                ? { energy: 0, score: 0 }
                : null;
          return a && b && a.energy + b.energy <= ship.energy
            ? [{ ship, score: a.score + b.score }]
            : [];
        })
        .sort(
          (a, b) => a.score - b.score || a.ship.id.localeCompare(b.ship.id),
        );
      const ship = candidates[0]?.ship;
      if (!ship) {
        // A low-fuel idle ship must not cause premature failure while a qualified
        // role is committed to another task. Wait, without stealing that commitment.
        const returning = state.ships.some(
          (s) =>
            s.role === step.role &&
            s.capacity >= total(step.resources) &&
            s.missionId &&
            s.missionId !== m.id &&
            !s.disabled &&
            state.missions.some(
              (other) =>
                other.id === s.missionId &&
                !terminal(other) &&
                other.status !== "failed",
            ),
        );
        if (returning) {
          m.status = "waiting";
          m.waitTicks++;
          m.message =
            "当前空闲舰燃料不足，等待执行中的合格舰释放；不抢占其已承诺动作";
          continue;
        }
        const reachable = capable.some(
          (s) =>
            findPath(state, s, s.nodeId, step.sourceId ?? targetId, "energy") &&
            (!step.sourceId ||
              findPath(state, s, step.sourceId, targetId, "energy")),
        );
        fail(
          m,
          reachable ? "INSUFFICIENT_ENERGY" : "UNREACHABLE",
          reachable
            ? "有合法拓扑但燃料不能完成当前步骤，请救援后重试。"
            : "起点、货源与目标之间不可达。",
        );
        continue;
      }
      if (step.sourceId)
        for (const k of RESOURCES) {
          station(step.sourceId).reserved[k] += step.resources[k];
          ship.reserved[k] = step.resources[k];
        }
      ship.sourceId = step.sourceId;
      ship.cargoOwner = total(step.resources) ? m.id : null;
      ship.missionId = m.id;
      ship.stepId = step.id;
      ship.phase = step.sourceId ? "to-source" : "to-target";
      ship.route = [];
      ship.planVersion = 0;
      ship.waitTicks = 0;
      step.status = "assigned";
      step.shipId = ship.id;
      step.startedAt = state.tick;
      m.status = "running";
      m.message = `已为${step.label}分配${ship.label}`;
      m.lastProgress = state.tick;
      emit(
        "task.assigned",
        {
          shipId: ship.id,
          role: ship.role,
          stepId: step.id,
          reserved: ship.reserved,
          effectivePriority: m.priority + Math.floor(m.waitTicks / 8),
        },
        m,
        true,
      );
    }
  }
  function distress(ship: Ship) {
    const lostEnergy = ship.energy;
    state.ledger.consumed.energy += lostEnergy;
    ship.energy = 0;
    ship.disabled = true;
    ship.status = "disabled";
    invalidate("ship.distress", {
      shipId: ship.id,
      energyLost: lostEnergy,
      reason: "isolated synthetic equipment fault",
      safetyRule: "safe docked fault only",
    });
  }
  function tick() {
    if (state.tick >= MAX_TICKS) {
      state.status = "paused";
      state.message = "达到会话模拟时钟上限，可导出记录或新建世界。";
      emit("session.limit");
      return;
    }
    state.tick++;
    for (const fault of state.faults)
      if (fault.tick <= state.tick && !state.appliedFaults.includes(fault.id)) {
        if (fault.kind === "distress") {
          const ship = state.ships.find((s) => s.id === fault.targetId);
          if (ship?.transit) continue;
          if (ship) distress(ship);
        } else {
          const lane = state.lanes.find((l) => l.id === fault.targetId);
          if (lane) {
            if (fault.kind === "close-lane") lane.open = false;
            else lane.damaged = true;
            invalidate("fault.applied", { ...fault });
          }
        }
        state.appliedFaults.push(fault.id);
      }
    for (const m of state.missions)
      if (!terminal(m) && m.status !== "failed" && state.tick > m.deadline)
        fail(
          m,
          "DEADLINE",
          "本次attempt超过仿真期限，重试需显式创建新attempt。",
        );
    schedule();
    const ships = [...state.ships].sort((a, b) => {
      const ma = missionFor(a),
        mb = missionFor(b);
      return (
        (mb?.priority ?? 0) +
          Math.floor(b.waitTicks / 8) -
          ((ma?.priority ?? 0) + Math.floor(a.waitTicks / 8)) ||
        a.id.localeCompare(b.id)
      );
    });
    for (const ship of ships) act(ship);
    for (const m of state.missions)
      if (
        !terminal(m) &&
        m.status !== "failed" &&
        state.tick - m.lastProgress >= MAX_WAIT
      )
        fail(
          m,
          "NO_PROGRESS",
          "舰队/泊位/资源长期无进展，已有限停止并保留事实。",
        );
    if (
      state.missions.every((m) => terminal(m) || m.status === "failed") &&
      state.ships.every((s) => !s.transit)
    ) {
      state.status = "paused";
      state.message =
        "当前任务批次已结束；世界仍开放，可查看结果、恢复失败或创建新任务。";
    }
    emit("tick.completed", { tick: state.tick });
  }
  function reject(reason: string): false {
    state.message = reason;
    pendingFailure = reason;
    emit("command.rejected", { reason });
    return false;
  }
  function apply(c: Command): boolean {
    if (state.status === "closed")
      return reject("世界会话已关闭；必须新建会话，不能复活终态。");
    if (
      !state.connected &&
      c.type !== "set-connection" &&
      c.type !== "close-session"
    )
      return reject("通信模拟断开：本地执行已安全暂停，先重连同步快照。");
    if (c.type === "set-connection") {
      state.connected = c.connected;
      if (!c.connected) state.status = "paused";
      state.message = c.connected
        ? "已同步权威快照和事件；保持暂停，确认后继续。"
        : "隔离演示通信断开，本地执行已安全暂停。";
      emit(c.connected ? "connection.synchronized" : "connection.lost");
      return true;
    }
    if (c.type === "pause") {
      state.status = "paused";
      state.message = "仿真暂停，所有已发生事实保持。";
      emit("session.paused");
      return true;
    }
    if (c.type === "start" || c.type === "resume") {
      state.status = "running";
      state.message = "远征调度已开始；资格、依赖、库存与预约逐步校验。";
      tool("read-world", { worldVersion: state.worldVersion }, () => ({
        ships: state.ships.length,
        missions: state.missions.length,
        knownDiscoveries: state.discoveries.length,
      }));
      emit("session.running");
      return true;
    }
    if (c.type === "step") {
      const wasRunning = state.status === "running";
      state.status = "running";
      tick();
      if (!wasRunning && state.status === "running") state.status = "paused";
      return true;
    }
    if (c.type === "close-session") {
      for (const ship of state.ships) releaseReservation(ship);
      for (const m of state.missions)
        if (!terminal(m)) {
          m.status = "cancelled";
          finishAttempt(m, "cancelled", "session-closed");
        }
      state.status = "closed";
      state.message =
        "会话关闭。已载货、在途快照、消耗与已交付仍保留，只读归档。";
      emit("session.closed", {}, null, true);
      return true;
    }
    if (c.type === "set-lane" || c.type === "damage-lane") {
      const lane = state.lanes.find((l) => l.id === c.laneId);
      if (!lane) return reject("航道不存在。");
      if (c.type === "set-lane") lane.open = c.open;
      else lane.damaged = true;
      invalidate(
        c.type === "set-lane" ? "lane.permission-changed" : "lane.damaged",
        { laneId: lane.id, open: lane.open, damaged: lane.damaged },
      );
      return true;
    }
    if (c.type === "set-all-lanes") {
      for (const lane of state.lanes) lane.open = c.open;
      invalidate("lanes.permission-changed", { open: c.open });
      return true;
    }
    if (c.type === "set-priority") {
      const m = state.missions.find((m) => m.id === c.missionId);
      if (!m || terminal(m))
        return reject("任务不存在或已结束，不能改写终态。");
      m.priority = c.priority;
      invalidate("mission.priority-changed", {
        missionId: m.id,
        priority: c.priority,
        committedActionsPreserved: true,
      });
      return true;
    }
    if (c.type === "set-strategy") {
      if (
        c.sourceKey &&
        (state.status !== "paused" || c.sourceKey !== sourceKey(state))
      )
        return reject("比较源快照已过期或当前并非暂停，不能采用旧结果。");
      if (!STRATEGIES.includes(c.strategy)) return reject("策略无效。");
      state.strategy = c.strategy;
      invalidate("policy.changed", { strategy: c.strategy, futureOnly: true });
      return true;
    }
    if (c.type === "hold-dock") {
      const target = state.stations.find((s) => s.id === c.stationId);
      if (!target || occupied(target.id) + c.berths > target.dockCapacity)
        return reject("外部泊位占用不能超过剩余容量或挤走已预约舰船。");
      target.blockedBerths = c.berths;
      invalidate("dock.hold-changed", {
        stationId: target.id,
        berths: c.berths,
      });
      return true;
    }
    if (c.type === "distress") {
      const ship = state.ships.find((s) => s.id === c.shipId);
      if (!ship || ship.transit || ship.disabled || ship.role === "repair")
        return reject("请选已安全停泊且正常的运输/勘测舰；在途故障未启用。");
      distress(ship);
      return true;
    }
    if (c.type === "add-mission" || c.type === "rescue") {
      if (
        state.missions.filter((m) => !terminal(m) && m.status !== "failed")
          .length >= 4 ||
        state.missions.length >= 16
      )
        return reject("最多4个活动任务、16个会话任务记录；请先完成或取消。");
      const kind = c.type === "rescue" ? "rescue" : c.kind,
        targetId = c.type === "rescue" ? c.shipId : c.targetId;
      if (kind === "rescue") {
        const target = state.ships.find(
          (s) => s.id === (targetId ?? "transport-b"),
        );
        if (
          !target ||
          target.transit ||
          (!target.disabled && target.energy >= 18)
        )
          return reject("救援对象不存在、仍在航段或不需要此救援。");
        if (
          state.missions.some(
            (m) =>
              m.kind === "rescue" &&
              !terminal(m) &&
              m.steps.some((s) => s.targetId === target.id),
          )
        )
          return reject("该对象已有救援任务，请恢复原任务，不能重复创建。");
      } else if (
        targetId &&
        !state.stations.some(
          (s) =>
            s.id === targetId && (kind !== "science" || s.kind === "sample"),
        )
      )
        return reject("目标站点或勘测范围无效。");
      const m = createMission(
        kind,
        `mission-${state.missions.length + 1}`,
        state.tick,
        c.type === "rescue" ? { targetId } : c,
      );
      state.missions.push(m);
      invalidate("mission.created", { missionId: m.id, kind });
      return true;
    }
    if (c.type === "cancel-mission" || c.type === "retry-mission") {
      const m = state.missions.find((m) => m.id === c.missionId);
      if (!m || terminal(m))
        return reject("任务不存在或已完成/取消，不允许复活终态。");
      if (c.type === "retry-mission") {
        if (m.status !== "failed" || m.attempt >= 6)
          return reject("仅失败任务可显式重试，最多6次attempt。");
        m.attempt++;
        m.attempts.push({
          attempt: m.attempt,
          startedAt: state.tick,
          endedAt: null,
          outcome: "active",
          reason: null,
        });
        m.deadline = state.tick + m.deadlineWindow;
        m.status = "queued";
        m.failureCode = null;
        m.waitTicks = 0;
        m.lastProgress = state.tick;
        m.message = "新attempt从保留的已提交事实继续。";
        for (const ship of state.ships.filter((s) => s.missionId === m.id)) {
          ship.waitTicks = 0;
          ship.route = [];
          ship.planVersion = 0;
        }
        invalidate("mission.retried", { missionId: m.id, attempt: m.attempt });
      } else {
        for (const ship of state.ships.filter((s) => s.missionId === m.id)) {
          releaseReservation(ship);
          const step = stepFor(ship)!;
          step.status = "queued";
          step.shipId = null;
          ship.action = null;
          ship.stepId = null;
          ship.missionId = null;
          ship.phase = "idle";
          ship.route = [];
          ship.planVersion = 0;
        }
        m.status = "cancelled";
        m.message = "未装载预留释放；已载货保留归属，可安全到站后归还当前站。";
        finishAttempt(m, "cancelled", "user-cancelled");
        emit("mission.cancelled", { delivered: m.delivered }, m, true);
      }
      return true;
    }
    if (c.type === "return-cargo") {
      const ship = state.ships.find((s) => s.id === c.shipId);
      if (!ship || ship.transit || ship.missionId || !total(ship.cargo))
        return reject("仅无执行任务、已经停泊的舰可归还其保留货物。");
      const returned = clone(ship.cargo);
      for (const k of RESOURCES) station(ship.nodeId).stock[k] += ship.cargo[k];
      ship.cargo = resources();
      ship.cargoOwner = null;
      ship.sourceId = null;
      invalidate("cargo.returned", {
        shipId: ship.id,
        stationId: ship.nodeId,
        returned,
      });
      return true;
    }
    return reject("命令未实现，未执行任何外部动作。");
  }
  return {
    get snapshot() {
      return clone(state);
    },
    get events() {
      return clone(events);
    },
    dispatch(input: Command, commandId?: string): CommandResult {
      const parsed = commandSchema.safeParse(input);
      if (
        !parsed.success ||
        (commandId !== undefined && !id.safeParse(commandId).success)
      )
        return {
          accepted: false,
          duplicate: false,
          message: "命令格式、范围或标识不符合受控契约。",
        };
      const cid = commandId ?? `${state.sessionId}:command:${++serial}`;
      const previous = results.get(cid);
      if (previous) return commandBodies.get(cid) === JSON.stringify(parsed.data)
        ? { ...previous, duplicate: true }
        : { accepted: false, duplicate: true, message: '相同幂等键对应不同命令内容，已拒绝冲突重试。' };
      if (state.commandIds.includes(cid))
        return {
          accepted: false,
          duplicate: true,
          message: "该命令已存在于源快照，不重复执行。",
        };
      if (state.status === "closed")
        return {
          accepted: false,
          duplicate: false,
          message: "世界会话已关闭；只读归档不可再写入。",
        };
      // Atomic command candidate: on invariant failure restore facts and never publish partial events.
      const before = clone(state),
        eventCount = events.length;
      pendingFailure = null;
      try {
        let accepted: boolean;
        if (
          commands.length >= MAX_COMMANDS - 1 ||
          events.length > MAX_EVENTS - 64
        ) {
          // Reserve the final recorded command and event space for a reproducible
          // safe close, instead of leaving a running world that can no longer pause.
          apply({ type: "close-session" });
          pendingFailure =
            "完整历史预算已满；会话已安全关闭并保留事实，请导出后新建世界。";
          state.message = pendingFailure;
          emit("session.history-budget", {
            commandLimit: MAX_COMMANDS,
            eventLimit: MAX_EVENTS,
          });
          accepted = false;
        } else accepted = apply(parsed.data as Command);
        state.commandIds.push(cid);
        const violations = assertDominionInvariants(state);
        if (violations.length) throw Error(violations.join(","));
        commands.push({
          id: cid,
          command: clone(parsed.data as Command),
          accepted,
          tick: state.tick,
          stateKey: sourceKey(state),
        });
        const result = {
          accepted,
          duplicate: false,
          message: pendingFailure ?? state.message,
        };
        results.set(cid, result);
        commandBodies.set(cid, JSON.stringify(parsed.data));
        return result;
      } catch (error) {
        state = before;
        events.splice(eventCount);
        throw error;
      }
    },
    exportRecording(): DominionRecording {
      return clone({
        schemaVersion: 4,
        plannerVersion: PLANNER_VERSION,
        initial,
        commands,
        events,
        final: state,
      });
    },
  };
}
export type DominionRuntime = ReturnType<typeof createDominionRuntime>;
