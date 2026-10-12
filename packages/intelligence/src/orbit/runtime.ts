import type { OrbitCarrier, OrbitEvent, OrbitRecording, OrbitScenario, OrbitSnapshot, OrbitStrategy } from './types';
import { createOrbitFixture, ORBIT_SCENARIOS, orbitTaskLabel } from './fixtures';
import { findOrbitPath, type OrbitPath } from './graph';
import { assertOrbitInvariants } from './invariants';
import { MAX_ORBIT_BYTES, MAX_ORBIT_EVENTS, MAX_ORBIT_NODES, validateOrbitRecording, validateOrbitSnapshot } from './recording';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let sequence = 0;
const newRun = () => `orbit-${Date.now().toString(36)}-${++sequence}`;
const terminal = (s: OrbitSnapshot) => ['completed', 'cancelled'].includes(s.status);
const MAX_WAIT = 16, MAX_REPLANS = 64, MAX_ACTIONS = 768, MAX_TICKS = 240;
function jsonCost(value: unknown): { bytes: number; nodes: number } {
  const nodes = (item: unknown): number => item && typeof item === 'object' ? 1 + Object.values(item).reduce<number>((sum, child) => sum + nodes(child), 0) : 1;
  return { bytes: new TextEncoder().encode(JSON.stringify(value)).byteLength, nodes: nodes(value) };
}
export interface OrbitRuntimeOptions { scenario?: OrbitScenario; seed?: number; snapshot?: OrbitSnapshot }
export function createOrbitRuntime(options: OrbitRuntimeOptions = {}) {
  let scenario: OrbitScenario = options.scenario ?? 'normal';
  if (!ORBIT_SCENARIOS.includes(scenario)) throw new Error('Unsupported ORBIT scenario');
  const seed = options.seed ?? options.snapshot?.seed ?? 2026;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2_147_483_647) throw new Error('Invalid ORBIT seed');
  let state = options.snapshot ? validateOrbitSnapshot(options.snapshot) : createOrbitFixture(scenario, seed, newRun());
  if (options.snapshot) state.runId = newRun();
  let initial = clone(state), events: OrbitEvent[] = [], toolSequence = 0;
  let budget = jsonCost({ schemaVersion: 3, plannerVersion: state.plannerVersion, seed: state.seed, initial, events: [] });
  let checkpoint = clone(state), checkpointToolSequence = 0;

  function emit(type: string, payload: Record<string, unknown> = {}) {
    const violations = assertOrbitInvariants(state); if (violations.length) throw new Error(`ORBIT invariant: ${violations.join(',')}`);
    const seq = events.length + 1;
    const event: OrbitEvent = { runId: state.runId, eventId: `${state.runId}:event:${seq}`, seq, type, mode: 'local-simulation', simTick: state.simTick, wallTime: new Date().toISOString(), worldVersion: state.worldVersion, payload: clone(payload), snapshot: clone(state) };
    const cost = jsonCost(event), snapshotCost = jsonCost(state);
    // Each accepted commit reserves a failed-state event and a final cancellation.
    // Padding covers their small payload/message/action-ID changes. No snapshots are dropped.
    const reserve = ['run.cancelled', 'run.completed'].includes(type) ? 0 : type === 'run.failed' ? 1 : 2;
    const fits = events.length + 1 + reserve <= MAX_ORBIT_EVENTS && budget.nodes + cost.nodes + reserve * (snapshotCost.nodes + 1024) <= MAX_ORBIT_NODES && budget.bytes + cost.bytes + 1 + reserve * (snapshotCost.bytes + 16384) <= MAX_ORBIT_BYTES;
    if (!fits) {
      if (!events.length) throw new Error('ORBIT initial snapshot exceeds complete-history budget');
      if (type === 'run.failed' || type === 'run.cancelled') throw new Error('ORBIT reserved history capacity exhausted');
      // This synchronous candidate was never published; roll back only its uncommitted
      // changes. Earlier emitted actions, including earlier actions in this tick, remain.
      state = clone(checkpoint); toolSequence = checkpointToolSequence;
      fail('EXECUTION_LIMIT', '完整历史达到结构或体积预算，已停止后续动作；已提交状态仍可导出。');
      return;
    }
    events.push(event); budget.nodes += cost.nodes; budget.bytes += cost.bytes + (events.length > 1 ? 1 : 0);
    checkpoint = event.snapshot; checkpointToolSequence = toolSequence;
  }
  function commit(kind: string, carrier?: OrbitCarrier) {
    const id = `${state.runId}:action:${state.actionIds.length + 1}`;
    state.actionIds.push(id); return { actionId: id, action: kind, carrierId: carrier?.id ?? null };
  }
  function tool(label: string, name: string, input: Record<string, unknown>, action: () => unknown, sources: string[]) {
    const start = performance.now();
    const output = action();
    state.tools.push({ id: `${state.runId}:tool:${++toolSequence}`, label, tool: name, status: 'completed', input: clone(input), output: clone(output), sources, durationMs: Math.max(0, performance.now() - start) });
    if (state.tools.length > 64) state.tools.shift();
    return output;
  }
  function fail(code: string, message: string) {
    state.status = 'failed'; state.failureCode = code; state.message = message;
    emit('run.failed', { code, message });
  }
  function reject(message: string) { if (events.length >= MAX_ORBIT_EVENTS - 2 || ['EXECUTION_LIMIT', 'REPLAN_LIMIT'].includes(state.failureCode ?? '')) return; state.message = message; emit('command.rejected', { message }); }
  function editable() {
    if (terminal(state)) return false;
    if (events.length >= MAX_ORBIT_EVENTS - 4 || state.actionIds.length >= MAX_ACTIONS) { if (state.failureCode !== 'EXECUTION_LIMIT') fail('EXECUTION_LIMIT', '已达到本轮有限执行上限，请重置。'); return false; }
    return state.failureCode !== 'EXECUTION_LIMIT' && state.failureCode !== 'REPLAN_LIMIT';
  }
  function invalidate(type: string, payload: Record<string, unknown>) {
    state.worldVersion++;
    for (const carrier of state.carriers) { carrier.route = []; carrier.planVersion = 0; if (!carrier.transit && carrier.status !== 'failed') carrier.status = 'idle'; }
    state.message = '世界条件已变化，旧计划失效。已进入航道的载体先安全到下一节点，再重新规划。';
    emit(type, { ...payload, worldVersion: state.worldVersion, transitRule: 'finish entered lane before replanning' });
  }
  function path(carrier: OrbitCarrier, destination: string): OrbitPath | null {
    const primary = findOrbitPath(state.stations, state.lanes, carrier.nodeId, destination, state.strategy);
    if (primary && primary.energy <= carrier.energy) return primary;
    const efficient = findOrbitPath(state.stations, state.lanes, carrier.nodeId, destination, 'energy');
    return efficient && efficient.energy <= carrier.energy ? efficient : null;
  }
  function carrierFailure(carrier: OrbitCarrier, code: string, message: string) {
    carrier.status = 'failed'; carrier.route = []; carrier.planVersion = 0; state.failureCode = code; state.message = message;
    emit('carrier.failed', { carrierId: carrier.id, code, message });
  }
  function plan(carrier: OrbitCarrier, destination: string) {
    if (state.replans >= MAX_REPLANS) { fail('REPLAN_LIMIT', '重规划已达有限上限，请重置任务。'); return; }
    const route = tool('估算合法航路', 'estimate-route', { carrierId: carrier.id, from: carrier.nodeId, destination, strategy: state.strategy, worldVersion: state.worldVersion, energy: carrier.energy }, () => path(carrier, destination), [`world:${state.worldVersion}`, `seed:${state.seed}`, state.plannerVersion]) as OrbitPath | null;
    state.replans++;
    if (!route) {
      const exists = findOrbitPath(state.stations, state.lanes, carrier.nodeId, destination, 'energy');
      carrierFailure(carrier, exists ? 'INSUFFICIENT_ENERGY' : 'UNREACHABLE', exists ? '能量不足以到达下一目标，暂停此载体并保留已提交动作。' : '这段通路关闭，当前目标不可达。可重新开放航道后重试。'); return;
    }
    carrier.route = route.lanes; carrier.planVersion = state.worldVersion; carrier.status = 'idle'; carrier.waitTicks = 0;
    emit('plan.created', { carrierId: carrier.id, destination, strategy: state.strategy, route, worldVersion: state.worldVersion });
  }
  function reserve(carrier: OrbitCarrier) {
    const need = state.task.quantity - state.task.delivered - state.carriers.reduce((sum, c) => sum + c.cargo + c.reserved, 0);
    if (need <= 0) { carrier.status = 'done'; return; }
    const available = state.stations.filter(s => s.kind === 'resource' && s.stock > s.reserved);
    const candidates = available.flatMap(station => {
      let outward = findOrbitPath(state.stations, state.lanes, carrier.nodeId, station.id, state.strategy);
      let delivery = findOrbitPath(state.stations, state.lanes, station.id, state.task.targetId, state.strategy);
      if (outward && delivery && outward.energy + delivery.energy > carrier.energy) {
        outward = findOrbitPath(state.stations, state.lanes, carrier.nodeId, station.id, 'energy'); delivery = findOrbitPath(state.stations, state.lanes, station.id, state.task.targetId, 'energy');
      }
      if (!outward || !delivery || outward.energy + delivery.energy > carrier.energy) return [];
      return [{ station, outward, delivery, ticks: outward.ticks + delivery.ticks, energy: outward.energy + delivery.energy }];
    }).sort((a, b) => (state.strategy === 'time' ? a.ticks - b.ticks || a.energy - b.energy : a.energy - b.energy || a.ticks - b.ticks) || a.station.id.localeCompare(b.station.id));
    const selected = candidates[0];
    tool('查询库存并校验运力', 'reserve-resource', { carrierId: carrier.id, capacity: carrier.capacity, remainingDemand: need, strategy: state.strategy }, () => ({ feasibleSources: candidates.map(c => ({ stationId: c.station.id, ticks: c.ticks, energy: c.energy })) }), [`world:${state.worldVersion}`, 'synthetic-orbit-stock-v3']);
    if (!selected) {
      const reachable = available.some(s => findOrbitPath(state.stations, state.lanes, carrier.nodeId, s.id, 'energy') && findOrbitPath(state.stations, state.lanes, s.id, state.task.targetId, 'energy'));
      carrierFailure(carrier, available.length === 0 ? 'INSUFFICIENT_STOCK' : reachable ? 'INSUFFICIENT_ENERGY' : 'UNREACHABLE', available.length === 0 ? '没有足够的未预留物资，不能重复领货。' : reachable ? '剩余能量不能完成取货与交付，未扣减库存。' : '从当前节点到库存和目标的通路不可达。'); return;
    }
    const amount = Math.min(carrier.capacity, need, selected.station.stock - selected.station.reserved);
    selected.station.reserved += amount; carrier.reserved = amount; carrier.sourceId = selected.station.id;
    carrier.route = selected.outward.lanes; carrier.planVersion = state.worldVersion; carrier.status = 'idle'; carrier.waitTicks = 0;
    emit('resource.reserved', { ...commit('reserve', carrier), stationId: selected.station.id, quantity: amount, route: selected.outward, deliveryEstimate: selected.delivery });
  }
  function wait(carrier: OrbitCarrier, reason: string) {
    carrier.status = 'waiting'; carrier.waitTicks++; carrier.totalWait++;
    emit('carrier.waiting', { carrierId: carrier.id, reason, ticks: carrier.waitTicks, limit: MAX_WAIT });
    if (state.status === 'running' && carrier.waitTicks > MAX_WAIT) fail('WAIT_LIMIT', '节点或航道预约等待超过上限。任务停止，可调整航道/优先级后重试。');
  }
  function act(carrier: OrbitCarrier) {
    if (carrier.transit) {
      const transit = carrier.transit; transit.elapsed++;
      if (transit.elapsed === transit.duration) {
        carrier.nodeId = transit.to; carrier.transit = null; carrier.status = 'idle'; carrier.waitTicks = 0;
        emit('carrier.arrived', { ...commit('arrive', carrier), laneId: transit.laneId, stationId: carrier.nodeId });
      } else emit('carrier.progressed', { carrierId: carrier.id, laneId: transit.laneId, elapsed: transit.elapsed, duration: transit.duration });
      return;
    }
    if (carrier.status === 'failed') return;
    if (carrier.cargo && carrier.nodeId === state.task.targetId) {
      const amount = carrier.cargo; carrier.cargo = 0; carrier.delivered += amount; state.task.delivered += amount; carrier.sourceId = null; carrier.route = []; carrier.status = 'done'; carrier.waitTicks = 0;
      state.message = `${carrier.label}已交付 ${amount} 份；总进度 ${state.task.delivered}/${state.task.quantity}。`;
      emit('cargo.delivered', { ...commit('deliver', carrier), targetId: state.task.targetId, quantity: amount }); return;
    }
    if (carrier.reserved && carrier.nodeId === carrier.sourceId) {
      const source = state.stations.find(s => s.id === carrier.sourceId)!; const amount = carrier.reserved;
      if (source.stock < amount || source.reserved < amount) { fail('RESERVATION_CONFLICT', '物资预留不再有效，未提交装载。'); return; }
      source.stock -= amount; source.reserved -= amount; carrier.reserved = 0; carrier.cargo = amount; carrier.route = []; carrier.status = 'loading'; carrier.waitTicks = 0;
      emit('cargo.loaded', { ...commit('load', carrier), stationId: source.id, quantity: amount }); return;
    }
    if (!carrier.cargo && !carrier.reserved) { reserve(carrier); return; }
    if (carrier.planVersion !== state.worldVersion || !carrier.route.length) { carrier.route = []; plan(carrier, carrier.cargo ? state.task.targetId : carrier.sourceId!); return; }
    const lane = state.lanes.find(l => l.id === carrier.route[0]);
    const to = lane?.from === carrier.nodeId ? lane.to : lane?.bidirectional && lane.to === carrier.nodeId ? lane.from : null;
    if (!lane?.open || !to) { carrier.route = []; carrier.planVersion = 0; plan(carrier, carrier.cargo ? state.task.targetId : carrier.sourceId!); return; }
    if (carrier.energy < lane.energy) { carrierFailure(carrier, 'INSUFFICIENT_ENERGY', '进入航道前能量检查失败，保持当前位置。'); return; }
    const incoming = state.carriers.filter(c => c.id !== carrier.id && (c.transit ? c.transit.to === to : c.nodeId === to)).length;
    if (state.carriers.filter(c => c.transit?.laneId === lane.id).length >= lane.capacity) { wait(carrier, '航道容量已预约'); return; }
    if (incoming >= state.stations.find(s => s.id === to)!.dockCapacity) { wait(carrier, '下一安全节点泊位已预约'); return; }
    carrier.energy -= lane.energy; carrier.route.shift(); carrier.transit = { laneId: lane.id, from: carrier.nodeId, to, elapsed: 0, duration: lane.ticks }; carrier.status = 'moving'; carrier.waitTicks = 0;
    emit('carrier.departed', { ...commit('enter-lane', carrier), laneId: lane.id, from: carrier.nodeId, to, energy: lane.energy, duration: lane.ticks, planVersion: carrier.planVersion });
  }
  function settle() {
    if (state.status !== 'running') return;
    if (state.task.delivered === state.task.quantity) { state.status = 'completed'; state.failureCode = null; state.message = '三份能源组件实际送达，库存、载荷和能量约束校验通过。'; emit('run.completed', { delivered: state.task.delivered, consumedEnergy: state.carriers.reduce((sum, c) => sum + c.initialEnergy - c.energy, 0) }); return; }
    if (state.carriers.every(c => c.status === 'failed' || (!c.cargo && !c.reserved && c.status === 'done'))) fail(state.failureCode ?? 'UNREACHABLE', state.message);
  }
  emit(options.snapshot ? 'run.forked' : 'run.ready', { seed: state.seed, plannerVersion: state.plannerVersion });
  const runtime = {
    get snapshot() { return clone(state); }, get events() { return clone(events); },
    start() {
      if (state.status !== 'ready' || !editable()) return;
      state.status = 'running';
      tool('读取世界与任务', 'read-world', { seed: state.seed }, () => ({ stationCount: state.stations.length, carriers: state.carriers.length, quantity: state.task.quantity }), [state.plannerVersion, `world:${state.worldVersion}`]);
      if (state.stations.reduce((sum, s) => sum + s.stock, 0) + state.carriers.reduce((sum, c) => sum + c.cargo, 0) < state.task.quantity - state.task.delivered) { fail('INSUFFICIENT_STOCK', '库存少于剩余需求，未预留、未装载，也未伪造完成。'); return; }
      state.message = '任务已启动。先查询资源并预约运力，再逐段执行合法航路。'; emit('run.started');
    },
    step() {
      if (state.status !== 'running' || !editable()) return;
      const dueFaults = state.faults.filter((fault, index) => fault.tick <= state.simTick + 1 && !state.appliedFaults.includes(index)).length;
      if (events.length + dueFaults + state.carriers.length + 2 >= MAX_ORBIT_EVENTS) { fail('EXECUTION_LIMIT', '本轮事件记录即将达到上限，已停止以保留完整历史。'); return; }
      if (state.simTick >= Math.min(state.task.deadline, MAX_TICKS) || state.actionIds.length >= MAX_ACTIONS) { fail('EXECUTION_LIMIT', '达到任务时间或动作上限，保留当前状态，请重置或求助。'); return; }
      state.simTick++;
      for (const [index, fault] of state.faults.entries()) { if (state.status !== 'running') break; if (fault.tick <= state.simTick && !state.appliedFaults.includes(index)) { state.appliedFaults.push(index); const lane = state.lanes.find(l => l.id === fault.laneId)!; lane.open = fault.open; invalidate('world.fault-applied', { faultIndex: index, ...fault }); } }
      for (const carrier of [...state.carriers].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) { if (state.status !== 'running') break; act(carrier); }
      if (state.status === 'running') emit('tick.completed', { tick: state.simTick });
      settle();
    },
    pause() { if (state.status === 'running') { state.status = 'paused'; state.message = '仿真已暂停，世界、货物和在途位置保持当前时刻。'; emit('run.paused'); } },
    resume() { if (state.status === 'paused' && editable()) { state.status = 'running'; state.message = '从暂停位置继续执行。'; emit('run.resumed'); } },
    cancel() {
      if (terminal(state)) return;
      for (const carrier of state.carriers) { if (carrier.reserved) { state.stations.find(s => s.id === carrier.sourceId)!.reserved -= carrier.reserved; carrier.reserved = 0; if (!carrier.cargo) carrier.sourceId = null; } carrier.route = []; carrier.planVersion = 0; }
      state.status = 'cancelled'; state.message = '已取消后续动作；未装载预留已释放，已装货、已耗能与已交付保持不变。'; state.failureCode = null;
      emit('run.cancelled', { ...commit('cancel'), committedDelivered: state.task.delivered, retainedCargo: state.carriers.reduce((sum, c) => sum + c.cargo, 0) });
    },
    reset(nextScenario: OrbitScenario = scenario, nextSeed = state.seed) {
      if (!ORBIT_SCENARIOS.includes(nextScenario) || !Number.isSafeInteger(nextSeed) || nextSeed < 0 || nextSeed > 2_147_483_647) { reject('场景或 seed 无效，未重置当前任务。'); return; }
      scenario = nextScenario; state = createOrbitFixture(scenario, nextSeed, newRun()); initial = clone(state); events = []; toolSequence = 0;
      budget = jsonCost({ schemaVersion: 3, plannerVersion: state.plannerVersion, seed: state.seed, initial, events: [] }); checkpoint = clone(state); checkpointToolSequence = 0;
      emit('run.ready', { scenario, seed: nextSeed });
    },
    setLane(id: string, open: boolean) {
      if (!editable()) return; const lane = state.lanes.find(l => l.id === id);
      if (!lane || typeof open !== 'boolean') { reject('航道或开放状态无效。'); return; }
      if (lane.open === open) return; lane.open = open; invalidate('world.lane-changed', { laneId: id, open });
    },
    setStrategy(strategy: OrbitStrategy) {
      if (!editable()) return; if (!['time', 'energy'].includes(strategy)) { reject('只支持优先时效和优先节能。'); return; }
      if (state.strategy === strategy) return; state.strategy = strategy; invalidate('strategy.changed', { strategy });
    },
    setPriority(id: string, priority: number) {
      if (!editable()) return; const carrier = state.carriers.find(c => c.id === id);
      if (!carrier || !Number.isInteger(priority) || priority < 0 || priority > 9) { reject('请选择已有载体和 0–9 的优先级。'); return; }
      if (carrier.priority === priority) return; carrier.priority = priority; invalidate('priority.changed', { carrierId: id, priority });
    },
    setTarget(id: string) {
      if (!editable()) return; if (!state.stations.some(s => s.id === id)) { reject('目标站不存在，原任务未改变。'); return; }
      if (state.task.targetId === id) return;
      if (state.task.delivered > 0) { reject('已有物资交付，不能将旧站点交付改算到新目标。请完成或取消当前任务后重置。'); return; }
      state.task.targetId = id; state.task.label = orbitTaskLabel(state.stations.find(s => s.id === id)!.label, state.task.quantity); invalidate('target.changed', { targetId: id, preservedDeliveries: state.task.delivered });
    },
    retry() {
      if (state.status !== 'failed' || !editable()) return;
      if (state.stations.reduce((sum, s) => sum + s.stock, 0) + state.carriers.reduce((sum, c) => sum + c.cargo, 0) < state.task.quantity - state.task.delivered) { fail('INSUFFICIENT_STOCK', '剩余库存仍小于未完成需求，请更换场景或重置；未重复预留。'); return; }
      state.failureCode = null; state.status = 'running';
      for (const carrier of state.carriers) { carrier.route = []; carrier.planVersion = 0; carrier.waitTicks = 0; carrier.status = carrier.transit ? 'moving' : 'idle'; }
      state.message = '按当前世界重试剩余任务；已交付、已装载与已耗能不会回滚。'; emit('run.retried');
    },
    exportRecording(): OrbitRecording { return validateOrbitRecording({ schemaVersion: 3, plannerVersion: state.plannerVersion, seed: state.seed, initial, events }); },
  };
  return runtime;
}
export type OrbitRuntime = ReturnType<typeof createOrbitRuntime>;
