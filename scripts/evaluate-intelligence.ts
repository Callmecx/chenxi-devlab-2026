/** Run with Node 24: node scripts/evaluate-intelligence.ts
 * Uses the already installed Vite TS loader; no network, server listener or new dependencies.
 * Emits compact synthetic-data evidence, never snapshots, tokens or machine paths.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import type { IntelligenceRuntime, LabSnapshot, Point, Preset, World } from '../packages/intelligence/src/types';

const root = fileURLToPath(new URL('../', import.meta.url));
const loader = await createServer({ configFile: false, root, appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
const engine = await loader.ssrLoadModule('/packages/intelligence/src/engine.ts') as typeof import('../packages/intelligence/src/engine');
const fixtures = await loader.ssrLoadModule('/packages/intelligence/src/fixtures.ts') as typeof import('../packages/intelligence/src/fixtures');
const seeds = Array.from({ length: 50 }, (_, index) => index);
const startedAt = new Date().toISOString();
const started = performance.now();
type Scenario = 'product' | 'activity' | 'warehouse' | 'warehouse-replan' | 'warehouse-unreachable-recovery' | 'product-rejected' | 'activity-rejected' | 'product-infeasible' | 'activity-infeasible';
interface Result {
  seed: number; scenario: Scenario; passed: boolean; finalStatus: string; writes: number; steps: number;
  moves: number; replans: number; pathPlans: number; totalPlannedLength: number; shortestPathChecks: number;
  unreachableObserved: boolean; recovered: boolean; constraintViolations: number; approvalViolations: number; errors: string[];
}
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const open = (world: World, p: Point) => p.x >= 0 && p.y >= 0 && p.x < world.width && p.y < world.height && !world.obstacles.some(o => same(o, p));

/** Independent BFS oracle; does not reuse the production A* or path validator. */
function shortestDistance(world: World, start: Point, target: Point): number | null {
  if (!open(world, start) || !open(world, target)) return null;
  const queue = [{ ...start, distance: 0 }], visited = new Set([`${start.x},${start.y}`]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (same(current, target)) return current.distance;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx!, y: current.y + dy! }, key = `${next.x},${next.y}`;
      if (open(world, next) && !visited.has(key)) { visited.add(key); queue.push({ ...next, distance: current.distance + 1 }); }
    }
  }
  return null;
}

function initial(seed: number, scenario: Scenario): Result {
  return { seed, scenario, passed: false, finalStatus: '', writes: 0, steps: 0, moves: 0, replans: 0, pathPlans: 0, totalPlannedLength: 0, shortestPathChecks: 0, unreachableObserved: false, recovered: false, constraintViolations: 0, approvalViolations: 0, errors: [] };
}
function check(result: Result, condition: boolean, code: string, kind: 'constraint' | 'approval' | 'expectation' = 'expectation') {
  if (condition) return;
  if (kind === 'constraint') result.constraintViolations++;
  if (kind === 'approval') result.approvalViolations++;
  if (!result.errors.includes(code)) result.errors.push(code);
}
function finish(result: Result, snapshot: LabSnapshot) {
  result.finalStatus = snapshot.status; result.writes = snapshot.writes;
  result.moves = snapshot.world.moves; result.replans = snapshot.world.replans; result.passed = result.errors.length === 0;
  return result;
}
function make(seed: number, preset: Preset) {
  const runtime = engine.createRuntime({ delayMs: 0, timeoutMs: 5000 });
  const goal = engine.defaultGoal(preset); goal.seed = seed;
  if (preset !== 'warehouse') {
    goal.quantity = seed % 3 + 1; goal.budgetCents = goal.quantity * 30000;
    if (preset === 'product') goal.category = ['all', '工作', '生活', '通勤'][seed % 4]!;
    else goal.slotId = seed % 2 ? 'slot-print' : 'slot-river';
  }
  runtime.plan(goal);
  return runtime;
}
async function step(runtime: IntelligenceRuntime, result: Result, authorized = false) {
  const before = runtime.snapshot;
  await runtime.step(); result.steps++;
  const after = runtime.snapshot;
  if (!authorized) check(result, after.writes === 0, 'write-before-approval', 'approval');
  if (before.goal.preset !== 'warehouse') return;
  const node = after.nodes.find(n => n.status === 'running' || (n.status === 'succeeded' && before.nodes.find(old => old.id === n.id)?.status !== 'succeeded'));
  const output = node?.output as { action?: string; length?: number; path?: Point[] } | null;
  const distance = Math.abs(after.world.robot.x - before.world.robot.x) + Math.abs(after.world.robot.y - before.world.robot.y);
  check(result, distance <= 1, 'non-cardinal-or-multicell-move', 'constraint');
  check(result, open(after.world, after.world.robot), 'robot-collision', 'constraint');
  check(result, after.world.carrying === null || after.world.cargo.some(c => c.id === after.world.carrying && !c.delivered && same(c.position, after.world.robot)), 'invalid-payload', 'constraint');
  for (const cargo of after.world.cargo.filter(c => c.delivered)) check(result, same(cargo.position, after.world.target), 'delivered-away-from-target', 'constraint');
  if (output?.action === 'plan-path') {
    const destination = node!.input.destination as Point;
    const expected = shortestDistance(before.world, before.world.robot, destination);
    result.pathPlans++; result.shortestPathChecks++; result.totalPlannedLength += output.length ?? 0;
    check(result, expected !== null && expected === output.length, 'non-shortest-path', 'constraint');
    let previous = before.world.robot;
    for (const point of output.path ?? []) {
      check(result, open(before.world, point) && Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) === 1, 'invalid-planned-path', 'constraint');
      previous = point;
    }
    check(result, same(previous, destination), 'wrong-path-destination', 'constraint');
  }
}
async function workflow(seed: number, preset: 'product' | 'activity', variant: 'normal' | 'rejected' | 'infeasible'): Promise<Result> {
  const result = initial(seed, (variant === 'normal' ? preset : `${preset}-${variant}`) as Scenario);
  const runtime = make(seed, preset);
  if (variant === 'infeasible') { const goal = runtime.snapshot.goal; goal.budgetCents = 1; runtime.plan(goal); }
  for (let index = 0; index < 3 && runtime.snapshot.status === 'running'; index++) await step(runtime, result);
  if (variant === 'infeasible') {
    check(result, runtime.snapshot.status === 'failed' && runtime.snapshot.clarification.length > 0 && runtime.snapshot.writes === 0, 'infeasible-must-fail-without-write');
    return finish(result, runtime.snapshot);
  }
  check(result, runtime.snapshot.status === 'waiting-approval', 'missing-approval-boundary');
  if (variant === 'rejected') {
    runtime.approve(false); await step(runtime, result);
    check(result, runtime.snapshot.status === 'cancelled' && runtime.snapshot.writes === 0, 'rejected-must-not-write');
    return finish(result, runtime.snapshot);
  }
  runtime.approve(true);
  check(result, runtime.snapshot.writes === 0, 'approval-itself-wrote', 'approval');
  await step(runtime, result, true);
  const snapshot = runtime.snapshot;
  check(result, snapshot.status === 'succeeded' && snapshot.writes === 1, 'normal-workflow-did-not-complete-once');
  const saved = snapshot.result as { candidateId?: string; totalCents?: number; quantity?: number; remainingSeats?: number } | null;
  const candidate = preset === 'product' ? fixtures.PRODUCTS.find(p => p.id === saved?.candidateId) : fixtures.ACTIVITIES.find(p => p.id === saved?.candidateId);
  const available = candidate ? ('stock' in candidate ? candidate.stock : candidate.seats) : -1;
  check(result, !!candidate && available >= snapshot.goal.quantity, 'unavailable-candidate', 'constraint');
  check(result, !!candidate && saved?.quantity === snapshot.goal.quantity && saved.totalCents === candidate.priceCents * snapshot.goal.quantity && saved.totalCents <= snapshot.goal.budgetCents, 'amount-or-budget-violation', 'constraint');
  if (preset === 'activity') check(result, saved?.remainingSeats === available - snapshot.goal.quantity, 'incorrect-remaining-capacity', 'constraint');
  runtime.approve(true); await step(runtime, result, true);
  check(result, runtime.snapshot.writes === 1, 'duplicate-write', 'constraint');
  return finish(result, runtime.snapshot);
}
async function warehouse(seed: number, scenario: 'warehouse' | 'warehouse-replan' | 'warehouse-unreachable-recovery'): Promise<Result> {
  const result = initial(seed, scenario), runtime = make(seed, 'warehouse');
  if (scenario === 'warehouse-replan') {
    await step(runtime, result);
    const old = runtime.snapshot.world, obstacle = old.path[0];
    check(result, !!obstacle, 'baseline-path-missing');
    if (obstacle) runtime.setObstacle(obstacle);
    check(result, runtime.snapshot.world.worldVersion === old.worldVersion + 1 && runtime.snapshot.world.path.length === 0, 'path-not-invalidated', 'constraint');
  } else if (scenario === 'warehouse-unreachable-recovery') {
    for (const point of [{ x: 0, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 0 }, { x: 1, y: 2 }]) runtime.setObstacle(point);
    await step(runtime, result);
    const failure = runtime.snapshot;
    result.unreachableObserved = failure.status === 'failed' && failure.world.moves === 0 && failure.nodes.some(n => (n.output as { code?: string } | null)?.code === 'UNREACHABLE');
    check(result, result.unreachableObserved, 'closed-robot-did-not-fail');
    runtime.setObstacle({ x: 2, y: 1 });
    check(result, runtime.snapshot.status === 'replanning', 'opening-did-not-replan');
  }
  for (let index = 0; index < 350 && ['running', 'replanning'].includes(runtime.snapshot.status); index++) await step(runtime, result);
  const final = runtime.snapshot;
  check(result, final.status === 'succeeded' && final.world.cargo.length === 3 && final.world.cargo.every(c => c.delivered && same(c.position, final.world.target)) && final.world.carrying === null, 'three-cargo-not-delivered');
  if (scenario !== 'warehouse') check(result, final.world.replans > 0, 'missing-replan-count');
  if (scenario === 'warehouse-unreachable-recovery') result.recovered = final.status === 'succeeded';
  return finish(result, final);
}

const results: Result[] = [];
try {
  // Five independent runtimes at a time keeps the evaluator bounded; rows are sorted below.
  for (let offset = 0; offset < seeds.length; offset += 5) {
    const group = await Promise.all(seeds.slice(offset, offset + 5).map(async seed => {
      const cases: Result[] = [];
      for (const preset of ['product', 'activity'] as const) for (const variant of ['normal', 'rejected', 'infeasible'] as const) cases.push(await workflow(seed, preset, variant));
      for (const scenario of ['warehouse', 'warehouse-replan', 'warehouse-unreachable-recovery'] as const) cases.push(await warehouse(seed, scenario));
      return cases;
    }));
    results.push(...group.flat());
  }
  results.sort((a, b) => a.seed - b.seed || a.scenario.localeCompare(b.scenario));
  const baseline = results.filter(r => ['product', 'activity', 'warehouse'].includes(r.scenario));
  const completed = baseline.filter(r => r.passed && r.finalStatus === 'succeeded').length;
  const scenarios = [...new Set(results.map(r => r.scenario))].map(scenario => {
    const cases = results.filter(r => r.scenario === scenario);
    return { scenario, runs: cases.length, passed: cases.filter(r => r.passed).length, terminalStatuses: Object.fromEntries([...new Set(cases.map(r => r.finalStatus))].map(status => [status, cases.filter(r => r.finalStatus === status).length])) };
  });
  const report = {
    schemaVersion: 1, sourceMode: 'local-simulation', fixtureVersion: fixtures.FIXTURE_VERSION, startedAt, completedAt: new Date().toISOString(), wallDurationMs: Math.round((performance.now() - started) * 1000) / 1000,
    command: 'node scripts/evaluate-intelligence.ts', seedRange: { first: 0, last: 49, count: 50 }, delayMs: 0, concurrentIndependentSeeds: 5,
    scope: '50 seeds per scenario; 150 baseline runs plus 300 expected-failure/recovery runs. Synthetic fixtures only. Seed currently selects three shelf layouts; 50 seeds are not 50 distinct maps. No model, network, renderer, public deployment or performance claim.',
    summary: { totalRuns: results.length, expectedOutcomesPassed: results.filter(r => r.passed).length, baselineRuns: baseline.length, baselineCompleted: completed, baselineSuccessRate: completed / baseline.length, constraintViolations: results.reduce((sum, r) => sum + r.constraintViolations, 0), approvalBeforeWriteViolations: results.reduce((sum, r) => sum + r.approvalViolations, 0), shortestPathChecks: results.reduce((sum, r) => sum + r.shortestPathChecks, 0), unreachableDetected: results.filter(r => r.unreachableObserved).length, unreachableRecovered: results.filter(r => r.recovered).length },
    scenarios, results,
  };
  await mkdir(path.join(root, 'docs/intelligence-lab'), { recursive: true });
  await writeFile(path.join(root, 'docs/intelligence-lab/evaluation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report.summary, wallDurationMs: report.wallDurationMs, report: 'docs/intelligence-lab/evaluation.json' }));
  if (report.summary.expectedOutcomesPassed !== results.length) { console.error(JSON.stringify(results.filter(r => !r.passed))); process.exitCode = 1; }
} finally { await loader.close(); }
