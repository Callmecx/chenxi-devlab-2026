import type { Goal, LabSnapshot, Recording, RunEvent } from './types';

export const RECORDING_VERSION = '2.0.0-local.1';
export const MAX_RECORDING_EVENTS = 1024;
export const MAX_RECORDING_BYTES = 8 * 1024 * 1024;
const runStatuses = ['queued', 'planning', 'running', 'waiting-approval', 'replanning', 'succeeded', 'failed', 'cancelled'];
const nodeStatuses = ['queued', 'running', 'succeeded', 'failed', 'waiting-approval', 'cancelled'];
const modes = ['local-simulation', 'recorded-replay', 'server-model'];
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
type ObjectValue = Record<string, unknown>;

function fail(message: string): never { throw new Error(`Invalid recording: ${message}`); }
function object(value: unknown, label: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label);
  return value as ObjectValue;
}
function keys(value: ObjectValue, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('unexpected or missing fields');
}
function string(value: unknown, maximum = 2000): asserts value is string {
  if (typeof value !== 'string' || value.length > maximum) fail('string length/type');
}
function identifier(value: unknown) { string(value, 128); if (!/^[A-Za-z0-9_.:-]+$/.test(value)) fail('identifier'); }
function integer(value: unknown, min = 0, max = 1_000_000_000): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail('integer range');
}
function date(value: unknown) {
  string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('timestamp');
  if (new Date(value).toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) fail('nonexistent calendar date');
}
function array(value: unknown, maximum: number): unknown[] { if (!Array.isArray(value) || value.length > maximum) fail('array limit'); return value; }
function oneOf(value: unknown, options: string[]) { if (typeof value !== 'string' || !options.includes(value)) fail('enum'); }
function point(value: unknown, width: number, height: number) {
  const result = object(value, 'point'); keys(result, ['x', 'y']); integer(result.x, 0, width - 1); integer(result.y, 0, height - 1);
}
function sameGoal(a: unknown, b: Goal) {
  goal(a);
  return (Object.keys(b) as Array<keyof Goal>).every(key => a[key] === b[key]);
}
const pointKey = (value: unknown) => `${(value as { x: number }).x},${(value as { y: number }).y}`;

/** Reject accessors, prototypes, cycles, oversized trees and non-JSON values before cloning. */
function safeJson(value: unknown, depth = 0, ancestors = new Set<object>(), budget = { nodes: 0 }): void {
  if (++budget.nodes > 500_000 || depth > 24) fail('JSON complexity limit');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') { if (value.length > 12000) fail('JSON string limit'); return; }
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('non-finite JSON number'); return; }
  if (typeof value !== 'object') fail('non-JSON value');
  if (ancestors.has(value)) fail('cyclic JSON');
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('object prototype');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) fail('symbol key');
  if (Object.keys(descriptors).length > (Array.isArray(value) ? MAX_RECORDING_EVENTS + 1 : 100)) fail('object size');
  if (Array.isArray(value) && (value.length > MAX_RECORDING_EVENTS || Object.keys(descriptors).length !== value.length + 1 || Object.keys(descriptors).some(key => key !== 'length' && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)))) fail('sparse or augmented array');
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (forbiddenKeys.has(key) || !Object.hasOwn(descriptor, 'value')) fail('unsafe property');
    if (Array.isArray(value) && key === 'length') continue;
    if (!descriptor.enumerable) fail('non-enumerable JSON property');
    safeJson(descriptor.value, depth + 1, ancestors, budget);
  }
  ancestors.delete(value);
}

function goal(value: unknown): asserts value is Goal {
  const result = object(value, 'goal'); keys(result, ['preset', 'prompt', 'budgetCents', 'quantity', 'category', 'slotId', 'seed']);
  oneOf(result.preset, ['product', 'activity', 'warehouse']); string(result.prompt); string(result.category, 80); string(result.slotId, 80);
  integer(result.budgetCents); integer(result.quantity, 1, 20); integer(result.seed, 0, 2_147_483_647);
}

function snapshot(value: unknown, input: Goal, runId: string): asserts value is LabSnapshot {
  const result = object(value, 'snapshot'); keys(result, ['runId', 'status', 'goal', 'nodes', 'world', 'message', 'result', 'clarification', 'writes']);
  if (result.runId !== runId || !sameGoal(result.goal, input)) fail('snapshot run/input mismatch');
  oneOf(result.status, runStatuses); string(result.message); integer(result.writes, 0, 1000);
  array(result.clarification, 20).forEach(item => string(item, 500));
  const nodeIds = new Set<string>();
  for (const item of array(result.nodes, 64)) {
    const node = object(item, 'node'); keys(node, ['id', 'title', 'tool', 'status', 'input', 'output', 'sources', 'durationMs', 'attempts']);
    identifier(node.id); if (nodeIds.has(node.id as string)) fail('duplicate node'); nodeIds.add(node.id as string);
    string(node.title, 200); string(node.tool, 128); oneOf(node.status, nodeStatuses); object(node.input, 'tool input');
    array(node.sources, 32).forEach(source => string(source, 1000)); integer(node.attempts, 0, 100);
    if (node.durationMs !== null && (typeof node.durationMs !== 'number' || !Number.isFinite(node.durationMs) || node.durationMs < 0 || node.durationMs > 86_400_000)) fail('duration');
  }
  const world = object(result.world, 'world');
  keys(world, ['width', 'height', 'seed', 'worldVersion', 'obstacles', 'robot', 'target', 'cargo', 'carrying', 'path', 'moves', 'replans']);
  integer(world.width, 1, 64); integer(world.height, 1, 64); integer(world.worldVersion, 1); integer(world.moves); integer(world.replans, 0, 1000);
  if (world.seed !== input.seed) fail('world seed mismatch');
  point(world.robot, world.width, world.height); point(world.target, world.width, world.height);
  const obstacleKeys = new Set<string>();
  for (const item of array(world.obstacles, world.width * world.height)) {
    point(item, world.width, world.height); const key = pointKey(item);
    if (obstacleKeys.has(key)) fail('duplicate obstacle'); obstacleKeys.add(key);
  }
  if (obstacleKeys.has(pointKey(world.robot))) fail('robot inside obstacle');
  let previous = world.robot as { x: number; y: number };
  for (const item of array(world.path, world.width * world.height)) {
    point(item, world.width, world.height); const current = item as { x: number; y: number };
    if (Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y) !== 1 || obstacleKeys.has(pointKey(item))) fail('invalid path');
    previous = current;
  }
  const cargoIds = new Set<string>();
  for (const item of array(world.cargo, 32)) {
    const cargo = object(item, 'cargo'); keys(cargo, ['id', 'label', 'position', 'delivered', 'priority']); identifier(cargo.id); string(cargo.label, 200);
    if (cargoIds.has(cargo.id as string)) fail('duplicate cargo'); cargoIds.add(cargo.id as string);
    point(cargo.position, world.width, world.height); integer(cargo.priority, 0, 9);
    if (typeof cargo.delivered !== 'boolean') fail('delivered type');
    if (cargo.delivered && pointKey(cargo.position) !== pointKey(world.target)) fail('delivered cargo outside target');
    if (cargo.id === world.carrying && (cargo.delivered || pointKey(cargo.position) !== pointKey(world.robot))) fail('invalid carried cargo');
  }
  if (world.carrying !== null && (typeof world.carrying !== 'string' || !cargoIds.has(world.carrying))) fail('missing carried cargo');
}

/** A detached validated copy. Importing an event trace never evaluates its tool names or payloads. */
export function validateRecording(input: unknown): Recording {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > MAX_RECORDING_BYTES) fail('recording size');
    try { value = JSON.parse(input); } catch { fail('JSON syntax'); }
  }
  safeJson(value);
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_RECORDING_BYTES) fail('recording byte size');
  const record = object(value, 'root'); keys(record, ['schemaVersion', 'version', 'createdAt', 'source', 'input', 'seed', 'events']);
  if (record.schemaVersion !== 1) fail('schema version'); string(record.version, 64); if (!record.version) fail('empty version');
  date(record.createdAt); string(record.source, 200); goal(record.input); integer(record.seed, 0, 2_147_483_647);
  if (record.seed !== record.input.seed) fail('input seed mismatch');
  const events = array(record.events, MAX_RECORDING_EVENTS); if (!events.length) fail('empty events');
  const ids = new Set<string>(); let runId = ''; let previousTimestamp = -Infinity;
  for (let index = 0; index < events.length; index += 1) {
    const event = object(events[index], 'event');
    keys(event, ['schemaVersion', 'runId', 'eventId', 'seq', 'timestamp', 'sourceMode', 'type', 'worldVersion', 'payload', 'snapshot'], ['stepId', 'toolCallId', 'parentEventId']);
    if (event.schemaVersion !== 1 || event.seq !== index + 1) fail('event schema/sequence'); identifier(event.runId); identifier(event.eventId);
    if (!runId) runId = event.runId as string;
    if (event.runId !== runId || ids.has(event.eventId as string)) fail('event run/id mismatch');
    if (event.parentEventId !== undefined && (typeof event.parentEventId !== 'string' || !ids.has(event.parentEventId))) fail('event parent');
    ids.add(event.eventId as string); date(event.timestamp);
    const stamp = Date.parse(event.timestamp as string); if (stamp < previousTimestamp) fail('event timestamp order'); previousTimestamp = stamp;
    oneOf(event.sourceMode, modes); string(event.type, 128); if (!event.type) fail('empty event type');
    if (event.stepId !== undefined) identifier(event.stepId); if (event.toolCallId !== undefined) identifier(event.toolCallId);
    integer(event.worldVersion, 1); object(event.payload, 'event payload'); snapshot(event.snapshot, record.input, runId);
    if (event.worldVersion !== event.snapshot.world.worldVersion) fail('event world version');
  }
  return JSON.parse(serialized) as Recording;
}

export const parseRecording = validateRecording;

/** Pure projection: no runtime, storage, network, timers, evaluation or tool dispatch. */
export function replaySnapshot(input: Recording | unknown, index: number): LabSnapshot {
  const recording = validateRecording(input);
  if (!Number.isInteger(index) || index < 0 || index >= recording.events.length) fail('replay index');
  return recording.events[index]!.snapshot;
}

export function buildRecording(input: Goal, events: RunEvent[]): Recording {
  return validateRecording({ schemaVersion: 1, version: RECORDING_VERSION, createdAt: new Date().toISOString(), source: 'local-simulation', input, seed: input.seed, events });
}
