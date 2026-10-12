import type { OrbitLane, OrbitStation, OrbitStrategy } from './types';
export interface OrbitPath { stations: string[]; lanes: string[]; ticks: number; energy: number; distance: number }
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
/** Stable Dijkstra on nonnegative costs. Path stations include both endpoints. */
export function findOrbitPath(stations: OrbitStation[], lanes: OrbitLane[], from: string, to: string, strategy: OrbitStrategy): OrbitPath | null {
  if (!Array.isArray(stations) || stations.length > 32 || !Array.isArray(lanes) || lanes.length > 128 || !['time', 'energy'].includes(strategy)) return null;
  const ids = new Set(stations.map(s => s.id)), edgeIds = new Set(lanes.map(l => l.id));
  if (ids.size !== stations.length || edgeIds.size !== lanes.length || !ids.has(from) || !ids.has(to)) return null;
  if (lanes.some(l => !ids.has(l.from) || !ids.has(l.to) || l.from === l.to || !whole(l.ticks) || l.ticks < 1 || !whole(l.energy) || !Number.isFinite(l.distance) || l.distance < 0 || !whole(l.capacity) || l.capacity < 1 || typeof l.open !== 'boolean' || typeof l.bidirectional !== 'boolean')) return null;
  const rank = (p: OrbitPath) => strategy === 'time' ? [p.ticks, p.energy] : [p.energy, p.ticks];
  const compare = (a: OrbitPath, b: OrbitPath) => rank(a)[0]! - rank(b)[0]! || rank(a)[1]! - rank(b)[1]! || a.lanes.join('|').localeCompare(b.lanes.join('|'));
  const best = new Map<string, OrbitPath>([[from, { stations: [from], lanes: [], ticks: 0, energy: 0, distance: 0 }]]), visited = new Set<string>();
  for (let count = 0; count < stations.length; count++) {
    const next = [...best.entries()].filter(([id]) => !visited.has(id)).sort((a, b) => compare(a[1], b[1]) || a[0].localeCompare(b[0]))[0];
    if (!next) return null;
    const [id, path] = next; if (id === to) return path; visited.add(id);
    for (const lane of lanes.filter(l => l.open).sort((a, b) => a.id.localeCompare(b.id))) {
      const destination = lane.from === id ? lane.to : lane.bidirectional && lane.to === id ? lane.from : null;
      if (!destination || visited.has(destination)) continue;
      const candidate: OrbitPath = { stations: [...path.stations, destination], lanes: [...path.lanes, lane.id], ticks: path.ticks + lane.ticks, energy: path.energy + lane.energy, distance: path.distance + lane.distance };
      const old = best.get(destination); if (!old || compare(candidate, old) < 0) best.set(destination, candidate);
    }
  }
  return null;
}
