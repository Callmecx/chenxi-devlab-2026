import { describe, expect, it } from 'vitest';
import { findOrbitPath } from './graph';
import { createOrbitFixture } from './fixtures';
import type { OrbitLane, OrbitStrategy } from './types';

describe('stable nonnegative two-cost Dijkstra', () => {
  it('uses actual different routes and returns summed costs', () => {
    const world = createOrbitFixture('normal', 1, 'test');
    const time = findOrbitPath(world.stations, world.lanes, 'port', 'target', 'time')!;
    const energy = findOrbitPath(world.stations, world.lanes, 'port', 'target', 'energy')!;
    expect(time.lanes).toEqual(['port-foundry', 'foundry-relay', 'relay-target']); expect(time.ticks).toBe(6); expect(time.energy).toBe(26);
    expect(energy.lanes).toEqual(['port-depot', 'depot-junction', 'junction-target']); expect(energy.ticks).toBe(9); expect(energy.energy).toBe(6);
  });
  it('honors direction, closed edges, missing IDs and valid equal start/target', () => {
    const world = createOrbitFixture('normal', 1, 'test'); const lane = { ...world.lanes[0]!, bidirectional: false };
    expect(findOrbitPath(world.stations, [lane], 'foundry', 'port', 'time')).toBeNull();
    expect(findOrbitPath(world.stations, [{ ...lane, open: false }], 'port', 'foundry', 'time')).toBeNull();
    expect(findOrbitPath(world.stations, [lane], 'unknown', 'unknown', 'time')).toBeNull();
    expect(findOrbitPath(world.stations, [], 'port', 'port', 'energy')).toEqual({ stations: ['port'], lanes: [], ticks: 0, energy: 0, distance: 0 });
  });
  it.each([-1, NaN, Infinity, 0.5])('rejects invalid energy %s', energy => {
    const w = createOrbitFixture('normal', 1, 'test'); w.lanes[0]!.energy = energy; expect(findOrbitPath(w.stations, w.lanes, 'port', 'target', 'energy')).toBeNull();
  });
  it('handles zero-energy cycles, shuffled lanes and immutable input', () => {
    const w = createOrbitFixture('normal', 1, 'test'); w.lanes.forEach(l => { l.energy = 0; }); const original = structuredClone(w);
    const route = findOrbitPath(w.stations, w.lanes, 'port', 'target', 'energy');
    expect(route).toEqual(findOrbitPath(w.stations, [...w.lanes].reverse(), 'port', 'target', 'energy'));
    expect(new Set(route!.stations).size).toBe(route!.stations.length); expect(w).toEqual(original);
  });
  it('matches an independent Floyd-Warshall oracle over 20 bounded graphs and all endpoint pairs', () => {
    const stations = createOrbitFixture('normal', 1, 'test').stations;
    const n = stations.length;
    for (let seed = 1; seed <= 20; seed++) {
      let state = seed; const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state; };
      const lanes: OrbitLane[] = [];
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (random() % 3 !== 0) lanes.push({ id: `l-${a}-${b}`, from: stations[a]!.id, to: stations[b]!.id, bidirectional: random() % 2 === 0, open: random() % 4 !== 0, ticks: random() % 7 + 1, energy: random() % 10, distance: 1, capacity: 1 });
      for (const strategy of ['time', 'energy'] as OrbitStrategy[]) {
        const costs = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
        for (const lane of lanes.filter(l => l.open)) { const a = stations.findIndex(s => s.id === lane.from), b = stations.findIndex(s => s.id === lane.to), cost = strategy === 'time' ? lane.ticks : lane.energy; costs[a]![b] = cost; if (lane.bidirectional) costs[b]![a] = cost; }
        for (let k = 0; k < n; k++) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) costs[a]![b] = Math.min(costs[a]![b]!, costs[a]![k]! + costs[k]![b]!);
        for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
          const route = findOrbitPath(stations, lanes, stations[a]!.id, stations[b]!.id, strategy);
          expect(route ? strategy === 'time' ? route.ticks : route.energy : Infinity).toBe(costs[a]![b]);
        }
      }
    }
  });
});
