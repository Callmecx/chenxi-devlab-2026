import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, defaultGoal } from './engine';
import { buildRecording, MAX_RECORDING_BYTES, MAX_RECORDING_EVENTS, parseRecording, replaySnapshot, validateRecording } from './recording';
import type { Recording } from './types';

function recording() {
  const runtime = createRuntime({ delayMs: 0 });
  runtime.plan(defaultGoal('warehouse'));
  return runtime.exportRecording();
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded recording schema and detached imports', () => {
  it('preserves actual event IDs, input, seed, sequence and every step snapshot on JSON round-trip', async () => {
    vi.useFakeTimers();
    const runtime = createRuntime({ delayMs: 5 }); runtime.plan(defaultGoal('product'));
    for (let i = 0; i < 3; i += 1) { const pending = runtime.step(); await vi.runAllTimersAsync(); await pending; }
    runtime.approve(true); const pending = runtime.step(); await vi.runAllTimersAsync(); await pending;
    const result = runtime.exportRecording();
    expect(result.events).toEqual(runtime.events);
    expect(result.seed).toBe(result.input.seed);
    expect(result.events.map(event => event.seq)).toEqual(result.events.map((_event, index) => index + 1));
    expect(result.events.at(-1)!.snapshot.status).toBe('succeeded');
    expect(parseRecording(JSON.stringify(result))).toEqual(result);
    const validated = validateRecording(result);
    validated.events[0]!.snapshot.goal.quantity = 999;
    expect(result.events[0]!.snapshot.goal.quantity).toBe(2);
    expect(buildRecording(result.input, result.events).events).toEqual(result.events);
  });

  it('allows semantically identical JSON key order without weakening coordinate checks', () => {
    const record = recording();
    record.events[0]!.snapshot.goal = { seed: record.input.seed, slotId: record.input.slotId, category: record.input.category, quantity: record.input.quantity, budgetCents: record.input.budgetCents, prompt: record.input.prompt, preset: record.input.preset };
    expect(() => validateRecording(record)).not.toThrow();
    const robot = record.events[0]!.snapshot.world.robot;
    record.events[0]!.snapshot.world.obstacles.push({ y: robot.y, x: robot.x });
    expect(() => validateRecording(record)).toThrow('robot inside obstacle');
  });

  it.each<[string, (record: Recording) => void]>([
    ['schema', record => { record.schemaVersion = 2 as 1; }],
    ['event schema', record => { record.events[0]!.schemaVersion = 2 as 1; }],
    ['duplicate sequence', record => { record.events[1]!.seq = 1; }],
    ['duplicate event ID', record => { record.events[1]!.eventId = record.events[0]!.eventId; }],
    ['wrong event run', record => { record.events[1]!.runId = 'another-run'; }],
    ['wrong snapshot run', record => { record.events[1]!.snapshot.runId = 'another-run'; }],
    ['unknown parent', record => { record.events[1]!.parentEventId = 'not-seen'; }],
    ['unsafe identifier', record => { record.events[0]!.eventId = '<script>'; }],
    ['input seed mismatch', record => { record.seed += 1; }],
    ['snapshot seed mismatch', record => { record.events[0]!.snapshot.world.seed += 1; }],
    ['snapshot input mismatch', record => { record.events[0]!.snapshot.goal.quantity += 1; }],
    ['negative quantity', record => { record.input.quantity = -1; }],
    ['fractional money', record => { record.input.budgetCents = 1.25; }],
    ['unknown mode', record => { record.events[0]!.sourceMode = 'magic' as 'local-simulation'; }],
    ['world version mismatch', record => { record.events[0]!.worldVersion += 1; }],
    ['invalid timestamp', record => { record.createdAt = '2026-02-30T00:00:00.000Z'; }],
    ['negative duration', record => { record.events[0]!.snapshot.nodes[0]!.durationMs = -1; }],
    ['duplicate node', record => { record.events[0]!.snapshot.nodes.push(record.events[0]!.snapshot.nodes[0]!); }],
    ['carrying absent cargo', record => { record.events[0]!.snapshot.world.carrying = 'absent'; }],
    ['carrying cargo away from robot', record => { record.events[0]!.snapshot.world.carrying = 'cargo-a'; }],
    ['delivered cargo outside target', record => { record.events[0]!.snapshot.world.cargo[0]!.delivered = true; }],
    ['teleport path', record => { record.events[0]!.snapshot.world.path = [{ x: 10, y: 7 }]; }],
    ['duplicate obstacle in different key order', record => { const point = record.events[0]!.snapshot.world.obstacles[0]!; record.events[0]!.snapshot.world.obstacles.push({ y: point.y, x: point.x }); }],
    ['backwards timestamps', record => { record.events[0]!.timestamp = '2026-10-12T00:00:01.000Z'; record.events[1]!.timestamp = '2026-10-12T00:00:00.000Z'; }],
  ])('rejects %s', (_label, mutate) => {
    const record = recording(); mutate(record);
    expect(() => validateRecording(record)).toThrow('Invalid recording:');
  });

  it.each([undefined, null, [], {}, '{broken json', 17, true])('rejects malformed roots: %j', input => {
    expect(() => validateRecording(input)).toThrow('Invalid recording:');
  });

  it('rejects missing and unexpected fields', () => {
    const record = recording() as unknown as Record<string, unknown>;
    delete record.seed; expect(() => validateRecording(record)).toThrow('fields');
    const other = recording() as unknown as Record<string, unknown>;
    other.instruction = 'execute this'; expect(() => validateRecording(other)).toThrow('fields');
  });

  it('rejects an empty event trace and a trace exceeding the event limit', () => {
    const record = recording(); record.events = [];
    expect(() => validateRecording(record)).toThrow('empty events');
    const other = recording(); other.events = Array.from({ length: MAX_RECORDING_EVENTS + 1 }, () => other.events[0]!);
    expect(() => validateRecording(other)).toThrow();
  });

  it('rejects oversized strings and oversized UTF-8 JSON byte payloads before replay', () => {
    expect(() => validateRecording(' '.repeat(MAX_RECORDING_BYTES + 1))).toThrow('size');
    const record = recording();
    record.events[0]!.payload.large = Array.from({ length: 800 }, () => 'a'.repeat(11000));
    expect(() => validateRecording(record)).toThrow('byte size');
  });

  it.each(['cycle', 'function', 'nan', 'infinity', 'bigint', 'undefined', 'symbol', 'prototype', 'deep', 'array-hole', 'array-property'] as const)('rejects non-JSON or excessive payload: %s', kind => {
    const record = recording(); const payload = record.events[0]!.payload;
    if (kind === 'cycle') payload.self = payload;
    if (kind === 'function') payload.run = () => 1;
    if (kind === 'nan') payload.value = NaN;
    if (kind === 'infinity') payload.value = Infinity;
    if (kind === 'bigint') payload.value = BigInt(1);
    if (kind === 'undefined') payload.value = undefined;
    if (kind === 'symbol') Object.defineProperty(payload, Symbol('secret'), { value: 1 });
    if (kind === 'prototype') payload.value = new Date();
    if (kind === 'deep') { let next = payload; for (let i = 0; i < 30; i += 1) { next.nested = {}; next = next.nested as Record<string, unknown>; } }
    if (kind === 'array-hole') payload.value = new Array(2);
    if (kind === 'array-property') { const list = [1]; Object.assign(list, { hiddenInstruction: 'run' }); payload.value = list; }
    expect(() => validateRecording(record)).toThrow('Invalid recording:');
  });

  it('rejects accessors without executing them or calling toJSON', () => {
    const getter = vi.fn(() => 'executed'); const toJSON = vi.fn(() => 'executed');
    const record = recording(); Object.defineProperty(record.events[0]!.payload, 'danger', { enumerable: true, get: getter });
    expect(() => validateRecording(record)).toThrow('unsafe property'); expect(getter).not.toHaveBeenCalled();
    const other = recording(); other.events[0]!.payload.toJSON = toJSON;
    expect(() => validateRecording(other)).toThrow('non-JSON'); expect(toJSON).not.toHaveBeenCalled();
    const pollution = JSON.parse(JSON.stringify(recording()).replace('"payload":{', '"payload":{"__proto__":{"polluted":true},'));
    expect(() => validateRecording(pollution)).toThrow('unsafe property');
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
});

describe('pure snapshot replay', () => {
  it('selects a detached historical snapshot and never dispatches tools, network, storage, timers or runtime mutations', () => {
    const runtime = createRuntime(); runtime.plan(defaultGoal('product'));
    const record = runtime.exportRecording();
    record.events[1]!.payload.command = 'confirm-booking-local';
    const step = vi.spyOn(runtime, 'step'); const approve = vi.spyOn(runtime, 'approve');
    const fetch = vi.fn(() => { throw new Error('network must not run'); });
    const setItem = vi.fn(() => { throw new Error('storage must not run'); });
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('localStorage', { setItem });
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const before = runtime.snapshot; const eventCount = runtime.events.length;
    const snapshot = replaySnapshot(record, 1);
    expect(snapshot).toEqual(record.events[1]!.snapshot);
    snapshot.goal.quantity = 12; snapshot.writes = 900;
    expect(replaySnapshot(record, 1).goal.quantity).toBe(2);
    expect(runtime.snapshot).toEqual(before); expect(runtime.events).toHaveLength(eventCount);
    for (const spy of [step, approve, fetch, setItem, timer]) expect(spy).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, Infinity, 999999])('rejects replay index %s', index => {
    expect(() => replaySnapshot(recording(), index)).toThrow('replay index');
  });
});
