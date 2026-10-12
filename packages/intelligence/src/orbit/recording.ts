import type { OrbitEvent, OrbitRecording, OrbitSnapshot } from './types';
import { assertOrbitInvariants } from './invariants';
import { ORBIT_PLANNER_VERSION, orbitTaskLabel } from './fixtures';
export const MAX_ORBIT_EVENTS = 512;
export const MAX_ORBIT_BYTES = 8 * 1024 * 1024;
export const MAX_ORBIT_NODES = 500_000;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const validatedRecords = new WeakSet<object>();
function freezeTree<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value); }
  return value;
}
function fail(message: string): never { throw new Error(`Invalid ORBIT recording: ${message}`); }
function plain(value: unknown, depth = 0, ancestors = new Set<object>(), budget = { n: 0 }): void {
  if (++budget.n > MAX_ORBIT_NODES || depth > 32) fail('structure limit');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('nonfinite number'); return; }
  if (typeof value === 'string') { if (value.length > 100_000) fail('string size'); return; }
  if (typeof value !== 'object' || ancestors.has(value)) fail('non-JSON/cycle');
  if (Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype) && Object.getPrototypeOf(value) !== null) fail('prototype');
  ancestors.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(k => typeof k !== 'string')) fail('symbol');
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (!('value' in descriptor) || !descriptor.enumerable || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('unsafe property');
    if (Array.isArray(value) && (!/^\d+$/.test(key) || Number(key) >= value.length || String(Number(key)) !== key)) fail('array property');
    plain(descriptor.value, depth + 1, ancestors, budget);
  }
  if (Array.isArray(value) && (value.length > 4096 || Object.keys(descriptors).length !== value.length + 1)) fail('array limit/sparse');
  ancestors.delete(value);
}
type Obj = Record<string, unknown>;
function obj(value: unknown, names: string[]): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object');
  const actual = Object.keys(value); if (actual.length !== names.length || names.some(n => !actual.includes(n))) fail('fields');
  return value as Obj;
}
function text(value: unknown, max = 2000) { if (typeof value !== 'string' || value.length > max) fail('text'); }
function id(value: unknown) { if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value)) fail('identifier'); }
function num(value: unknown, max = 1_000_000) { if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > max) fail('integer'); }
function en(value: unknown, values: string[]) { if (typeof value !== 'string' || !values.includes(value)) fail('enum'); }
function arr(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) fail('array'); return value; }
function bool(value: unknown) { if (typeof value !== 'boolean') fail('boolean'); }
function stamp(value: unknown) { text(value, 40); if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value))) fail('timestamp'); }
function checkSnapshot(input: unknown): asserts input is OrbitSnapshot {
  const s = obj(input, ['schemaVersion', 'plannerVersion', 'runId', 'seed', 'worldVersion', 'simTick', 'status', 'strategy', 'stations', 'lanes', 'carriers', 'task', 'message', 'failureCode', 'tools', 'actionIds', 'replans', 'faults', 'appliedFaults']);
  if (s.schemaVersion !== 3 || s.plannerVersion !== ORBIT_PLANNER_VERSION) fail('version');
  id(s.runId); num(s.seed, 2_147_483_647); num(s.worldVersion); num(s.simTick, 1000); num(s.replans, 1000);
  en(s.status, ['ready', 'running', 'paused', 'completed', 'failed', 'cancelled']); en(s.strategy, ['time', 'energy']); text(s.message); if (s.failureCode !== null) id(s.failureCode);
  for (const value of arr(s.stations, 7)) {
    const v = obj(value, ['id', 'label', 'kind', 'position', 'stock', 'reserved', 'dockCapacity']); id(v.id); text(v.label, 150); en(v.kind, ['port', 'resource', 'relay', 'target']);
    if (arr(v.position, 3).length !== 3 || (v.position as unknown[]).some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1000)) fail('position');
    num(v.stock, 1000); num(v.reserved, 1000); num(v.dockCapacity, 10);
  }
  for (const value of arr(s.lanes, 32)) {
    const v = obj(value, ['id', 'from', 'to', 'bidirectional', 'open', 'distance', 'ticks', 'energy', 'capacity']); id(v.id); id(v.from); id(v.to); bool(v.bidirectional); bool(v.open);
    if (typeof v.distance !== 'number' || !Number.isFinite(v.distance) || v.distance < 0 || v.distance > 10000) fail('distance'); num(v.ticks, 100); num(v.energy, 10000); num(v.capacity, 10);
  }
  for (const value of arr(s.carriers, 2)) {
    const v = obj(value, ['id', 'label', 'capacity', 'energy', 'initialEnergy', 'nodeId', 'transit', 'cargo', 'reserved', 'sourceId', 'route', 'planVersion', 'status', 'delivered', 'waitTicks', 'totalWait', 'priority']);
    id(v.id); text(v.label, 150); id(v.nodeId); if (v.sourceId !== null) id(v.sourceId);
    for (const key of ['capacity', 'energy', 'initialEnergy', 'cargo', 'reserved', 'planVersion', 'delivered', 'waitTicks', 'totalWait', 'priority']) num(v[key]);
    for (const lane of arr(v.route, 32)) id(lane);
    en(v.status, ['idle', 'moving', 'loading', 'delivering', 'waiting', 'done', 'failed']);
    if (v.transit !== null) { const t = obj(v.transit, ['laneId', 'from', 'to', 'elapsed', 'duration']); id(t.laneId); id(t.from); id(t.to); num(t.elapsed, 100); num(t.duration, 100); }
  }
  const task = obj(s.task, ['id', 'label', 'quantity', 'targetId', 'delivered', 'initialStock', 'deadline']); id(task.id); text(task.label); id(task.targetId);
  for (const key of ['quantity', 'delivered', 'initialStock', 'deadline']) num(task[key], 1000);
  for (const value of arr(s.tools, 64)) {
    const t = obj(value, ['id', 'label', 'tool', 'status', 'input', 'output', 'sources', 'durationMs']); id(t.id); text(t.label, 150); id(t.tool); en(t.status, ['pending', 'running', 'completed', 'failed']);
    if (!t.input || typeof t.input !== 'object' || Array.isArray(t.input)) fail('tool input');
    for (const source of arr(t.sources, 32)) text(source, 200);
    if (typeof t.durationMs !== 'number' || !Number.isFinite(t.durationMs) || t.durationMs < 0) fail('duration');
  }
  const actions = arr(s.actionIds, 1024); for (const action of actions) id(action);
  const faults = arr(s.faults, 32);
  for (const value of faults) { const f = obj(value, ['tick', 'laneId', 'open']); num(f.tick, 1000); id(f.laneId); bool(f.open); if (!(s.lanes as Obj[]).some(l => l.id === f.laneId)) fail('fault lane'); }
  const applied = arr(s.appliedFaults, 32); for (const index of applied) { num(index, Math.max(0, faults.length - 1)); if (!faults[Number(index)] || Number((faults[Number(index)] as Obj).tick) > Number(s.simTick)) fail('future fault'); }
  if (new Set(applied).size !== applied.length) fail('duplicate fault');
  const errors = assertOrbitInvariants(input as OrbitSnapshot); if (errors.length) fail(errors.join(','));
}
export function validateOrbitSnapshot(input: unknown): OrbitSnapshot { plain(input); checkSnapshot(input); return clone(input); }
const eventTypes = ['run.ready', 'run.forked', 'run.started', 'run.failed', 'run.completed', 'run.paused', 'run.resumed', 'run.cancelled', 'run.retried', 'command.rejected', 'world.fault-applied', 'world.lane-changed', 'strategy.changed', 'priority.changed', 'target.changed', 'resource.reserved', 'cargo.loaded', 'cargo.delivered', 'carrier.departed', 'carrier.progressed', 'carrier.arrived', 'carrier.failed', 'carrier.waiting', 'plan.created', 'tick.completed'];
const actionTypes: Record<string, string> = { 'resource.reserved': 'reserve', 'cargo.loaded': 'load', 'cargo.delivered': 'deliver', 'carrier.departed': 'enter-lane', 'carrier.arrived': 'arrive', 'run.cancelled': 'cancel' };
const worldTypes = ['world.fault-applied', 'world.lane-changed', 'strategy.changed', 'priority.changed', 'target.changed'];
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
/** Validate physical transitions, rather than trusting individually plausible snapshots. */
function checkTransition(previous: OrbitSnapshot, event: OrbitEvent, lastActions: Map<string, number>) {
  const current = event.snapshot, payload = event.payload, expected = clone(previous);
  if (!eventTypes.includes(event.type)) fail('event type');
  const statuses: Record<string, [string[], string]> = { 'run.started': [['ready'], 'running'], 'run.paused': [['running'], 'paused'], 'run.resumed': [['paused'], 'running'], 'run.retried': [['failed'], 'running'], 'run.completed': [['running'], 'completed'], 'run.failed': [['ready', 'running', 'paused', 'failed'], 'failed'], 'run.cancelled': [['ready', 'running', 'paused', 'failed'], 'cancelled'] };
  const transition = statuses[event.type];
  if (transition ? !transition[0].includes(previous.status) || current.status !== transition[1] : current.status !== previous.status) fail('status history');
  if (['completed', 'cancelled'].includes(previous.status) && !['run.forked', 'command.rejected'].includes(event.type)) fail('terminal history');
  if (current.simTick > previous.simTick + 1 || current.simTick > previous.simTick && previous.status !== 'running') fail('tick history');
  if (!same(current.faults, previous.faults) || current.replans < previous.replans) fail('planning history');
  const expectedAction = actionTypes[event.type];
  if (expectedAction) {
    const nextId = `${current.runId}:action:${previous.actionIds.length + 1}`;
    if (payload.action !== expectedAction || payload.actionId !== nextId || !same(current.actionIds, [...previous.actionIds, nextId])) fail('action history');
  } else if (!same(current.actionIds, previous.actionIds)) fail('unrecorded action');
  if (worldTypes.includes(event.type)) {
    if (current.worldVersion !== previous.worldVersion + 1) fail('world version history');
    if (event.type.startsWith('world.')) {
      const lane = expected.lanes.find(l => l.id === payload.laneId); if (!lane || typeof payload.open !== 'boolean') fail('lane change'); lane.open = payload.open;
      if (event.type === 'world.fault-applied') {
        const index = Number(payload.faultIndex), fault = previous.faults[index];
        if (!Number.isInteger(index) || !fault || fault.tick > current.simTick || fault.laneId !== payload.laneId || fault.open !== payload.open || previous.appliedFaults.includes(index)) fail('fault history');
        expected.appliedFaults.push(index);
      }
    }
    if (event.type === 'strategy.changed') { if (!['time', 'energy'].includes(String(payload.strategy))) fail('strategy change'); expected.strategy = payload.strategy as OrbitSnapshot['strategy']; }
    if (event.type === 'priority.changed') { const carrier = expected.carriers.find(c => c.id === payload.carrierId); if (!carrier || !Number.isInteger(payload.priority) || Number(payload.priority) < 0 || Number(payload.priority) > 9) fail('priority change'); carrier.priority = Number(payload.priority); }
    if (event.type === 'target.changed') { const target = expected.stations.find(s => s.id === payload.targetId); if (previous.task.delivered !== 0 || !target) fail('retarget committed delivery'); expected.task.targetId = String(payload.targetId); expected.task.label = orbitTaskLabel(target.label, expected.task.quantity); }
  } else if (current.worldVersion !== previous.worldVersion) fail('unrecorded world change');
  const carrier = expected.carriers.find(c => c.id === payload.carrierId);
  const carrierAction = ['resource.reserved', 'cargo.loaded', 'cargo.delivered', 'carrier.departed', 'carrier.progressed', 'carrier.arrived', 'carrier.failed', 'carrier.waiting', 'plan.created'].includes(event.type);
  if (carrierAction) {
    if (!carrier || current.simTick <= (lastActions.get(carrier.id) ?? previous.simTick - 1) || current.status !== 'running') fail('carrier action ordering');
    lastActions.set(carrier.id, current.simTick);
  }
  if (carrier && ['resource.reserved', 'cargo.loaded', 'cargo.delivered', 'carrier.departed', 'carrier.arrived', 'plan.created'].includes(event.type)) carrier.waitTicks = 0;
  if (event.type === 'carrier.waiting') { if (!carrier) fail('wait carrier'); carrier.waitTicks++; carrier.totalWait++; if (payload.ticks !== carrier.waitTicks) fail('wait history'); }
  if (event.type === 'run.retried') for (const c of expected.carriers) c.waitTicks = 0;
  if (event.type === 'resource.reserved') {
    const station = expected.stations.find(s => s.id === payload.stationId), quantity = Number(payload.quantity);
    if (!carrier || carrier.transit || carrier.cargo || carrier.reserved || !station || station.kind !== 'resource' || !Number.isInteger(quantity) || quantity <= 0 || quantity > carrier.capacity || quantity > station.stock - station.reserved) fail('reservation transition');
    station.reserved += quantity; carrier.reserved = quantity; carrier.sourceId = station.id;
  }
  if (event.type === 'cargo.loaded') {
    const station = expected.stations.find(s => s.id === payload.stationId), quantity = Number(payload.quantity);
    if (!carrier || carrier.transit || carrier.cargo || !station || carrier.nodeId !== station.id || carrier.sourceId !== station.id || quantity !== carrier.reserved || quantity <= 0) fail('loading transition');
    station.stock -= quantity; station.reserved -= quantity; carrier.reserved = 0; carrier.cargo = quantity;
  }
  if (event.type === 'cargo.delivered') {
    if (!carrier || carrier.transit || carrier.nodeId !== previous.task.targetId || payload.targetId !== previous.task.targetId || payload.quantity !== carrier.cargo || carrier.cargo <= 0) fail('delivery transition');
    expected.task.delivered += carrier.cargo; carrier.delivered += carrier.cargo; carrier.cargo = 0; carrier.sourceId = null;
  }
  if (event.type === 'carrier.departed') {
    const lane = previous.lanes.find(l => l.id === payload.laneId);
    const to = lane?.from === carrier?.nodeId ? lane?.to : lane?.bidirectional && lane.to === carrier?.nodeId ? lane.from : null;
    if (!carrier || carrier.transit || !lane?.open || !to || carrier.route[0] !== lane.id || carrier.planVersion !== previous.worldVersion || payload.from !== carrier.nodeId || payload.to !== to || payload.duration !== lane.ticks || payload.energy !== lane.energy) fail('departure transition');
    carrier.energy -= lane.energy; carrier.transit = { laneId: lane.id, from: carrier.nodeId, to, elapsed: 0, duration: lane.ticks };
  }
  if (event.type === 'carrier.progressed' || event.type === 'carrier.arrived') {
    if (!carrier?.transit || carrier.transit.laneId !== payload.laneId) fail('transit history');
    const transit = carrier.transit;
    if (event.type === 'carrier.progressed') { transit.elapsed++; if (transit.elapsed >= transit.duration || payload.elapsed !== transit.elapsed || payload.duration !== transit.duration) fail('transit progress'); }
    else { if (transit.elapsed + 1 !== transit.duration || payload.stationId !== transit.to) fail('arrival history'); carrier.nodeId = transit.to; carrier.transit = null; }
  }
  if (event.type === 'run.cancelled') for (const c of expected.carriers) {
    if (c.reserved) { const station = expected.stations.find(s => s.id === c.sourceId)!; station.reserved -= c.reserved; c.reserved = 0; if (!c.cargo) c.sourceId = null; }
  }
  const physical = (s: OrbitSnapshot) => ({
    stations: s.stations,
    lanes: s.lanes,
    task: s.task,
    carriers: s.carriers.map(c => ({ id: c.id, label: c.label, capacity: c.capacity, initialEnergy: c.initialEnergy, nodeId: c.nodeId, transit: c.transit, energy: c.energy, cargo: c.cargo, reserved: c.reserved, sourceId: c.sourceId, delivered: c.delivered, priority: c.priority, waitTicks: c.waitTicks, totalWait: c.totalWait })),
    strategy: s.strategy, faults: s.faults, appliedFaults: s.appliedFaults,
  });
  if (!same(physical(current), physical(expected))) fail('physical history');
}
export function validateOrbitRecording(input: unknown): OrbitRecording {
  if (input && typeof input === 'object' && validatedRecords.has(input)) return input as OrbitRecording;
  let value = input;
  if (typeof input === 'string') { if (input.length > MAX_ORBIT_BYTES) fail('size'); try { value = JSON.parse(input); } catch { fail('JSON'); } }
  plain(value); const serialized = JSON.stringify(value); if (new TextEncoder().encode(serialized).byteLength > MAX_ORBIT_BYTES) fail('byte size');
  const record = obj(value, ['schemaVersion', 'plannerVersion', 'seed', 'initial', 'events']);
  if (record.schemaVersion !== 3 || record.plannerVersion !== ORBIT_PLANNER_VERSION) fail('version');
  num(record.seed, 2_147_483_647); checkSnapshot(record.initial); const initial = record.initial;
  if (record.seed !== initial.seed) fail('seed');
  const events = arr(record.events, MAX_ORBIT_EVENTS); if (!events.length) fail('empty events');
  let previous = initial, time = -Infinity;
  const lastActions = new Map(initial.carriers.map(c => [c.id, initial.simTick]));
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    const event = obj(events[index], ['runId', 'eventId', 'seq', 'type', 'mode', 'simTick', 'wallTime', 'worldVersion', 'payload', 'snapshot']);
    id(event.runId); id(event.eventId); id(event.type); stamp(event.wallTime); num(event.seq); num(event.simTick); num(event.worldVersion);
    if (event.runId !== initial.runId || event.seq !== index + 1 || event.mode !== 'local-simulation' || ids.has(String(event.eventId))) fail('event identity');
    ids.add(String(event.eventId));
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) fail('payload');
    checkSnapshot(event.snapshot); const current = event.snapshot;
    if (current.runId !== initial.runId || current.seed !== initial.seed || event.simTick !== current.simTick || event.worldVersion !== current.worldVersion || current.simTick < previous.simTick || current.worldVersion < previous.worldVersion || Date.parse(String(event.wallTime)) < time) fail('event state/order');
    if (current.task.initialStock !== initial.task.initialStock || current.task.quantity !== initial.task.quantity || current.task.delivered < previous.task.delivered) fail('committed task changed');
    if (previous.actionIds.some((id, i) => current.actionIds[i] !== id)) fail('committed action removed');
    for (const carrier of current.carriers) {
      const before = previous.carriers.find(c => c.id === carrier.id); if (!before || carrier.initialEnergy !== before.initialEnergy || carrier.capacity !== before.capacity || carrier.energy > before.energy || carrier.delivered < before.delivered) fail('carrier history');
    }
    for (const station of current.stations) { const before = previous.stations.find(s => s.id === station.id); if (!before || station.stock > before.stock || station.dockCapacity !== before.dockCapacity) fail('station history'); }
    for (const lane of current.lanes) { const before = previous.lanes.find(l => l.id === lane.id); if (!before || lane.from !== before.from || lane.to !== before.to || lane.ticks !== before.ticks || lane.energy !== before.energy || lane.bidirectional !== before.bidirectional || lane.capacity !== before.capacity) fail('graph history'); }
    checkTransition(previous, event as unknown as OrbitEvent, lastActions);
    previous = current; time = Date.parse(String(event.wallTime));
  }
  const result = freezeTree(JSON.parse(serialized) as OrbitRecording); validatedRecords.add(result); return result;
}
/** Snapshot projection only: imports never dispatch a runtime, network request or timer. */
export function replayOrbit(recording: unknown, index: number): OrbitSnapshot {
  const record = validateOrbitRecording(recording); if (!Number.isInteger(index) || index < -1 || index >= record.events.length) fail('index');
  return clone(index === -1 ? record.initial : record.events[index]!.snapshot);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
/** All execution facts, excluding presentation messages, wall durations and pause state. */
export function sourceKey(snapshot: OrbitSnapshot): string {
  const checked = validateOrbitSnapshot(snapshot);
  const { message: _message, tools: _tools, ...facts } = checked;
  const value = canonical({ ...facts, status: ['running', 'paused'].includes(checked.status) ? 'runnable' : checked.status }); let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b ^ value.charCodeAt(i), 2246822519); }
  return `orbit3-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}-${value.length}`;
}
