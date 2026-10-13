import { findOrbitPath } from "../orbit/graph";
import type { DominionSnapshot, Ship, Strategy } from "./types";

export interface Path {
  stations: string[];
  lanes: string[];
  ticks: number;
  energy: number;
  risk: number;
  score: number;
}
/** Reuses V3 stable Dijkstra with explicit nonnegative, integer policy weights.
 * Balanced: ticks/8 + EU/8 + risk/3 (scaled by 24); no global optimum claim. */
export function findPath(
  world: DominionSnapshot,
  ship: Ship,
  from: string,
  to: string,
  strategy: Strategy = world.strategy,
): Path | null {
  const cost = (ticks: number, energy: number, risk: number) =>
    strategy === "time"
      ? ticks * 120 + energy
      : strategy === "energy"
        ? energy * 120 + ticks
        : strategy === "robust"
          ? risk * 90 + ticks * 8 + energy * 4
          : ticks * 3 + energy * 3 + risk * 8;
  const candidates = world.lanes
    .filter((l) => l.roles.includes(ship.role))
    .map((l) => ({
      ...l,
      bidirectional: true,
      open: l.open && !l.damaged,
      distance: l.ticks,
      ticks: cost(Math.ceil(l.ticks / ship.speed), l.energy, l.risk),
    }));
  const stations = world.stations.map((s) => ({
    ...s,
    kind: "relay" as const,
    stock: 0,
    reserved: 0,
  }));
  const route = findOrbitPath(stations, candidates, from, to, "time");
  if (!route) return null;
  const edges = route.lanes.map((id) => world.lanes.find((l) => l.id === id)!);
  return {
    stations: route.stations,
    lanes: route.lanes,
    ticks: edges.reduce((n, l) => n + Math.ceil(l.ticks / ship.speed), 0),
    energy: edges.reduce((n, l) => n + l.energy, 0),
    risk: edges.reduce((n, l) => n + l.risk, 0),
    score: edges.reduce(
      (n, l) => n + cost(Math.ceil(l.ticks / ship.speed), l.energy, l.risk),
      0,
    ),
  };
}

export function feasiblePath(
  world: DominionSnapshot,
  ship: Ship,
  from: string,
  to: string,
  available = ship.energy,
): Path | null {
  const preferred = findPath(world, ship, from, to);
  if (preferred && preferred.energy <= available) return preferred;
  const economical = findPath(world, ship, from, to, "energy");
  return economical && economical.energy <= available ? economical : null;
}
