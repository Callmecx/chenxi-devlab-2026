import type { Fault, Goal, IntelligenceRuntime, LabSnapshot, PlanNode, Point, Preset, RunEvent, RuntimeOptions } from './types';
import { ACTIVITIES, createWorld, defaultGoal, FIXTURE_VERSION, PRODUCTS } from './fixtures';
import { findPath, isWalkable, samePoint } from './pathfinding';
import { buildRecording, MAX_RECORDING_EVENTS } from './recording';

export { defaultGoal } from './fixtures';
const MAX_RETRIES = 3;
const MAX_REPLANS = 12;
const MAX_ACTIONS = 400;
let runSequence = 0;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const terminal = (status: LabSnapshot['status']) => ['succeeded', 'failed', 'cancelled'].includes(status);
type Candidate = { id: string; title: string; category: string; priceCents: number; available: number; facts: string[]; source: string };
type QueryResult = { candidates: Candidate[]; partial: boolean; fixtureVersion: string };
type Comparison = { eligible: Candidate[]; selected: Candidate; totalCents: number; reasoning: string };
class ToolError extends Error { constructor(readonly code: string, message: string) { super(message); } }

function node(id: string, title: string, tool: string, input: Record<string, unknown>): PlanNode {
  return { id, title, tool, status: 'queued', input, output: null, sources: [], durationMs: null, attempts: 0 };
}

function checkedGoal(input: Goal): { value: Goal; clarification: string[] } {
  const preset: Preset = ['product', 'activity', 'warehouse'].includes(input?.preset) ? input.preset : 'product';
  const fallback = defaultGoal(preset);
  const clarification: string[] = [];
  const value: Goal = { ...fallback };
  if (input?.preset !== preset) clarification.push('请从商品、活动或仓储三个预设中选择。');
  for (const key of ['prompt', 'category', 'slotId'] as const) {
    const text = input?.[key];
    if (typeof text !== 'string' || text.length > (key === 'prompt' ? 2000 : 80)) clarification.push(`${key} 字段无效。`);
    else value[key] = text.trim();
  }
  for (const [key, min, max] of [['budgetCents', 0, 1_000_000_000], ['quantity', 1, 20], ['seed', 0, 2_147_483_647]] as const) {
    const number = input?.[key];
    if (!Number.isSafeInteger(number) || number < min || number > max) clarification.push(`${key} 必须是 ${min}–${max} 的整数。`);
    else value[key] = number;
  }
  if (!value.prompt) clarification.push('请填写目标，或使用已支持的预设。');
  const supported = preset === 'product' ? /商品|选品|产品|product/i : preset === 'activity' ? /活动|预约|路线|activity/i : /仓储|货物|搬运|机器人|warehouse/i;
  if (value.prompt && !supported.test(value.prompt)) clarification.push('本地规则无法解释这个自由文本目标；请使用对应预设并填写结构化约束。');
  const budget = /预算\s*(?:为|是|[:：])?\s*(\d+(?:\.\d{1,2})?)\s*元/.exec(value.prompt);
  if (budget && Math.round(Number(budget[1]) * 100) !== value.budgetCents) clarification.push('文字中的预算与预算字段冲突，请先统一两处数值。');
  const quantity = /(?:数量\s*[:：]?\s*(\d+)|(\d+)\s*(?:件商品|人预约))/.exec(value.prompt);
  if (quantity && Number(quantity[1] ?? quantity[2]) !== value.quantity) clarification.push('文字中的数量与数量字段冲突，请先统一两处数值。');
  if (preset === 'warehouse' && value.quantity > 3) clarification.push('当前仓储 fixture 只有三件货物，请选择 1–3 件。');
  return { value, clarification };
}

/** Deterministic workflow / grid simulator. No LLM, network, payment, camera or device calls. */
export function createRuntime(options: RuntimeOptions = {}): IntelligenceRuntime {
  const delayMs = Math.max(0, Math.min(5000, Number.isFinite(options.delayMs) ? options.delayMs! : 120));
  const timeoutMs = Math.max(1, Math.min(60_000, Number.isFinite(options.timeoutMs) ? options.timeoutMs! : 2500));
  const now = options.now ?? (() => performance.now());
  let epoch = 0;
  let callSequence = 0;
  let busyToken: number | null = null;
  let fault: Fault = 'none';
  let approved = false;
  let retries = 0;
  let actionCount = 0;
  let failureCode = '';
  let query: QueryResult | null = null;
  let comparison: Comparison | null = null;
  let draft: Record<string, unknown> | null = null;
  let requestedCargo: string[] = [];
  let selectedCargo: string | null = null;
  let pathVersion = 0;
  let invalidated = false;
  let priorityChanges = 0;
  let records: Record<string, unknown>[] = [];
  let activitySeats = new Map(ACTIVITIES.map(item => [item.id, item.seats]));
  let state: LabSnapshot;
  let trace: RunEvent[] = [];

  function emit(type: string, payload: Record<string, unknown>, stepId?: string, toolCallId?: string) {
    if (trace.length >= MAX_RECORDING_EVENTS) return;
    if (trace.length === MAX_RECORDING_EVENTS - 1) {
      state.status = 'failed'; state.message = '已达到本次运行事件上限，请重置。'; failureCode = 'EVENT_LIMIT';
      type = 'run.limit'; payload = { code: failureCode };
    }
    const seq = trace.length + 1;
    const event: RunEvent = {
      schemaVersion: 1, runId: state.runId, eventId: `${state.runId}:event:${seq}`, seq,
      timestamp: new Date().toISOString(), sourceMode: 'local-simulation', type,
      worldVersion: state.world.worldVersion, payload: clone(payload), snapshot: clone(state),
    };
    if (stepId) event.stepId = stepId;
    if (toolCallId) event.toolCallId = toolCallId;
    if (trace.length) event.parentEventId = trace[trace.length - 1]!.eventId;
    trace.push(event);
  }

  function begin(goal: Goal, planned: boolean, clarification: string[] = []) {
    epoch += 1; busyToken = null; approved = false; retries = 0; actionCount = 0; failureCode = '';
    query = null; comparison = null; draft = null; selectedCargo = null; pathVersion = 0; invalidated = false; priorityChanges = 0;
    records = []; activitySeats = new Map(ACTIVITIES.map(item => [item.id, item.seats])); trace = [];
    const world = createWorld(goal.seed);
    requestedCargo = world.cargo.slice(0, Math.min(goal.quantity, 3)).map(item => item.id);
    state = { runId: `run-${Date.now().toString(36)}-${++runSequence}`, status: planned ? 'planning' : 'queued', goal: clone(goal), nodes: [], world, message: '本地规则 / 算法仿真；尚未执行工具。', result: null, clarification, writes: 0 };
    if (planned && !clarification.length) {
      state.nodes = goal.preset === 'warehouse'
        ? requestedCargo.map(id => node(`deliver-${id}`, `搬运 ${world.cargo.find(item => item.id === id)!.label}`, 'warehouse-deliver', { cargoId: id, capacity: 1, target: clone(world.target) }))
        : [
          node('query', goal.preset === 'product' ? '查询合成商品与库存' : '查询合成路线与名额', goal.preset === 'product' ? 'query-products' : 'query-activities', { category: goal.category, slotId: goal.slotId, fixtureVersion: FIXTURE_VERSION }),
          node('compare', '按预算与数量比较', 'compare-candidates', { budgetCents: goal.budgetCents, quantity: goal.quantity }),
          node('draft', goal.preset === 'product' ? '生成 Listing 草稿' : '生成预约草稿', 'build-draft', { preset: goal.preset }),
          node('confirm', '人工审批后本地写入', goal.preset === 'product' ? 'save-listing-local' : 'confirm-booking-local', { requiresApproval: true, mode: 'local-simulation' }),
        ];
    }
    emit(planned ? 'run.planning' : 'run.ready', { input: clone(goal), seed: goal.seed, algorithm: goal.preset === 'warehouse' ? 'A* / single-capacity discrete executor' : 'deterministic workflow; not an LLM' });
    if (planned) {
      state.status = clarification.length ? 'failed' : 'running';
      state.message = clarification.length ? '目标需要澄清，未执行工具。' : '执行计划已生成；每次单步只调用一个工具或一个离散动作。';
      if (clarification.length) failureCode = 'CLARIFICATION_REQUIRED';
      emit(clarification.length ? 'goal.clarification' : 'run.planned', { clarification });
    }
  }

  function failed(nodeValue: PlanNode | undefined, code: string, message: string, durationMs?: number, toolCallId?: string) {
    failureCode = code; state.status = 'failed'; state.message = message; state.world.path = [];
    if (nodeValue) { nodeValue.status = 'failed'; nodeValue.output = { code, message }; if (durationMs !== undefined) nodeValue.durationMs = durationMs; }
    emit(nodeValue ? 'tool.failed' : 'run.failed', { code, message, tool: nodeValue?.tool ?? null, input: nodeValue ? clone(nodeValue.input) : null, measuredWallDurationMs: durationMs ?? null }, nodeValue?.id, toolCallId);
  }

  function elapsed(start: number) { const duration = now() - start; return Number.isFinite(duration) ? Math.max(0, duration) : 0; }

  function wait(selectedFault: Fault): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) { settled = true; clearTimeout(work); reject(new ToolError('TIMEOUT', '本地工具等待超时；尚未提交写入，可手动重试。')); }
      }, timeoutMs);
      const work = setTimeout(() => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        if (selectedFault === 'failure') reject(new ToolError('INJECTED_FAILURE', '已触发本地工具失败注入，未伪造成功结果。'));
        else resolve();
      }, selectedFault === 'timeout' ? timeoutMs + 1 : delayMs);
    });
  }

  async function execute(nodeValue: PlanNode, action: (selectedFault: Fault) => void, warehouse = false) {
    const started = now(); const capturedEpoch = epoch; const capturedVersion = state.world.worldVersion;
    const token = ++callSequence; const toolCallId = `${state.runId}:call:${token}`; busyToken = token;
    const selectedFault = fault;
    nodeValue.status = 'running';
    if (!warehouse) nodeValue.attempts += 1;
    emit('tool.started', { tool: nodeValue.tool, input: clone(nodeValue.input), fault: selectedFault }, nodeValue.id, toolCallId);
    try {
      await wait(selectedFault);
      // A late completion may do neither domain writes nor trace/status updates.
      if (capturedEpoch !== epoch || capturedVersion !== state.world.worldVersion || terminal(state.status)) return;
      if (++actionCount > MAX_ACTIONS) throw new ToolError('ACTION_LIMIT', '本次运行已达到有限动作上限，请重置。');
      action(selectedFault);
      nodeValue.durationMs = (warehouse ? nodeValue.durationMs ?? 0 : 0) + elapsed(started);
      if (!warehouse) nodeValue.status = 'succeeded';
      emit('tool.completed', { tool: nodeValue.tool, output: clone(nodeValue.output), sources: nodeValue.sources, measuredWallDurationMs: elapsed(started), timing: 'actual elapsed wall time including injected local delay' }, nodeValue.id, toolCallId);
    } catch (error) {
      if (capturedEpoch !== epoch || capturedVersion !== state.world.worldVersion || terminal(state.status)) return;
      const failure = error instanceof ToolError ? error : new ToolError('EXECUTION_ERROR', error instanceof Error ? error.message : '执行失败');
      failed(nodeValue, failure.code, failure.message, elapsed(started), toolCallId);
    } finally { if (busyToken === token) busyToken = null; }
  }

  function categoryMatches(category: string) { return !state.goal.category || ['all', '全部'].includes(state.goal.category) || category === state.goal.category; }

  function workflowAction(current: PlanNode, selectedFault: Fault) {
    if (selectedFault === 'partial' && current.id !== 'query') throw new ToolError('PARTIAL_DATA', '部分结果不足以验证约束，请清除故障后重新查询。');
    if (current.id === 'query') {
      const candidates: Candidate[] = state.goal.preset === 'product'
        ? PRODUCTS.filter(item => categoryMatches(item.category)).map(item => ({ id: item.id, title: item.title, category: item.category, priceCents: item.priceCents, available: item.stock, facts: [...item.features, item.document], source: `${FIXTURE_VERSION}:product:${item.id}` }))
        : ACTIVITIES.filter(item => categoryMatches(item.category) && (!state.goal.slotId || state.goal.slotId === 'all' || item.id === state.goal.slotId)).map(item => ({ id: item.id, title: item.title, category: item.category, priceCents: item.priceCents, available: activitySeats.get(item.id) ?? 0, facts: [item.startsAt, item.endsAt, item.description], source: `${FIXTURE_VERSION}:activity:${item.id}` }));
      query = { candidates: selectedFault === 'partial' ? candidates.slice(0, 1) : candidates, partial: selectedFault === 'partial', fixtureVersion: FIXTURE_VERSION };
      current.output = clone(query); current.sources = query.candidates.map(item => item.source);
      state.message = query.partial ? '工具只返回部分数据；后续校验不会把它当完整库存。' : `真实查询得到 ${candidates.length} 个合成候选。`;
    } else if (current.id === 'compare') {
      if (!query || query.partial) throw new ToolError('PARTIAL_DATA', '查询结果不完整，不能生成可确认草稿；请重新查询。');
      const eligible = query.candidates.filter(item => item.available >= state.goal.quantity && item.priceCents * state.goal.quantity <= state.goal.budgetCents).sort((a, b) => a.priceCents - b.priceCents || a.id.localeCompare(b.id));
      const selected = eligible[0];
      if (!selected) {
        state.clarification = ['当前类别、预算、数量或场次没有可行组合。', '请提高预算、减少数量，或选择其他类别/场次后重新规划。'];
        throw new ToolError('NO_FEASIBLE_CANDIDATE', '约束冲突，需要澄清；没有推荐缺货或超预算候选。');
      }
      comparison = { eligible, selected, totalCents: selected.priceCents * state.goal.quantity, reasoning: '只保留库存/名额足够且总金额不超过预算的项，再按单价及稳定 ID 排序。' };
      current.output = clone(comparison); current.sources = eligible.map(item => item.source); state.message = `约束校验通过，选择 ${selected.title}。`;
    } else if (current.id === 'draft') {
      if (!comparison) throw new ToolError('MISSING_COMPARISON', '尚无经过校验的候选。');
      draft = { kind: state.goal.preset === 'product' ? 'listing-draft' : 'booking-draft', candidateId: comparison.selected.id, title: comparison.selected.title, quantity: state.goal.quantity, unitPriceCents: comparison.selected.priceCents, totalCents: comparison.totalCents, facts: comparison.selected.facts, source: comparison.selected.source, mode: 'local-simulation', requiresApproval: true };
      current.output = clone(draft); current.sources = [comparison.selected.source];
      state.result = { draft: clone(draft), confirmed: false }; state.status = 'waiting-approval'; state.nodes[3]!.status = 'waiting-approval';
      state.message = '草稿已生成，等待人工审批；还没有写入预约或 Listing。';
    } else if (current.id === 'confirm') {
      if (!approved || !draft || !comparison) throw new ToolError('APPROVAL_REQUIRED', '必须先获得对此次草稿的明确审批。');
      if (state.writes || records.length) throw new ToolError('DUPLICATE_WRITE', '本次运行已经提交，不重复写入。');
      const selected = comparison.selected;
      if (selected.priceCents * state.goal.quantity !== comparison.totalCents || comparison.totalCents > state.goal.budgetCents) throw new ToolError('STALE_DRAFT', '确认前金额校验失败。');
      let remaining: number | null = null;
      if (state.goal.preset === 'activity') {
        const seats = activitySeats.get(selected.id) ?? 0;
        if (seats < state.goal.quantity) throw new ToolError('NO_CAPACITY', '当前本地名额不足。');
        remaining = seats - state.goal.quantity;
        activitySeats.set(selected.id, remaining);
      } else if (!PRODUCTS.some(item => item.id === selected.id && item.stock >= state.goal.quantity)) throw new ToolError('NO_STOCK', '确认前合成库存校验失败。');
      const record = { ...clone(draft), id: `${state.runId}:record:1`, kind: state.goal.preset === 'product' ? 'saved-listing' : 'confirmed-local-booking', confirmed: true, remainingSeats: remaining, persistedIn: 'isolated runtime memory; no backend', createdAt: new Date().toISOString() };
      records.push(record); state.writes = 1; approved = false; current.output = clone(record); current.sources = [selected.source]; state.result = clone(record); state.status = 'succeeded';
      state.message = '本次本地仿真任务完成：已确认一次隔离写入。没有调用模型或云端服务。';
    }
  }

  function warehouseNode() {
    if (state.world.carrying) selectedCargo = state.world.carrying;
    else if (!selectedCargo || state.world.cargo.find(item => item.id === selectedCargo)?.delivered) {
      selectedCargo = state.world.cargo.filter(item => requestedCargo.includes(item.id) && !item.delivered).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0]?.id ?? null;
    }
    return state.nodes.find(item => item.id === `deliver-${selectedCargo}`);
  }

  function warehouseAction(current: PlanNode, selectedFault: Fault) {
    if (selectedFault === 'partial') throw new ToolError('PARTIAL_DATA', '模拟器状态输入不完整，本次不执行移动或抓取。');
    const world = state.world;
    if (requestedCargo.some(id => !world.cargo.some(item => item.id === id))) throw new ToolError('MISSING_CARGO', '指定货物已不存在，停止任务；重置可恢复 fixture。');
    const cargo = world.cargo.find(item => item.id === selectedCargo);
    if (!cargo) throw new ToolError('MISSING_CARGO', '找不到当前待搬运货物。');
    current.sources = [`simulator-state:seed:${world.seed}:world:${world.worldVersion}`, `cargo:${cargo.id}`];
    if (invalidated) {
      if (world.replans >= MAX_REPLANS) throw new ToolError('REPLAN_LIMIT', '环境变化后的重规划已达到上限，请重置。');
      world.replans += 1; invalidated = false;
    }
    const destination = world.carrying ? world.target : cargo.position;
    state.status = 'running';
    if (world.path.length) {
      if (pathVersion !== world.worldVersion) throw new ToolError('STALE_PATH', '路径版本已失效，不能执行旧动作。');
      const next = world.path[0]!;
      if (!isWalkable(world, next) || Math.abs(next.x - world.robot.x) + Math.abs(next.y - world.robot.y) !== 1) throw new ToolError('INVALID_MOVE', '移动前碰撞/相邻检查失败。');
      world.robot = clone(next); world.path.shift(); world.moves += 1;
      if (world.carrying) cargo.position = clone(next);
      current.output = { action: 'move', to: clone(next), carrying: world.carrying, worldVersion: world.worldVersion };
      state.message = `实际执行网格移动 (${next.x}, ${next.y})。`;
    } else if (samePoint(world.robot, destination)) {
      if (world.carrying) {
        if (world.carrying !== cargo.id || !isWalkable(world, world.target)) throw new ToolError('INVALID_DROP', '投递位置或载荷不合法。');
        cargo.position = clone(world.target); cargo.delivered = true; world.carrying = null; selectedCargo = null; current.status = 'succeeded';
        current.output = { action: 'drop', cargoId: cargo.id, at: clone(world.target) }; state.message = `已投递 ${cargo.label}。`;
        if (requestedCargo.every(id => world.cargo.some(item => item.id === id && item.delivered && samePoint(item.position, world.target)))) {
          state.status = 'succeeded'; state.result = { deliveredIds: [...requestedCargo], moves: world.moves, replans: world.replans, capacity: 1, mode: 'local-simulation', observation: 'simulator structured state' };
          state.message = '本次仿真任务完成：指定货物均已实际到达目标；结果不由动画决定。';
        }
      } else {
        if (cargo.delivered || !samePoint(world.robot, cargo.position)) throw new ToolError('INVALID_PICK', '货物位置或抓取前提不满足。');
        world.carrying = cargo.id; current.output = { action: 'pick', cargoId: cargo.id, capacity: 1 }; state.message = `已抓取 ${cargo.label}，载荷 1/1。`;
      }
    } else {
      const path = findPath(world, world.robot, destination);
      if (!path) throw new ToolError('UNREACHABLE', '目标不可达；没有穿越障碍或直接宣告成功。移除障碍后可重规划。');
      world.path = path; pathVersion = world.worldVersion; current.attempts += 1;
      current.output = { action: 'plan-path', algorithm: 'A* Manhattan / four-neighbor grid', path: clone(path), length: path.length, worldVersion: pathVersion }; state.message = `A* 实际计算出 ${path.length} 步路径。`;
    }
  }

  function canEditWorld() { return state.goal.preset === 'warehouse' && !['succeeded', 'cancelled'].includes(state.status) && !['REPLAN_LIMIT', 'ACTION_LIMIT', 'EVENT_LIMIT'].includes(failureCode); }
  function validPoint(point: Point) { return Number.isInteger(point?.x) && Number.isInteger(point?.y) && point.x >= 0 && point.y >= 0 && point.x < state.world.width && point.y < state.world.height; }
  function worldChanged(type: string, payload: Record<string, unknown>) {
    epoch += 1; busyToken = null; state.world.worldVersion += 1; state.world.path = []; pathVersion = 0; invalidated = true;
    if (!state.world.carrying) selectedCargo = null;
    if (failureCode !== 'REPLAN_LIMIT' && failureCode !== 'ACTION_LIMIT' && failureCode !== 'EVENT_LIMIT') {
      state.status = 'replanning'; failureCode = '';
      for (const item of state.nodes) if (item.status === 'failed') { item.status = 'queued'; item.output = null; }
    }
    state.message = '世界版本已变化，旧路径与在途结果失效；下一步从当前状态重新规划。';
    emit(type, { ...payload, worldVersion: state.world.worldVersion });
  }

  begin(defaultGoal('product'), false);
  const runtime: IntelligenceRuntime = {
    get snapshot() { return clone(state); },
    get events() { return clone(trace); },
    plan(input) { const checked = checkedGoal(input); begin(checked.value, true, checked.clarification); },
    async step() {
      if (busyToken !== null || terminal(state.status) || state.status === 'waiting-approval' || state.status === 'queued') return;
      if (state.goal.preset === 'warehouse') {
        if (requestedCargo.some(id => !state.world.cargo.some(item => item.id === id))) { failed(undefined, 'MISSING_CARGO', '指定货物已不存在；重置可以恢复。'); return; }
        const current = warehouseNode();
        if (!current) { failed(undefined, 'MISSING_TASK', '没有可执行的搬运任务。'); return; }
        const cargo = state.world.cargo.find(item => item.id === selectedCargo)!;
        const destination = state.world.carrying ? state.world.target : cargo.position;
        current.input = { cargoId: cargo.id, capacity: 1, from: clone(state.world.robot), destination: clone(destination), worldVersion: state.world.worldVersion, action: state.world.path.length ? 'move' : samePoint(state.world.robot, destination) ? state.world.carrying ? 'drop' : 'pick' : 'plan-path' };
        await execute(current, selectedFault => warehouseAction(current, selectedFault), true);
      } else {
        const current = state.nodes.find(item => item.status === 'queued');
        if (current) {
          if (current.id === 'compare') current.input = { budgetCents: state.goal.budgetCents, quantity: state.goal.quantity, candidates: query ? clone(query.candidates) : [], partial: query?.partial ?? true };
          if (current.id === 'draft') current.input = { preset: state.goal.preset, selected: comparison ? clone(comparison.selected) : null, quantity: state.goal.quantity, totalCents: comparison?.totalCents ?? null };
          if (current.id === 'confirm') current.input = { requiresApproval: true, approved, mode: 'local-simulation', draft: clone(draft) };
          await execute(current, selectedFault => workflowAction(current, selectedFault));
        }
      }
    },
    approve(accepted) {
      if (state.status !== 'waiting-approval' || typeof accepted !== 'boolean') return;
      const confirmation = state.nodes.find(item => item.id === 'confirm')!;
      if (!accepted) { epoch += 1; approved = false; confirmation.status = 'cancelled'; state.status = 'cancelled'; state.message = '人工拒绝了草稿；未执行任何确认写入。'; emit('approval.rejected', { writes: state.writes }, confirmation.id); }
      else { approved = true; confirmation.status = 'queued'; state.status = 'running'; state.message = '人工审批已通过；下一次单步执行受控本地写入。'; emit('approval.granted', { draft: clone(draft), writes: state.writes }, confirmation.id); }
    },
    cancel() {
      if (terminal(state.status)) return;
      epoch += 1; busyToken = null; approved = false; state.status = 'cancelled'; state.world.path = [];
      for (const item of state.nodes) if (!['succeeded', 'failed'].includes(item.status)) item.status = 'cancelled';
      state.message = '本地执行已取消；迟到响应不能继续任务或产生写入。'; emit('run.cancelled', { writes: state.writes });
    },
    retry() {
      if (state.status !== 'failed') return;
      if (failureCode === 'EVENT_LIMIT') return;
      if (['CLARIFICATION_REQUIRED', 'NO_FEASIBLE_CANDIDATE', 'MISSING_CARGO', 'REPLAN_LIMIT', 'ACTION_LIMIT', 'EVENT_LIMIT'].includes(failureCode)) { state.message = '此问题需要修改目标、修复世界或重置，不能盲目重试。'; emit('retry.denied', { code: failureCode }); return; }
      if (retries >= MAX_RETRIES) { state.message = '本次运行已达到三次手动重试上限，请重置。'; emit('retry.limit', { limit: MAX_RETRIES }); return; }
      retries += 1; epoch += 1; busyToken = null;
      if (failureCode === 'PARTIAL_DATA' && state.goal.preset !== 'warehouse') {
        query = null; comparison = null; draft = null; approved = false; state.result = null;
        for (const item of state.nodes) { item.status = 'queued'; item.output = null; item.sources = []; }
      } else for (const item of state.nodes) if (item.status === 'failed') { item.status = 'queued'; item.output = null; }
      state.status = state.goal.preset === 'warehouse' ? 'replanning' : 'running'; state.world.path = []; failureCode = ''; state.message = `手动重试 ${retries}/${MAX_RETRIES}；不会重放已成功的写入。`; emit('run.retry', { attempt: retries });
    },
    setFault(value) { if (!['none', 'timeout', 'partial', 'failure'].includes(value)) return; fault = value; if (!terminal(state.status)) emit('fault.changed', { fault }); },
    setObstacle(point) {
      if (!canEditWorld() || !validPoint(point) || samePoint(point, state.world.robot)) return;
      const index = state.world.obstacles.findIndex(item => samePoint(item, point));
      if (index < 0) state.world.obstacles.push(clone(point)); else state.world.obstacles.splice(index, 1);
      worldChanged('world.obstacle-changed', { point: clone(point), blocked: index < 0 });
    },
    moveTarget(point) {
      if (!canEditWorld() || !validPoint(point) || samePoint(point, state.world.target)) return;
      state.world.target = clone(point);
      for (const cargo of state.world.cargo) if (cargo.delivered && !samePoint(cargo.position, point)) {
        cargo.delivered = false; const task = state.nodes.find(item => item.id === `deliver-${cargo.id}`); if (task) { task.status = 'queued'; task.output = null; }
      }
      worldChanged('world.target-moved', { target: clone(point) });
    },
    removeCargo(id) {
      if (!canEditWorld()) return;
      const index = state.world.cargo.findIndex(item => item.id === id); if (index < 0) return;
      state.world.cargo.splice(index, 1); if (state.world.carrying === id) state.world.carrying = null;
      worldChanged('world.cargo-removed', { cargoId: id });
    },
    setPriority(id, priority) {
      if (!canEditWorld() || !Number.isInteger(priority) || priority < 0 || priority > 9) return;
      const cargo = state.world.cargo.find(item => item.id === id && !item.delivered); if (!cargo || cargo.priority === priority) return;
      if (priorityChanges >= 6) { state.message = '本次最多允许六次优先级调整，请先完成或重置任务。'; emit('priority.limit', { limit: 6 }); return; }
      priorityChanges += 1; cargo.priority = priority; worldChanged('world.priority-changed', { cargoId: id, priority, changes: priorityChanges });
    },
    reset(seed) {
      const goal = defaultGoal(state.goal.preset); goal.seed = seed !== undefined && Number.isSafeInteger(seed) && seed >= 0 && seed <= 2_147_483_647 ? seed : state.goal.seed;
      fault = 'none'; begin(goal, false);
    },
    exportRecording() { return buildRecording(state.goal, trace); },
  };
  return runtime;
}
