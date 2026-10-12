import { describe, expect, it } from 'vitest';
import { createOrbitRuntime, replayOrbit, validateOrbitRecording, assertOrbitInvariants } from './index';
import type { OrbitRecording } from './types';

function completed() {
  const runtime = createOrbitRuntime(); runtime.start();
  for (let tick = 0; tick < 250 && runtime.snapshot.status === 'running'; tick++) runtime.step();
  expect(runtime.snapshot.status).toBe('completed');
  return structuredClone(runtime.exportRecording());
}
function mutate(record: OrbitRecording, kind: string) {
  if (kind === 'teleport') {
    const event = record.events.find(e => e.type === 'cargo.delivered')!;
    event.snapshot.carriers.find(c => c.id === event.payload.carrierId)!.nodeId = 'port';
  }
  if (kind === 'elapsed jump') {
    const event = record.events.find(e => e.type === 'carrier.progressed' && e.payload.duration === 3 && e.payload.elapsed === 1)!;
    event.snapshot.carriers.find(c => c.id === event.payload.carrierId)!.transit!.elapsed = 2; event.payload.elapsed = 2;
  }
  if (kind === 'position') record.events[1]!.snapshot.stations[0]!.position[0] += 3;
  if (kind === 'distance') record.events[1]!.snapshot.lanes[0]!.distance += 3;
  if (kind === 'target after delivery') record.events.at(-1)!.snapshot.task.targetId = 'port';
  if (kind === 'energy spending') record.events[1]!.snapshot.carriers[0]!.energy--;
  if (kind === 'stock relocation') { record.events[1]!.snapshot.stations[1]!.stock--; record.events[1]!.snapshot.stations[2]!.stock++; }
  if (kind === 'fault schedule') record.events[1]!.snapshot.faults.push({ tick: 100, laneId: 'port-depot', open: false });
  if (kind === 'deadline') record.events[1]!.snapshot.task.deadline++;
  if (kind === 'simulated tick gap') { const e = record.events.at(-1)!; e.simTick += 2; e.snapshot.simTick += 2; }
  if (kind === 'unrecorded action') record.events[1]!.snapshot.actionIds.push('fabricated-action');
  if (kind === 'wait budget') { record.events[1]!.snapshot.carriers[0]!.waitTicks = 1; record.events[1]!.snapshot.carriers[0]!.totalWait = 1; }
}
describe('bounded replay validates history without executing it', () => {
  it.each(['teleport', 'elapsed jump', 'position', 'distance', 'target after delivery', 'energy spending', 'stock relocation', 'fault schedule', 'deadline', 'simulated tick gap', 'unrecorded action', 'wait budget'])('rejects individually plausible %s tampering', kind => {
    const record = completed(); mutate(record, kind);
    // These attacks keep every single snapshot physically plausible; adjacent history must reject them.
    for (const event of record.events) expect(assertOrbitInvariants(event.snapshot)).toEqual([]);
    expect(() => validateOrbitRecording(record)).toThrow(/Invalid ORBIT recording/);
  });
  it('returns immutable verified recordings and reuses the import validation for repeated seeks', () => {
    const record = validateOrbitRecording(JSON.stringify(completed()));
    expect(Object.isFrozen(record)).toBe(true); expect(Object.isFrozen(record.events[0]!.snapshot.stations[0])).toBe(true);
    expect(validateOrbitRecording(record)).toBe(record);
    expect(() => { record.events[0]!.snapshot.stations[0]!.stock++; }).toThrow();
    for (let index = record.events.length - 1; index >= -1; index--) expect(replayOrbit(record, index)).toEqual(index < 0 ? record.initial : record.events[index]!.snapshot);
    expect(() => replayOrbit(record, record.events.length)).toThrow(); expect(() => replayOrbit(record, 0.1)).toThrow();
  });
  it.each(['cycle', 'sparse', 'array property', 'oversized events', 'oversized string', 'prototype', 'poison key'])('rejects unsafe %s input before use', kind => {
    const record = completed(); const payload = record.events[0]!.payload;
    if (kind === 'cycle') payload.loop = record;
    if (kind === 'sparse') payload.sparse = Array(3);
    if (kind === 'array property') { const a: unknown[] & { extra?: boolean } = []; a.extra = true; payload.a = a; }
    if (kind === 'oversized events') record.events = Array.from({ length: 513 }, () => record.events[0]!);
    if (kind === 'oversized string') payload.huge = 'x'.repeat(100001);
    if (kind === 'prototype') Object.setPrototypeOf(payload, { custom: true });
    if (kind === 'poison key') Object.defineProperty(payload, '__proto__', { value: {}, enumerable: true });
    expect(() => validateOrbitRecording(record)).toThrow(/Invalid ORBIT recording/);
  });
});
