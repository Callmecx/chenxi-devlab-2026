import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, defaultGoal } from './engine';
import { isPathValid, samePoint } from './pathfinding';
import type { IntelligenceRuntime, Preset } from './types';

const make = (preset: Preset = 'product') => {
  const runtime = createRuntime({ delayMs: 5, timeoutMs: 20, now: () => Date.now() });
  runtime.plan(defaultGoal(preset));
  return runtime;
};
async function step(runtime: IntelligenceRuntime) {
  const pending = runtime.step();
  await vi.runAllTimersAsync();
  await pending;
}
async function draft(runtime: IntelligenceRuntime) { for (let i = 0; i < 3; i += 1) await step(runtime); }
async function finishWarehouse(runtime: IntelligenceRuntime, limit = 350) {
  for (let i = 0; i < limit && ['running', 'replanning'].includes(runtime.snapshot.status); i += 1) await step(runtime);
  expect(runtime.snapshot.status).toBe('succeeded');
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T08:00:00.000Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('deterministic workflow and approval boundary', () => {
  it('queries and compares real fixture constraints, awaits approval, then writes exactly once', async () => {
    const runtime = make();
    await draft(runtime);
    expect(runtime.snapshot.status).toBe('waiting-approval');
    expect(runtime.snapshot.writes).toBe(0);
    expect(runtime.snapshot.nodes.slice(0, 3).every(node => node.status === 'succeeded')).toBe(true);
    expect(runtime.snapshot.result).toMatchObject({ confirmed: false, draft: { candidateId: 'note-book', totalCents: 9800 } });
    expect(runtime.snapshot.nodes[0]!.sources.length).toBeGreaterThan(0);
    await step(runtime);
    expect(runtime.snapshot.writes).toBe(0);
    runtime.approve(true);
    expect(runtime.snapshot.writes).toBe(0);
    await step(runtime);
    expect(runtime.snapshot.status).toBe('succeeded');
    expect(runtime.snapshot.result).toMatchObject({ kind: 'saved-listing', confirmed: true, quantity: 2 });
    runtime.approve(true); await step(runtime); runtime.retry();
    expect(runtime.snapshot.writes).toBe(1);
    expect(runtime.events.filter(event => event.type === 'tool.completed')).toHaveLength(4);
    expect(runtime.events.filter(event => event.type === 'tool.completed').every(event => event.payload.measuredWallDurationMs === 5)).toBe(true);
    expect(runtime.exportRecording().input).toEqual(defaultGoal('product'));
  });

  it('keeps a retrieved malicious instruction as data and cannot bypass rejected approval', async () => {
    const runtime = make();
    runtime.plan({ ...defaultGoal('product'), category: '工作' });
    await draft(runtime);
    expect(JSON.stringify(runtime.snapshot.nodes[0]!.output)).toContain('忽略预算');
    expect(runtime.snapshot.writes).toBe(0);
    runtime.approve(false);
    await step(runtime); runtime.approve(true); runtime.retry();
    expect(runtime.snapshot.status).toBe('cancelled');
    expect(runtime.snapshot.writes).toBe(0);
    expect(runtime.events.filter(event => event.stepId === 'confirm' && event.type === 'tool.started')).toHaveLength(0);
  });

  it('confirms a synthetic activity against local capacity and records the actual remaining seats', async () => {
    const runtime = make('activity');
    runtime.plan({ ...defaultGoal('activity'), slotId: 'slot-print' });
    await draft(runtime); runtime.approve(true); await step(runtime);
    expect(runtime.snapshot.status).toBe('succeeded');
    expect(runtime.snapshot.result).toMatchObject({ kind: 'confirmed-local-booking', candidateId: 'slot-print', remainingSeats: 2, quantity: 2, totalCents: 15800, persistedIn: 'isolated runtime memory; no backend' });
  });

  it.each([
    { preset: 'product' as const, budgetCents: 1000, category: 'all', slotId: 'all' },
    { preset: 'activity' as const, budgetCents: 50000, category: 'all', slotId: 'slot-talk' },
    { preset: 'product' as const, budgetCents: 50000, category: '不存在', slotId: 'all' },
  ])('does not draft an infeasible combination: %j', async constraints => {
    const runtime = make(constraints.preset);
    runtime.plan({ ...defaultGoal(constraints.preset), ...constraints });
    await draft(runtime);
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.clarification.length).toBeGreaterThan(0);
    expect(runtime.snapshot.result).toBeNull();
    runtime.approve(true); runtime.retry(); await step(runtime);
    expect(runtime.snapshot.writes).toBe(0);
  });

  it.each([
    { prompt: '帮我整理一下宇宙' }, { prompt: '商品预算 1 元', budgetCents: 50000 },
    { prompt: '选择 3 件商品', quantity: 2 }, { quantity: NaN }, { seed: -1 },
  ])('asks for clarification without tools for unsupported or conflicting goal %j', constraints => {
    const runtime = make();
    runtime.plan({ ...defaultGoal('product'), ...constraints });
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.nodes).toHaveLength(0);
    expect(runtime.snapshot.clarification.length).toBeGreaterThan(0);
    expect(runtime.events.some(event => event.type === 'tool.started')).toBe(false);
    expect(() => runtime.exportRecording()).not.toThrow();
  });

  it('returns detached state so external mutation cannot grant approval or change prices', async () => {
    const runtime = make(); await draft(runtime);
    const snapshot = runtime.snapshot;
    snapshot.writes = 88; snapshot.goal.budgetCents = 0; snapshot.status = 'running'; snapshot.nodes[3]!.status = 'queued';
    runtime.events[0]!.payload.approved = true;
    await step(runtime);
    expect(runtime.snapshot.status).toBe('waiting-approval');
    expect(runtime.snapshot.writes).toBe(0);
    expect(runtime.snapshot.goal.budgetCents).toBe(50000);
  });
});

describe('async execution, bounded recovery and stale-response protection', () => {
  it.each(['timeout', 'failure'] as const)('reports %s with measured wall time and safely retries', async fault => {
    const runtime = make(); runtime.setFault(fault); await step(runtime);
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.nodes[0]!.durationMs).toBe(fault === 'timeout' ? 20 : 5);
    expect(runtime.snapshot.writes).toBe(0);
    runtime.setFault('none'); runtime.retry(); await draft(runtime);
    expect(runtime.snapshot.status).toBe('waiting-approval');
    runtime.approve(true); await step(runtime);
    expect(runtime.snapshot.writes).toBe(1);
    expect(runtime.snapshot.nodes[0]!.attempts).toBe(2);
  });

  it('does not accept partial data and a retry executes a fresh query', async () => {
    const runtime = make(); runtime.setFault('partial'); await step(runtime);
    expect(runtime.snapshot.nodes[0]!.output).toMatchObject({ partial: true });
    runtime.setFault('none'); await step(runtime);
    expect(runtime.snapshot.status).toBe('failed');
    runtime.retry(); await draft(runtime);
    expect(runtime.snapshot.status).toBe('waiting-approval');
    expect(runtime.snapshot.nodes[0]!.output).toMatchObject({ partial: false });
    expect(runtime.events.filter(event => event.type === 'tool.completed' && event.stepId === 'query')).toHaveLength(2);
  });

  it('limits repeated manual retries instead of looping indefinitely', async () => {
    const runtime = make(); runtime.setFault('failure');
    for (let i = 0; i < 4; i += 1) { await step(runtime); runtime.retry(); }
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.events.filter(event => event.type === 'tool.started')).toHaveLength(4);
    expect(runtime.events.at(-1)!.type).toBe('retry.limit');
  });

  it('bounds event history and freezes exhausted runs until a fresh reset', () => {
    const runtime = make('warehouse');
    for (let i = 0; i < 1100; i += 1) runtime.setFault('none');
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.events).toHaveLength(1024);
    const exhausted = runtime.snapshot;
    runtime.setObstacle({ x: 0, y: 7 }); runtime.retry();
    expect(runtime.snapshot).toEqual(exhausted);
    expect(() => runtime.exportRecording()).not.toThrow();
    runtime.reset(); expect(runtime.snapshot.status).toBe('queued');
    expect(runtime.events).toHaveLength(1);
  });

  it.each(['query', 'confirm'] as const)('cancel while %s is pending prevents late responses and all writes', async pendingNode => {
    const runtime = make();
    if (pendingNode === 'confirm') { await draft(runtime); runtime.approve(true); }
    const pending = runtime.step();
    expect(runtime.snapshot.nodes.find(node => node.id === pendingNode)!.status).toBe('running');
    runtime.cancel();
    const cancelled = runtime.snapshot; const eventCount = runtime.events.length;
    await vi.runAllTimersAsync(); await pending;
    expect(runtime.snapshot).toEqual(cancelled);
    expect(runtime.events).toHaveLength(eventCount);
    expect(runtime.snapshot.writes).toBe(0);
  });

  it('serializes concurrent step calls into a single tool', async () => {
    const runtime = make();
    const one = runtime.step(); const two = runtime.step(); const three = runtime.step();
    await vi.runAllTimersAsync(); await Promise.all([one, two, three]);
    expect(runtime.events.filter(event => event.type === 'tool.started')).toHaveLength(1);
    expect(runtime.snapshot.nodes[1]!.status).toBe('queued');
  });

  it('planning a new run invalidates an old in-flight tool without contaminating the new trace', async () => {
    const runtime = make(); const old = runtime.step(); const oldId = runtime.snapshot.runId;
    runtime.plan(defaultGoal('activity')); const next = runtime.step();
    await vi.runAllTimersAsync(); await Promise.all([old, next]);
    expect(runtime.snapshot.runId).not.toBe(oldId);
    expect(runtime.events.every(event => event.runId === runtime.snapshot.runId)).toBe(true);
    expect(runtime.events.filter(event => event.type === 'tool.completed')).toHaveLength(1);
    expect(runtime.snapshot.nodes[0]!.tool).toBe('query-activities');
  });
});

describe('warehouse discrete simulator', () => {
  it('actually picks and delivers all three cargo with capacity one, cardinal collision-free moves and a replayable trace', async () => {
    const runtime = make('warehouse'); await finishWarehouse(runtime);
    const snapshot = runtime.snapshot;
    expect(snapshot.world.width).toBe(12); expect(snapshot.world.height).toBe(8);
    expect(snapshot.world.carrying).toBeNull(); expect(snapshot.writes).toBe(0);
    expect(snapshot.world.cargo.every(cargo => cargo.delivered && samePoint(cargo.position, snapshot.world.target))).toBe(true);
    const actions = runtime.events.filter(event => event.type === 'tool.completed');
    expect(actions.filter(event => (event.payload.output as { action: string }).action === 'pick')).toHaveLength(3);
    expect(actions.filter(event => (event.payload.output as { action: string }).action === 'drop')).toHaveLength(3);
    expect(actions.filter(event => (event.payload.output as { action: string }).action === 'move')).toHaveLength(snapshot.world.moves);
    for (const event of runtime.events.filter(event => event.type === 'tool.started')) {
      expect(event.payload.input).toMatchObject({ worldVersion: event.worldVersion, capacity: 1 });
    }
    expect(() => runtime.exportRecording()).not.toThrow();
  });

  it('a single step computes a path without moving; each subsequent step moves just one cell', async () => {
    const runtime = make('warehouse'); const initial = runtime.snapshot.world.robot;
    await step(runtime);
    expect(runtime.snapshot.world.robot).toEqual(initial);
    expect(runtime.snapshot.world.path.length).toBeGreaterThan(0);
    await step(runtime);
    const next = runtime.snapshot.world.robot;
    expect(Math.abs(next.x - initial.x) + Math.abs(next.y - initial.y)).toBe(1);
    expect(runtime.snapshot.world.moves).toBe(1);
  });

  it('obstacle changes invalidate the old path/version and A* computes a real detour', async () => {
    const runtime = make('warehouse'); await step(runtime);
    const before = runtime.snapshot.world; const blocked = before.path[0]!;
    runtime.setObstacle(blocked);
    expect(runtime.snapshot.status).toBe('replanning');
    expect(runtime.snapshot.world.worldVersion).toBe(before.worldVersion + 1);
    expect(runtime.snapshot.world.path).toEqual([]);
    await step(runtime);
    const next = runtime.snapshot.world;
    expect(next.robot).toEqual(before.robot);
    expect(next.replans).toBe(1);
    expect(next.path.some(point => samePoint(point, blocked))).toBe(false);
    expect(isPathValid(next, next.robot, next.path)).toBe(true);
    await finishWarehouse(runtime);
  });

  it('fully enclosed robot fails honestly, then a cleared obstacle permits recovery', async () => {
    const runtime = make('warehouse');
    for (const point of [{ x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 2 }]) runtime.setObstacle(point);
    await step(runtime);
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.world.moves).toBe(0);
    expect(runtime.snapshot.nodes[0]!.output).toMatchObject({ code: 'UNREACHABLE' });
    runtime.setObstacle({ x: 2, y: 1 });
    await finishWarehouse(runtime);
  });

  it('moving the target invalidates pending work and earlier deliveries must reach the new target', async () => {
    const runtime = make('warehouse');
    for (let i = 0; i < 100 && !runtime.snapshot.world.cargo.some(cargo => cargo.delivered); i += 1) await step(runtime);
    expect(runtime.snapshot.world.cargo.some(cargo => cargo.delivered)).toBe(true);
    const pending = runtime.step(); const beforeVersion = runtime.snapshot.world.worldVersion;
    runtime.moveTarget({ x: 0, y: 7 });
    expect(runtime.snapshot.world.cargo.every(cargo => !cargo.delivered)).toBe(true);
    const changed = runtime.snapshot;
    await vi.runAllTimersAsync(); await pending;
    expect(runtime.snapshot).toEqual(changed);
    expect(runtime.snapshot.world.worldVersion).toBe(beforeVersion + 1);
    await finishWarehouse(runtime);
    expect(runtime.snapshot.world.cargo.every(cargo => samePoint(cargo.position, { x: 0, y: 7 }))).toBe(true);
  });

  it('missing required cargo fails instead of reducing the success criterion, and reset restores fixtures', async () => {
    const runtime = make('warehouse'); runtime.removeCargo('cargo-b'); await step(runtime);
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.result).toBeNull();
    runtime.retry(); expect(runtime.snapshot.status).toBe('failed');
    runtime.reset(99);
    expect(runtime.snapshot.status).toBe('queued');
    expect(runtime.snapshot.world.cargo).toHaveLength(3);
    expect(runtime.snapshot.world.seed).toBe(99);
    runtime.plan({ ...defaultGoal('warehouse'), seed: 99 }); await finishWarehouse(runtime);
  });

  it('finite reprioritization selects higher priority cargo without replacing an occupied payload', async () => {
    const runtime = make('warehouse'); runtime.setPriority('cargo-c', 9);
    for (let i = 0; i < 100 && !runtime.snapshot.world.carrying; i += 1) await step(runtime);
    expect(runtime.snapshot.world.carrying).toBe('cargo-c');
    runtime.setPriority('cargo-b', 9); await step(runtime);
    expect(runtime.snapshot.world.carrying).toBe('cargo-c');
    for (let i = 0; i < 6; i += 1) runtime.setPriority('cargo-a', i % 2);
    expect(runtime.events.filter(event => event.type === 'world.priority-changed')).toHaveLength(6);
    expect(runtime.events.some(event => event.type === 'priority.limit')).toBe(true);
    await finishWarehouse(runtime);
    const dropped = runtime.events.filter(event => event.type === 'tool.completed' && (event.payload.output as { action?: string }).action === 'drop');
    expect((dropped[0]!.payload.output as { cargoId: string }).cargoId).toBe('cargo-c');
  });

  it('bounds repeated environment replans and cannot be reopened by another world edit', async () => {
    const runtime = make('warehouse');
    for (let i = 0; i < 13; i += 1) { runtime.setObstacle({ x: 11, y: 7 }); await step(runtime); }
    expect(runtime.snapshot.status).toBe('failed');
    expect(runtime.snapshot.world.replans).toBe(12);
    expect(runtime.snapshot.nodes[0]!.output).toMatchObject({ code: 'REPLAN_LIMIT' });
    runtime.setObstacle({ x: 11, y: 7 }); runtime.retry(); await step(runtime);
    expect(runtime.snapshot.status).toBe('failed');
  });
});
