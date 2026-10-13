import type {
  DominionSnapshot,
  Lane,
  Mission,
  MissionKind,
  MissionStep,
  Resource,
  Resources,
  Scenario,
  Ship,
  ShipRole,
  Strategy,
} from "./types";

export const PLANNER_VERSION = "dominion-dijkstra-reservation-v4.0";
// The release's repair chain services the damaged relay facility. Permission
// closures remain available on every lane, independently of physical damage.
export const canRepairLane = (lane: Pick<Lane, "from" | "to">) =>
  lane.from === "relay" || lane.to === "relay";
export const SCENARIOS: Scenario[] = [
  "supply",
  "expedition",
  "four-missions",
  "competition",
  "sealed",
  "low-energy",
];
export const STRATEGIES: Strategy[] = ["time", "energy", "robust", "balanced"];
export const RESOURCE_LABELS: Record<Resource, string> = {
  energy: "能源 EU",
  supplies: "物资箱",
  parts: "维修件",
  samples: "样本舱",
};
export const RESOURCES: Resource[] = ["energy", "supplies", "parts", "samples"];
export const resources = (value: Partial<Resources> = {}): Resources => ({
  energy: 0,
  supplies: 0,
  parts: 0,
  samples: 0,
  ...value,
});
export const total = (r: Resources) => RESOURCES.reduce((n, k) => n + r[k], 0);
export const ROLES: ShipRole[] = ["transport", "survey", "repair"];
export const REGIONS = [
  {
    id: "dawn",
    label: "曙光环港",
    subtitle: "居住环 / 货运脊梁 / 远征起点",
    position: [-15, -3, 1] as [number, number, number],
  },
  {
    id: "frost",
    label: "霜环前哨",
    subtitle: "冰质天体 / 稀薄环带 / 深空补给",
    position: [9, 0, -17] as [number, number, number],
  },
  {
    id: "ember",
    label: "赤砂科研区",
    subtitle: "矿物天体 / 勘测样本 / 中继修复",
    position: [18, -2, 10] as [number, number, number],
  },
] as const;

export function createMission(
  kind: MissionKind,
  id: string,
  tick: number,
  options: { targetId?: string; quantity?: number; deadline?: number } = {},
): Mission {
  const steps: MissionStep[] = [];
  function step(
    label: string,
    action: MissionStep["kind"],
    role: ShipRole,
    targetId: string,
    sourceId: string | null,
    cargo: Partial<Resources>,
  ) {
    const stepId = `${id}:step:${steps.length + 1}`;
    steps.push({
      id: stepId,
      label,
      kind: action,
      role,
      targetId,
      sourceId,
      resources: resources(cargo),
      dependsOn: steps.length ? [steps.at(-1)!.id] : [],
      status: steps.length ? "blocked" : "queued",
      shipId: null,
      startedAt: null,
      completedAt: null,
    });
  }
  const quantity = options.quantity ?? 2;
  if (kind === "supply")
    step(
      "预留、装载并交付补给",
      "deliver",
      "transport",
      options.targetId ?? "ice",
      "forge",
      { energy: 3, supplies: quantity },
    );
  if (kind === "relay") {
    step("勘测受损中继", "scan", "survey", "relay", null, {});
    step("携维修件恢复科研通道", "repair", "repair", "relay", "forge", {
      parts: 2,
    });
    step("转运科研载荷", "deliver", "transport", "lab", "forge", {
      supplies: quantity,
    });
  }
  if (kind === "rescue")
    step(
      "能源与维修支援",
      "rescue",
      "repair",
      options.targetId ?? "transport-b",
      "forge",
      { energy: 18, parts: 1 },
    );
  if (kind === "science") {
    step(
      "受控扫描、生成带来源样本",
      "scan",
      "survey",
      options.targetId ?? "sample",
      null,
      {},
    );
    step(
      "限时样本转运",
      "deliver",
      "transport",
      "lab",
      options.targetId ?? "sample",
      { samples: quantity },
    );
  }
  const label = {
    supply: "深空常规补给",
    relay: "勘测 · 维修 · 运输接力",
    rescue: "紧急救援与任务重排",
    science: "科研采样与限时转运",
  }[kind];
  const deadlineWindow = options.deadline ?? (kind === "relay" ? 240 : 180);
  return {
    id,
    kind,
    label,
    status: "queued",
    priority: kind === "rescue" ? 8 : kind === "relay" ? 6 : 4,
    createdAt: tick,
    deadline: tick + deadlineWindow,
    deadlineWindow,
    attempt: 1,
    attempts: [
      {
        attempt: 1,
        startedAt: tick,
        endedAt: null,
        outcome: "active",
        reason: null,
      },
    ],
    steps,
    delivered: resources(),
    failureCode: null,
    message: "等待舰型、资源与前置条件",
    waitTicks: 0,
    lastProgress: tick,
  };
}

export function createFixture(
  scenario: Scenario,
  seed: number,
  sessionId: string,
): DominionSnapshot {
  const stations: DominionSnapshot["stations"] = [
    ["port", "曙光环港", "dawn", "port", -15, 0, 10, 8],
    ["forge", "赫利俄斯物资仓", "dawn", "depot", -12, 3, 0, 3],
    ["depot", "晨曦能源舱", "dawn", "depot", -20, -1, -6, 2],
    ["gate", "远征航门", "dawn", "relay", -5, 2, -8, 3],
    ["ice", "霜环前哨", "frost", "outpost", 4, 1, -13, 3],
    ["silo", "冰脊资源站", "frost", "depot", 13, -1, -9, 2],
    ["beacon", "北冕导航台", "frost", "relay", 10, 4, 0, 3],
    ["relay", "赤砂受损中继", "ember", "relay", 2, 1, 7, 3],
    ["lab", "赤砂科研站", "ember", "science", 14, 0, 10, 4],
    ["sample", "砾光勘测点", "ember", "sample", 20, 2, 5, 3],
    ["dock", "启明星维修坞", "dawn", "port", -3, -1, 13, 3],
  ].map(([id, label, regionId, kind, x, y, z, cap]) => ({
    id: String(id),
    label: String(label),
    regionId: regionId as DominionSnapshot["stations"][number]["regionId"],
    kind: kind as DominionSnapshot["stations"][number]["kind"],
    position: [Number(x), Number(y), Number(z)],
    stock: resources(),
    reserved: resources(),
    dockCapacity: Number(cap),
    blockedBerths: 0,
    damaged: id === "relay",
  }));
  stations.find((s) => s.id === "forge")!.stock = resources({
    energy: 80,
    supplies: scenario === "competition" ? 3 : 12,
    parts: 10,
  });
  stations.find((s) => s.id === "depot")!.stock = resources({
    energy: 60,
    supplies: 4,
    parts: 4,
  });
  const lanes: DominionSnapshot["lanes"] = [
    ["port-forge", "port", "forge", 3, 4, 1],
    ["port-depot", "port", "depot", 5, 2, 0],
    ["port-dock", "port", "dock", 3, 3, 1],
    ["forge-gate", "forge", "gate", 3, 4, 2],
    ["depot-gate", "depot", "gate", 5, 2, 0],
    ["gate-ice", "gate", "ice", 4, 8, 3],
    ["ice-silo", "ice", "silo", 3, 2, 1],
    ["gate-beacon", "gate", "beacon", 7, 2, 0],
    ["silo-beacon", "silo", "beacon", 4, 3, 1],
    ["forge-relay", "forge", "relay", 4, 5, 3],
    ["dock-relay", "dock", "relay", 4, 2, 0],
    ["relay-beacon", "relay", "beacon", 4, 3, 1],
    ["relay-lab", "relay", "lab", 3, 4, 2],
    ["beacon-lab", "beacon", "lab", 6, 2, 0],
    ["lab-sample", "lab", "sample", 3, 3, 1],
    ["silo-sample", "silo", "sample", 6, 5, 2],
  ].map(([id, from, to, ticks, energy, risk]) => ({
    id: String(id),
    from: String(from),
    to: String(to),
    ticks: Number(ticks),
    energy: Number(energy),
    risk: Number(risk),
    capacity: 1,
    open: scenario !== "sealed",
    damaged: id === "relay-lab",
    roles: [...ROLES],
  }));
  const ships: DominionSnapshot["ships"] = ROLES.flatMap((role) =>
    ["a", "b"].map(
      (suffix, index): Ship => ({
        id: `${role}-${suffix}`,
        label: `${{ transport: "方舟", survey: "游隼", repair: "织星" }[role]} ${index + 1}`,
        role,
        nodeId:
          scenario === "four-missions" && role === "transport" && suffix === "b"
            ? "ice"
            : "port",
        transit: null,
        capacity: role === "repair" ? 24 : role === "transport" ? 8 : 2,
        energy:
          scenario === "low-energy" ||
          (scenario === "four-missions" &&
            role === "transport" &&
            suffix === "b")
            ? 0
            : 100,
        initialEnergy:
          scenario === "low-energy" ||
          (scenario === "four-missions" &&
            role === "transport" &&
            suffix === "b")
            ? 0
            : 100,
        speed: role === "survey" ? 2 : 1,
        cargo: resources(),
        reserved: resources(),
        cargoOwner: null,
        sourceId: null,
        missionId: null,
        stepId: null,
        route: [],
        planVersion: 0,
        phase: "idle" as const,
        status: "idle" as const,
        action: null,
        disabled:
          scenario === "four-missions" &&
          role === "transport" &&
          suffix === "b",
        waitTicks: 0,
        totalWait: 0,
      }),
    ),
  );
  for (const ship of ships) if (ship.disabled) ship.status = "disabled";
  const kinds: MissionKind[] =
    scenario === "supply" || scenario === "sealed" || scenario === "low-energy"
      ? ["supply"]
      : scenario === "competition"
        ? ["supply", "supply"]
        : scenario === "four-missions"
          ? ["relay", "supply", "rescue", "science"]
          : ["relay", "supply"];
  const initial = resources();
  for (const k of RESOURCES)
    initial[k] =
      stations.reduce((n, s) => n + s.stock[k], 0) +
      (k === "energy" ? ships.reduce((n, s) => n + s.energy, 0) : 0);
  return {
    schemaVersion: 4,
    plannerVersion: PLANNER_VERSION,
    sessionId,
    seed,
    scenario,
    tick: 0,
    worldVersion: 1,
    status: "ready",
    strategy: "balanced",
    connected: true,
    stations,
    lanes,
    ships,
    missions: kinds.map((kind, i) =>
      createMission(kind, `mission-${i + 1}`, 0),
    ),
    discoveries: [],
    ledger: { initial, generated: resources(), consumed: resources() },
    faults: [],
    appliedFaults: [],
    actionIds: [],
    commandIds: [],
    replans: 0,
    message: "六舰待命。确定性调度与实际世界状态决定行动。",
    tools: [],
  };
}
