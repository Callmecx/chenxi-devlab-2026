import { describe, expect, it } from 'vitest';
import { createOrbitRuntime, assertOrbitInvariants } from './index';
import type { OrbitRuntime } from './runtime';
import { MAX_ORBIT_BYTES } from './recording';

function run(runtime: OrbitRuntime) {
  runtime.start(); runtime.resume();
  for (let tick = 0; tick < 250 && runtime.snapshot.status === 'running'; tick++) {
    runtime.step(); expect(assertOrbitInvariants(runtime.snapshot)).toEqual([]);
  }
  runtime.exportRecording(); return runtime.snapshot;
}
describe('priority reservations and finite execution', () => {
  it('serializes two carriers sharing a capacity-one source and lane without overselling', () => {
    const snapshot = createOrbitRuntime().snapshot;
    snapshot.stations.find(s => s.id === 'foundry')!.stock = 4; snapshot.stations.find(s => s.id === 'depot')!.stock = 0;
    const runtime = createOrbitRuntime({ snapshot }); const final = run(runtime);
    expect(final.status).toBe('completed'); expect(final.task.delivered).toBe(3);
    expect(final.carriers.every(c => c.delivered > 0)).toBe(true);
    expect(final.carriers.reduce((sum, c) => sum + c.totalWait, 0)).toBeGreaterThan(0);
    expect(runtime.events.some(e => e.type === 'carrier.waiting')).toBe(true);
    for (const event of runtime.events) expect(assertOrbitInvariants(event.snapshot)).toEqual([]);
  });
  it('higher numeric priority obtains the first reservation and changed priorities invalidate plans', () => {
    const runtime = createOrbitRuntime(); runtime.setPriority('carrier-b', 9); runtime.start(); runtime.step();
    expect(runtime.events.find(e => e.type === 'resource.reserved')!.payload.carrierId).toBe('carrier-b');
    const before = runtime.snapshot; runtime.setPriority('carrier-a', 8);
    expect(runtime.snapshot.worldVersion).toBe(before.worldVersion + 1); expect(runtime.snapshot.carriers.every(c => c.route.length === 0)).toBe(true);
    expect(runtime.snapshot.stations).toEqual(before.stations); runtime.exportRecording();
  });
  it('a permanently occupied target dock fails with a bounded wait and preserves committed delivery', () => {
    const snapshot = createOrbitRuntime().snapshot;
    snapshot.stations.find(s => s.id === 'target')!.dockCapacity = 1;
    const runtime = createOrbitRuntime({ snapshot }); const final = run(runtime);
    expect(final.status).toBe('failed'); expect(final.failureCode).toBe('WAIT_LIMIT');
    expect(final.task.delivered).toBeGreaterThan(0); expect(final.task.delivered).toBeLessThan(3);
    expect(Math.max(...final.carriers.map(c => c.waitTicks))).toBe(17); expect(final.simTick).toBeLessThan(50);
    const committed = final.task.delivered; runtime.cancel(); expect(runtime.snapshot.task.delivered).toBe(committed); runtime.exportRecording();
    runtime.reset(); expect(run(runtime).status).toBe('completed');
  });
  it('scarce retries do not acquire new reservations or fabricate inventory', () => {
    const runtime = createOrbitRuntime({ scenario: 'scarce' }); runtime.start();
    const before = runtime.snapshot; for (let attempt = 0; attempt < 3; attempt++) runtime.retry();
    expect(runtime.snapshot.status).toBe('failed'); expect(runtime.snapshot.failureCode).toBe('INSUFFICIENT_STOCK');
    expect(runtime.snapshot.stations).toEqual(before.stations); expect(runtime.snapshot.actionIds).toEqual(before.actionIds); runtime.exportRecording();
  });
  it('repeated control commands cannot create unbounded history and the stopped run remains exportable', () => {
    const runtime = createOrbitRuntime();
    for (let edit = 0; edit < 1000; edit++) runtime.setLane('port-depot', edit % 2 !== 0);
    expect(runtime.snapshot.status).toBe('failed'); expect(runtime.snapshot.failureCode).toBe('EXECUTION_LIMIT');
    expect(runtime.events.length).toBeLessThanOrEqual(512); runtime.exportRecording();
    runtime.cancel(); expect(runtime.events.at(-1)!.type).toBe('run.cancelled'); runtime.exportRecording();
  });
  it('heavy planning plus command storms stop before byte/structure limits with the exact last committed snapshot exportable', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step();
    for (let i = 0; i < 29; i++) { runtime.setStrategy(i % 2 === 0 ? 'energy' : 'time'); runtime.step(); }
    expect(runtime.snapshot.tools.length).toBeGreaterThan(50); runtime.pause();
    const committed = runtime.snapshot;
    for (let i = 0; i < 500; i++) runtime.setPriority('carrier-a', i % 3);
    const stopped = runtime.snapshot;
    expect(stopped.status).toBe('failed'); expect(stopped.failureCode).toBe('EXECUTION_LIMIT');
    expect(stopped.actionIds).toEqual(committed.actionIds); expect(stopped.stations).toEqual(committed.stations);
    const record = runtime.exportRecording(); expect(record.events.at(-1)!.snapshot).toEqual(stopped);
    expect(new TextEncoder().encode(JSON.stringify(record)).byteLength).toBeLessThan(MAX_ORBIT_BYTES);
    expect(record.events.length).toBeLessThan(509);
    for (let i = 0; i < 50; i++) runtime.reset('normal', -1);
    expect(runtime.snapshot).toEqual(stopped); expect(runtime.exportRecording()).toEqual(record);
    runtime.cancel(); const cancelled = runtime.exportRecording();
    expect(cancelled.events.at(-1)!.snapshot).toEqual(runtime.snapshot); expect(runtime.snapshot.status).toBe('cancelled');
    expect(runtime.snapshot.stations.every(s => s.reserved === 0)).toBe(true);
    runtime.reset(); expect(run(runtime).status).toBe('completed');
  });
  it('an invalid reset after completion is a recorded refusal, without mutating committed facts', () => {
    const runtime = createOrbitRuntime(); const completed = run(runtime);
    runtime.reset('normal', -1); expect(runtime.snapshot.status).toBe('completed'); expect(runtime.snapshot.actionIds).toEqual(completed.actionIds);
    expect(runtime.exportRecording().events.at(-1)!.type).toBe('command.rejected');
  });
  it('invalid resets after a replan limit remain inert and preserve the emergency cancel event', () => {
    const runtime = createOrbitRuntime(); runtime.start(); runtime.step();
    for (let i = 0; i < 40 && runtime.snapshot.status === 'running'; i++) { runtime.setStrategy(i % 2 === 0 ? 'energy' : 'time'); runtime.step(); }
    expect(runtime.snapshot.failureCode).toBe('REPLAN_LIMIT');
    const stopped = runtime.snapshot, record = runtime.exportRecording();
    for (let i = 0; i < 50; i++) runtime.reset('normal', -1);
    expect(runtime.snapshot).toEqual(stopped); expect(runtime.exportRecording()).toEqual(record);
    runtime.cancel(); expect(runtime.exportRecording().events.at(-1)!.type).toBe('run.cancelled');
  });
});
