import type { OrbitBranch, OrbitComparison, OrbitSnapshot, OrbitStrategy } from './types';
import { createOrbitRuntime } from './runtime';
import { assertOrbitInvariants } from './invariants';
import { sourceKey, validateOrbitSnapshot } from './recording';

/** Two isolated simulations share the same physical fork and future fault schedule. */
export function compareOrbit(snapshot: OrbitSnapshot, forkSeq: number): OrbitComparison {
  const source = validateOrbitSnapshot(snapshot);
  if (!Number.isSafeInteger(forkSeq) || forkSeq < 0 || forkSeq > 512) throw new Error('Invalid fork sequence');
  const key = sourceKey(source);
  function branch(strategy: OrbitStrategy): OrbitBranch {
    const input = validateOrbitSnapshot(source); input.strategy = strategy; input.worldVersion++;
    for (const carrier of input.carriers) { carrier.route = []; carrier.planVersion = 0; if (carrier.status === 'failed') carrier.status = carrier.transit ? 'moving' : 'idle'; }
    if (!['completed', 'cancelled'].includes(input.status)) { input.status = 'paused'; input.failureCode = null; }
    const runtime = createOrbitRuntime({ snapshot: input });
    runtime.resume();
    for (let step = 0; step < 241 && runtime.snapshot.status === 'running'; step++) runtime.step();
    const result = runtime.snapshot;
    return {
      strategy, parentRunId: source.runId, forkSeq, sourceKey: key, snapshot: result,
      ticks: result.simTick - source.simTick,
      energyUsed: source.carriers.reduce((sum, c) => sum + c.energy, 0) - result.carriers.reduce((sum, c) => sum + c.energy, 0),
      waitTicks: result.carriers.reduce((sum, c) => sum + c.totalWait, 0) - source.carriers.reduce((sum, c) => sum + c.totalWait, 0),
      violations: assertOrbitInvariants(result),
      trace: runtime.events.filter(e => e.type === 'carrier.departed').map(e => ({ tick: e.simTick, carrierId: String(e.payload.carrierId), laneId: String(e.payload.laneId) })),
    };
  }
  return { sourceKey: key, time: branch('time'), energy: branch('energy') };
}
