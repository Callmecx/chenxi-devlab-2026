import { describe, expect, it } from 'vitest';
import { createDominionRuntime, MAX_COMMANDS, MAX_TICKS, type DominionRuntime } from './runtime';
import { assertDominionInvariants } from './invariants';
import { validateRecording, replayFrame, MAX_RECORDING_BYTES } from './recording';
import { createFixture } from './fixtures';
import { findPath } from './planner';
import type { DominionSnapshot, Lane } from './types';

function advanceUntil(runtime: DominionRuntime, predicate: (snapshot: DominionSnapshot) => boolean, limit = MAX_TICKS) {
  for (let i = 0; i < limit && !predicate(runtime.snapshot); i++) {
    const result = runtime.dispatch({ type: 'step' });
    expect(result.accepted, result.message).toBe(true);
    expect(assertDominionInvariants(runtime.snapshot)).toEqual([]);
  }
  expect(predicate(runtime.snapshot), JSON.stringify(runtime.snapshot.missions)).toBe(true);
}

describe('V4 independent adversarial boundaries', () => {
  it('safely closes a running session at the history boundary and exports a strictly replayable last frame', () => {
    const runtime = createDominionRuntime({ scenario: 'supply', sessionId: 'budget-regression' });
    expect(runtime.dispatch({ type: 'start' }, 'start').accepted).toBe(true);
    for (let i = 1; i < MAX_COMMANDS - 1; i++) {
      expect(runtime.dispatch({ type: 'set-priority', missionId: 'mission-1', priority: i % 10 }, `priority-${i}`).accepted).toBe(true);
    }
    expect(runtime.snapshot.status).toBe('running');
    const boundary = runtime.dispatch({ type: 'step' }, 'boundary');
    expect(boundary.accepted).toBe(false);
    expect(runtime.snapshot.status).toBe('closed');
    const final = runtime.exportRecording();
    expect(final.commands).toHaveLength(MAX_COMMANDS);
    expect(final.commands.at(-1)).toMatchObject({ id: 'boundary', accepted: false, command: { type: 'step' } });
    expect(final.events.at(-1)?.type).toBe('session.history-budget');
    expect(final.final.missions[0].status).toBe('cancelled');
    expect(final.final.ships.every(ship => Object.values(ship.reserved).every(n => n === 0))).toBe(true);
    expect(assertDominionInvariants(final.final)).toEqual([]);
    for (const type of ['step', 'pause', 'resume', 'close-session'] as const) {
      expect(runtime.dispatch({ type }).accepted).toBe(false);
      expect(runtime.exportRecording()).toEqual(final);
    }
    const json = JSON.stringify(final);
    expect(new TextEncoder().encode(json).length).toBeLessThan(MAX_RECORDING_BYTES);
    const validated = validateRecording(json);
    expect(replayFrame(validated, validated.frames.length - 1).snapshot).toEqual(final.final);
    expect(runtime.exportRecording()).toEqual(final);
  }, 30_000);

  it('rescues a ship stopped halfway through loading, then explicitly retries without duplicating its cargo', () => {
    const runtime = createDominionRuntime({ scenario: 'supply', sessionId: 'half-load-recovery' });
    advanceUntil(runtime, state => state.ships.some(ship => ship.action?.kind === 'load' && ship.action.elapsed === 1));
    const loading = runtime.snapshot.ships.find(ship => ship.action?.kind === 'load')!;
    expect(loading.cargo.supplies).toBe(0);
    expect(loading.reserved.supplies).toBe(2);
    expect(runtime.dispatch({ type: 'distress', shipId: loading.id }).accepted).toBe(true);
    advanceUntil(runtime, state => state.missions[0].status === 'failed');
    const failed = runtime.snapshot;
    expect(failed.ships.find(ship => ship.id === loading.id)!.action).toEqual(loading.action);
    expect(failed.ships.find(ship => ship.id === loading.id)!.reserved).toEqual(loading.reserved);
    expect(runtime.dispatch({ type: 'rescue', shipId: loading.id }).accepted).toBe(true);
    advanceUntil(runtime, state => state.missions.find(mission => mission.kind === 'rescue')?.status === 'completed');
    expect(runtime.snapshot.missions[0].status).toBe('failed');
    expect(runtime.snapshot.ships.find(ship => ship.id === loading.id)!.action).toEqual(loading.action);
    expect(runtime.dispatch({ type: 'retry-mission', missionId: 'mission-1' }).accepted).toBe(true);
    advanceUntil(runtime, state => state.missions[0].status === 'completed');
    const final = runtime.snapshot;
    expect(final.missions[0].attempts.map(attempt => attempt.outcome)).toEqual(['failed', 'completed']);
    expect(final.missions[0].delivered.supplies).toBe(2);
    expect(runtime.events.filter(event => event.type === 'cargo.loaded' && event.missionId === 'mission-1')).toHaveLength(1);
    expect(runtime.events.filter(event => event.type === 'cargo.delivered' && event.missionId === 'mission-1')).toHaveLength(1);
    expect(final.ledger.generated.energy).toBe(0);
    const validated = validateRecording(runtime.exportRecording());
    expect(replayFrame(validated, validated.frames.length - 1).snapshot.missions).toEqual(final.missions);
  });

  it('keeps completed mission facts immutable while a new mission runs and rejected retries are replayed', () => {
    const runtime = createDominionRuntime({ scenario: 'supply', sessionId: 'terminal-facts' });
    advanceUntil(runtime, state => state.missions[0].status === 'completed');
    const completed = runtime.snapshot.missions[0];
    expect(runtime.dispatch({ type: 'retry-mission', missionId: completed.id }).accepted).toBe(false);
    expect(runtime.dispatch({ type: 'cancel-mission', missionId: completed.id }).accepted).toBe(false);
    expect(runtime.dispatch({ type: 'add-mission', kind: 'supply', quantity: 1 }).accepted).toBe(true);
    advanceUntil(runtime, state => state.missions[1].status === 'completed');
    expect(runtime.snapshot.missions[0]).toEqual(completed);
    expect(runtime.snapshot.missions[1].delivered.supplies).toBe(1);
    expect(validateRecording(runtime.exportRecording()).recording.final.missions[0]).toEqual(completed);
  });

  it('rejects a conflicting command body for an already committed id without falsely acknowledging the new command', () => {
    const runtime = createDominionRuntime({ scenario: 'supply' });
    expect(runtime.dispatch({ type: 'set-lane', laneId: 'port-forge', open: false }, 'intent-1').accepted).toBe(true);
    const before = runtime.exportRecording();
    const conflicting = runtime.dispatch({ type: 'set-lane', laneId: 'port-forge', open: true }, 'intent-1');
    expect(conflicting).toMatchObject({ accepted: false, duplicate: true });
    expect(runtime.exportRecording()).toEqual(before);
  });

  it('minimizes the declared balanced path score without an undocumented per-hop penalty', () => {
    const world = createFixture('supply', 4217, 'declared-cost');
    const edge = (id: string, from: string, to: string, energy = 0, risk = 0): Lane => ({ id, from, to, energy, risk, ticks: 1, capacity: 1, open: true, damaged: false, roles: ['transport', 'survey', 'repair'] });
    world.lanes = [edge('a', 'port', 'forge'), edge('b', 'forge', 'gate'), edge('c', 'gate', 'beacon'), edge('d', 'beacon', 'ice'), edge('direct', 'port', 'ice', 1, 1)];
    const path = findPath(world, world.ships.find(ship => ship.id === 'transport-a')!, 'port', 'ice', 'balanced');
    expect(path?.lanes).toEqual(['a', 'b', 'c', 'd']);
    expect(path?.score).toBe(12);
  });
});
