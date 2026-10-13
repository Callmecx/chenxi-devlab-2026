import { RESOURCES, total } from "./fixtures";
import type { DominionSnapshot } from "./types";

export function assertDominionInvariants(s: DominionSnapshot): string[] {
  const issues: string[] = [];
  const whole = (v: number) => Number.isSafeInteger(v) && v >= 0;
  const ids = new Set(s.stations.map((v) => v.id));
  if (
    ids.size !== s.stations.length ||
    new Set(s.ships.map((v) => v.id)).size !== s.ships.length ||
    new Set(s.lanes.map((v) => v.id)).size !== s.lanes.length ||
    new Set(s.missions.map((v) => v.id)).size !== s.missions.length
  )
    issues.push("duplicate-entity");
  if (
    new Set(s.actionIds).size !== s.actionIds.length ||
    new Set(s.commandIds).size !== s.commandIds.length
  )
    issues.push("duplicate-action-or-command");
  for (const k of RESOURCES) {
    const located =
      s.stations.reduce((n, v) => n + v.stock[k], 0) +
      s.ships.reduce(
        (n, v) => n + v.cargo[k] + (k === "energy" ? v.energy : 0),
        0,
      );
    if (
      located + s.ledger.consumed[k] !==
      s.ledger.initial[k] + s.ledger.generated[k]
    )
      issues.push(`conservation:${k}`);
    for (const v of [
      s.ledger.initial[k],
      s.ledger.generated[k],
      s.ledger.consumed[k],
    ])
      if (!whole(v)) issues.push(`ledger:${k}`);
  }
  for (const station of s.stations) {
    const occupancy = s.ships.filter((v) =>
      v.transit ? v.transit.to === station.id : v.nodeId === station.id,
    ).length;
    if (
      !whole(station.dockCapacity) ||
      !whole(station.blockedBerths) ||
      occupancy + station.blockedBerths > station.dockCapacity
    )
      issues.push(`dock:${station.id}`);
    for (const k of RESOURCES) {
      if (
        !whole(station.stock[k]) ||
        !whole(station.reserved[k]) ||
        station.reserved[k] > station.stock[k]
      )
        issues.push(`stock:${station.id}:${k}`);
      const owned = s.ships
        .filter((v) => v.sourceId === station.id)
        .reduce((n, v) => n + v.reserved[k], 0);
      if (owned !== station.reserved[k])
        issues.push(`reservation:${station.id}:${k}`);
    }
  }
  for (const lane of s.lanes) {
    if (
      !ids.has(lane.from) ||
      !ids.has(lane.to) ||
      lane.from === lane.to ||
      !whole(lane.capacity) ||
      lane.capacity < 1
    )
      issues.push(`lane:${lane.id}`);
    if (
      s.ships.filter((v) => v.transit?.laneId === lane.id).length >
      lane.capacity
    )
      issues.push(`lane-capacity:${lane.id}`);
  }
  for (const ship of s.ships) {
    if (
      !ids.has(ship.nodeId) ||
      !whole(ship.energy) ||
      !whole(ship.capacity) ||
      total(ship.cargo) > ship.capacity ||
      total(ship.reserved) > ship.capacity
    )
      issues.push(`ship:${ship.id}`);
    if (total(ship.cargo) && total(ship.reserved))
      issues.push(`cargo-double-ownership:${ship.id}`);
    if (
      (total(ship.cargo) || total(ship.reserved)) &&
      !s.missions.some((m) => m.id === ship.cargoOwner)
    )
      issues.push(`cargo-owner:${ship.id}`);
    for (const k of RESOURCES)
      if (!whole(ship.cargo[k]) || !whole(ship.reserved[k]))
        issues.push(`ship-resource:${ship.id}:${k}`);
    if (ship.transit) {
      const t = ship.transit,
        lane = s.lanes.find((v) => v.id === t.laneId);
      if (
        !lane ||
        !lane.roles.includes(ship.role) ||
        !(
          (lane.from === t.from && lane.to === t.to) ||
          (lane.to === t.from && lane.from === t.to)
        ) ||
        ship.nodeId !== t.from ||
        !whole(t.elapsed) ||
        t.elapsed >= t.duration ||
        t.duration !== Math.ceil(lane.ticks / ship.speed)
      )
        issues.push(`transit:${ship.id}`);
    }
    if (ship.missionId) {
      const mission = s.missions.find((m) => m.id === ship.missionId),
        step = mission?.steps.find((v) => v.id === ship.stepId);
      if (
        !mission ||
        !step ||
        step.shipId !== ship.id ||
        step.role !== ship.role ||
        step.status !== "assigned"
      )
        issues.push(`assignment:${ship.id}`);
    } else if (ship.stepId || ship.action)
      issues.push(`orphan-step:${ship.id}`);
  }
  for (const mission of s.missions) {
    if (
      mission.status === "completed" &&
      mission.steps.some((v) => v.status !== "completed")
    )
      issues.push(`premature-completion:${mission.id}`);
    if (
      mission.attempt !== mission.attempts.length ||
      mission.attempts.some((v, i) => v.attempt !== i + 1)
    )
      issues.push(`attempt:${mission.id}`);
    for (const step of mission.steps) {
      if (
        step.status !== "blocked" &&
        step.dependsOn.some(
          (id) =>
            mission.steps.find((v) => v.id === id)?.status !== "completed",
        )
      )
        issues.push(`dependency:${step.id}`);
      if (
        step.status === "assigned" &&
        !s.ships.some(
          (v) =>
            v.id === step.shipId &&
            v.missionId === mission.id &&
            v.stepId === step.id,
        )
      )
        issues.push(`step-owner:${step.id}`);
    }
  }
  for (const discovery of s.discoveries)
    if (
      discovery.tick > s.tick ||
      !ids.has(discovery.stationId) ||
      !s.ships.some((v) => v.id === discovery.shipId && v.role === "survey")
    )
      issues.push(`discovery:${discovery.id}`);
  return issues;
}
