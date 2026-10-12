import { describe, expect, it, vi } from 'vitest';
import { createOrbitRuntime, compareOrbit, assertOrbitInvariants, sourceKey, replayOrbit, validateOrbitRecording } from './index';
import type { OrbitRuntime } from './runtime';
import type { OrbitScenario } from './types';

function finish(runtime: OrbitRuntime) {
  runtime.start(); runtime.resume();
  for (let i = 0; i < 250 && runtime.snapshot.status === 'running'; i++) {
    runtime.step(); expect(assertOrbitInvariants(runtime.snapshot)).toEqual([]);
  }
  return runtime.snapshot;
}
describe('ORBIT committed state and bounded dual-carrier scheduler', () => {
  it.each(['normal', 'detour'] as OrbitScenario[])('%s actually delivers with both carriers and a valid trace', scenario => {
    const runtime = createOrbitRuntime({ scenario }); const initial = runtime.snapshot;
    const final = finish(runtime);
    expect(final.status).toBe('completed'); expect(final.task.delivered).toBe(3);
    expect(final.carriers.every(c => c.delivered > 0)).toBe(true);
    expect(final.carriers.reduce((sum, c) => sum + c.energy, 0)).toBeLessThan(initial.carriers.reduce((sum, c) => sum + c.energy, 0));
    expect(new Set(final.actionIds).size).toBe(final.actionIds.length);
    const recorded = runtime.exportRecording(); expect(replayOrbit(recorded, recorded.events.length - 1)).toEqual(final);
  });
  it.each([['sealed', 'UNREACHABLE'], ['scarce', 'INSUFFICIENT_STOCK'], ['low-energy', 'INSUFFICIENT_ENERGY']] as const)('%s fails honestly: %s', (scenario, code) => {
    const runtime = createOrbitRuntime({ scenario }); const final = finish(runtime);
    expect(final.status).toBe('failed'); expect(final.failureCode).toBe(code); expect(final.task.delivered).toBe(0);
    expect(final.simTick).toBeLessThan(10); expect(runtime.exportRecording()).toBeTruthy();
  });
  it('closing an entered lane preserves progress and completes only that entered lane before replanning', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step(); runtime.step();
    const before = runtime.snapshot.carriers[0]!; expect(before.transit?.laneId).toBe('port-foundry');
    runtime.setLane('port-foundry', false); const changed = runtime.snapshot;
    expect(changed.carriers[0]!.transit).toEqual(before.transit); expect(changed.carriers[0]!.route).toEqual([]);
    runtime.step(); expect(runtime.snapshot.carriers[0]!.transit?.elapsed).toBe(1);
    runtime.step(); expect(runtime.snapshot.carriers[0]!.nodeId).toBe('foundry');
    expect(finish(runtime).status).toBe('completed');
    expect(runtime.events.filter(e => e.type === 'carrier.departed' && e.payload.laneId === 'port-foundry')).toHaveLength(1);
  });
  it('unentered closed route is discarded with worldVersion and recovery does not teleport', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step();
    const oldVersion = runtime.snapshot.worldVersion;
    runtime.setLane('port-foundry', false); runtime.setLane('port-depot', false);
    expect(runtime.snapshot.worldVersion).toBe(oldVersion + 2);
    expect(runtime.snapshot.carriers.every(c => c.route.length === 0)).toBe(true);
    expect(finish(runtime).status).toBe('failed');
    expect(runtime.snapshot.carriers.every(c => c.nodeId === 'port' && c.transit === null)).toBe(true);
    runtime.setLane('port-foundry', true); runtime.setLane('port-depot', true); runtime.retry();
    expect(finish(runtime).status).toBe('completed');
  });
  it('cancel releases unladen reservations and preserves loaded/consumed/delivered facts', () => {
    const reserved = createOrbitRuntime(); reserved.start(); reserved.step();
    expect(reserved.snapshot.stations.reduce((sum, s) => sum + s.reserved, 0)).toBe(3);
    reserved.cancel(); expect(reserved.snapshot.stations.every(s => s.reserved === 0)).toBe(true);
    expect(reserved.snapshot.stations.reduce((sum, s) => sum + s.stock, 0)).toBe(4);
    const runtime = createOrbitRuntime(); runtime.start();
    while (!runtime.snapshot.task.delivered) runtime.step();
    const before = runtime.snapshot; runtime.cancel(); const cancelled = runtime.snapshot;
    expect(cancelled.task.delivered).toBe(before.task.delivered);
    expect(cancelled.carriers.map(c => [c.energy, c.cargo, c.transit])).toEqual(before.carriers.map(c => [c.energy, c.cargo, c.transit]));
    runtime.step(); runtime.start(); runtime.retry(); expect(runtime.snapshot).toEqual(cancelled);
    expect(runtime.exportRecording()).toBeTruthy();
  });
  it('after a committed delivery target changes are rejected without reassigning the historical delivery', () => {
    const runtime = createOrbitRuntime(); runtime.start(); while (!runtime.snapshot.task.delivered) runtime.step();
    const delivered = runtime.snapshot.task.delivered; expect(delivered).toBe(2);
    const version = runtime.snapshot.worldVersion; runtime.setTarget('port'); expect(runtime.snapshot.task.delivered).toBe(delivered);
    expect(runtime.snapshot.task.targetId).toBe('target'); expect(runtime.snapshot.worldVersion).toBe(version); expect(runtime.events.at(-1)!.type).toBe('command.rejected');
    expect(finish(runtime).status).toBe('completed'); expect(runtime.snapshot.task.delivered).toBe(3);
    expect(runtime.events.some(e => e.type === 'cargo.delivered' && e.payload.targetId === 'port')).toBe(false);
    runtime.exportRecording();
  });
  it('retargeting before any delivery invalidates only future plans and completes at the new target', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step(); runtime.step();
    const before = runtime.snapshot; runtime.setTarget('port');
    expect(runtime.snapshot.worldVersion).toBe(before.worldVersion + 1); expect(runtime.snapshot.carriers.map(c => c.transit)).toEqual(before.carriers.map(c => c.transit));
    expect(runtime.snapshot.task.label).toBe('向星环港交付三份能源组件');
    expect(finish(runtime).status).toBe('completed');
    expect(runtime.events.filter(e => e.type === 'cargo.delivered').every(e => e.payload.targetId === 'port')).toBe(true);
    runtime.exportRecording();
  });
  it('pause/step is inert and reset generates a new run with original quantities', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step(); runtime.pause(); const frozen = runtime.snapshot;
    runtime.step(); expect(runtime.snapshot).toEqual(frozen); runtime.resume(); runtime.step();
    runtime.reset('normal', 99); expect(runtime.snapshot.runId).not.toBe(frozen.runId); expect(runtime.snapshot.seed).toBe(99);
    expect(runtime.snapshot.task.delivered).toBe(0); expect(runtime.snapshot.actionIds).toHaveLength(0);
    expect(finish(runtime).status).toBe('completed');
  });
  it('returned snapshots/events cannot mutate facts or authorize duplicated actions', () => {
    const runtime = createOrbitRuntime(); const snapshot = runtime.snapshot; snapshot.stations[1]!.stock = 999; runtime.events[0]!.snapshot.carriers[0]!.energy = 999;
    expect(runtime.snapshot.stations[1]!.stock).toBe(2); expect(runtime.snapshot.carriers[0]!.energy).toBe(70);
    const final = finish(runtime); runtime.step(); expect(runtime.snapshot.actionIds).toEqual(final.actionIds);
  });
  it('invalid targets and inputs are rejected without changing world facts', () => {
    const runtime = createOrbitRuntime(); const before = runtime.snapshot;
    runtime.setTarget('missing'); runtime.setPriority('carrier-a', -1); runtime.setLane('bad', true);
    expect(runtime.snapshot.worldVersion).toBe(before.worldVersion); expect(runtime.snapshot.task).toEqual(before.task);
    expect(runtime.events.at(-1)!.type).toBe('command.rejected');
  });
});
describe('isolated counterfactual comparison and read-only replay', () => {
  it('same fork preserves original and repeats future fault timing; strategy outcomes may coincide', () => {
    const runtime = createOrbitRuntime({ scenario: 'detour', seed: 88 }); runtime.start(); runtime.step(); runtime.pause();
    const before = runtime.snapshot, events = runtime.events; const comparison = compareOrbit(before, events.length);
    expect(runtime.snapshot).toEqual(before); expect(runtime.events).toEqual(events);
    for (const branch of [comparison.time, comparison.energy]) {
      expect(branch.parentRunId).toBe(before.runId); expect(branch.forkSeq).toBe(events.length); expect(branch.sourceKey).toBe(sourceKey(before));
      expect(branch.snapshot.seed).toBe(88); expect(branch.snapshot.faults).toEqual(before.faults); expect(branch.snapshot.appliedFaults).toEqual([0]);
      expect(branch.snapshot.status).toBe('completed'); expect(branch.violations).toEqual([]); expect(branch.trace.length).toBeGreaterThan(0);
    }
    expect(comparison.time.snapshot.runId).not.toBe(comparison.energy.snapshot.runId);
    expect([comparison.time.ticks, comparison.time.energyUsed]).toEqual([18, 25]);
    expect([comparison.energy.ticks, comparison.energy.energyUsed]).toEqual([18, 25]);
  });
  it('normal fixture offers a measured time/energy tradeoff without a hardcoded winner', () => {
    const runtime = createOrbitRuntime(); const comparison = compareOrbit(runtime.snapshot, runtime.events.length);
    expect(comparison.time.snapshot.status).toBe('completed'); expect(comparison.energy.snapshot.status).toBe('completed');
    expect(comparison.time.ticks).toBeLessThan(comparison.energy.ticks);
    expect(comparison.energy.energyUsed).toBeLessThan(comparison.time.energyUsed);
    expect(comparison.time.trace.map(t => t.laneId)).not.toEqual(comparison.energy.trace.map(t => t.laneId));
  });
  it('source key covers strategy, constraints, reservations, lane state, fault schedule and priority', () => {
    const runtime = createOrbitRuntime(); const before = sourceKey(runtime.snapshot);
    runtime.setPriority('carrier-b', 4); expect(sourceKey(runtime.snapshot)).not.toBe(before);
    const state = runtime.snapshot; const next = structuredClone(state); next.task.deadline--; expect(sourceKey(next)).not.toBe(sourceKey(state));
    next.faults = [{ tick: 9, laneId: 'port-depot', open: false }]; expect(sourceKey(next)).not.toBe(sourceKey(state));
  });
  it('source key ignores pause messages and measured tool duration without ignoring world facts', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step(); const before = sourceKey(runtime.snapshot); runtime.pause();
    expect(sourceKey(runtime.snapshot)).toBe(before);
    const same = runtime.snapshot; same.message = 'UI message'; same.tools.forEach(t => { t.durationMs += 123; }); expect(sourceKey(same)).toBe(before);
    runtime.setStrategy('energy'); expect(sourceKey(runtime.snapshot)).not.toBe(before);
  });
  it('replay selects initial/each event with no timers, network, runtime work or aliasing', () => {
    const runtime = createOrbitRuntime(); finish(runtime); const record = runtime.exportRecording();
    const before = runtime.snapshot; const timer = vi.spyOn(globalThis, 'setTimeout'); const network = vi.spyOn(globalThis, 'fetch');
    try {
      expect(replayOrbit(record, -1)).toEqual(record.initial);
      for (let index = 0; index < record.events.length; index++) expect(replayOrbit(record, index)).toEqual(record.events[index]!.snapshot);
      expect(timer).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(runtime.snapshot).toEqual(before);
      const replay = replayOrbit(record, 0); replay.stations[0]!.label = 'changed'; expect(record.events[0]!.snapshot.stations[0]!.label).not.toBe('changed');
    } finally { timer.mockRestore(); network.mockRestore(); }
  });
  it.each(['seq', 'stock', 'energy', 'action', 'seed', 'version', 'payload'] as const)('rejects malformed %s records before replay', field => {
    const runtime = createOrbitRuntime(); finish(runtime); const record = structuredClone(runtime.exportRecording());
    if (field === 'seq') record.events[0]!.seq = 10;
    if (field === 'stock') record.events[0]!.snapshot.stations[0]!.stock = -1;
    if (field === 'energy') record.events[0]!.snapshot.carriers[0]!.energy = 999;
    if (field === 'action') record.events.at(-1)!.snapshot.actionIds.push(record.events.at(-1)!.snapshot.actionIds[0]!);
    if (field === 'seed') record.seed++;
    if (field === 'version') record.events[0]!.worldVersion++;
    if (field === 'payload') Object.defineProperty(record.events[0]!.payload, 'evil', { get() { throw new Error('getter executed'); }, enumerable: true });
    expect(() => validateOrbitRecording(record)).toThrow(/Invalid ORBIT recording/);
  });
});
