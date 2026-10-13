import { z } from 'zod';
import { clone, sourceKey } from './identity';
import { feasiblePath } from './planner';
import type { DominionRuntime } from './runtime';
import type { CommandResult, DominionSnapshot } from './types';

const id = z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/);
const whole = (min: number, max: number) => z.number().int().min(min).max(max);
export const missionSuggestionSchema = z.object({
  kind: z.enum(['supply', 'relay', 'rescue', 'science']),
  targetId: id.optional(), quantity: whole(1, 6).optional(), deadline: whole(5, 500).optional(),
}).strict();
export const plannerProposalSchema = z.object({
  schemaVersion: z.literal(4), sessionId: id, worldVersion: whole(1, 1_000_000),
  sourceKey: z.string().min(1).max(200), summary: z.string().min(1).max(1500),
  command: missionSuggestionSchema.extend({ type: z.literal('add-mission') }).strict(),
}).strict();
const requestSchema = z.object({ requestId: id, goal: z.string().min(1).max(4000), mission: missionSuggestionSchema.optional() }).strict();
const approvalSchema = z.object({ proposalId: id, sessionId: id, worldVersion: whole(1, 1_000_000), sourceKey: z.string().min(1).max(200), approved: z.boolean() }).strict();

export type MissionSuggestion = z.infer<typeof missionSuggestionSchema>;
export type PlannerProposal = z.infer<typeof plannerProposalSchema>;
export type PlannerRequest = z.infer<typeof requestSchema>;
export type PlannerApproval = z.infer<typeof approvalSchema>;
export type PlannerMode = 'test-double' | 'model-assisted';
export interface PlannerToolResult { tool: string; input: unknown; output: unknown; sources: string[]; durationMs: number }
export interface PlannerContext {
  readonly requestId: string;
  readonly mode: PlannerMode;
  readonly provider: string | null;
  readonly model: string | null;
  readonly maxCostMicrousd: number;
  readonly goal: string;
  readonly mission: MissionSuggestion;
  readonly source: Readonly<{ sessionId: string; worldVersion: number; sourceKey: string }>;
  readonly signal: AbortSignal;
  /** Whitelisted synchronous, read-only tools. Never accepts an execution tool or URL. */
  tool(name: string, input: unknown): unknown;
}
/** Trusted dependency seam, not a sandbox for arbitrary JavaScript. No provider SDK is implemented. */
export interface PlannerCaller {
  kind: 'test-double' | 'live-model';
  invoke(context: PlannerContext): Promise<{ proposal: unknown; costMicrousd?: number }>;
}
export interface ApprovedProposal extends PlannerProposal { proposalId: string; mode: PlannerMode; tools: PlannerToolResult[] }
export type PlanningResult = { status: 'awaiting-approval'; proposal: ApprovedProposal } | { status: 'failed' | 'cancelled'; code: string; message: string };
export interface PlannerAudit { seq: number; type: string; requestId: string | null; code: string | null; mode: PlannerMode; durationMs: number }

class PlannerError extends Error {
  constructor(readonly code: string, message = code) { super(message); }
}
function stop(code: string): never { throw new PlannerError(code); }
const serverSettings = z.object({
  environment: z.literal('server'), authorized: z.literal(true), authorizationId: id,
  provider: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/),
  model: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,119}$/).refine(value => !value.includes('://')),
  perCallLimitMicrousd: whole(1, 1_000_000_000), dailyLimitMicrousd: whole(1, 1_000_000_000),
}).strict().refine(s => s.dailyLimitMicrousd >= s.perCallLimitMicrousd);
export type ServerPlannerSettings = z.infer<typeof serverSettings>;
export interface ServerPlannerContext { readonly kind: 'server-planner-context'; readonly provider: string; readonly model: string }
interface BudgetDay { used: number; settled: number; calls: number }
interface ServerPolicy { settings: ServerPlannerSettings; now: () => number; lastDay: string; days: Map<string, BudgetDay>; requests: Set<string>; inFlight: number }
const policies = new WeakMap<ServerPlannerContext, ServerPolicy>();
function requireServer() {
  if (typeof window !== 'undefined' || typeof process === 'undefined' || !process.versions?.node) stop('SERVER_CONTEXT_REQUIRED');
}
/** Server composition only: reuse one context per authorized budget principal, never create per HTTP request.
 * Authorization comes from the host, not model/user text. This in-memory policy is not durable billing;
 * a public deployment must persist its ledger before enabling a real provider. No secrets are accepted. */
export function createServerPlannerContext(settings: ServerPlannerSettings, now: () => number = Date.now): ServerPlannerContext {
  requireServer();
  const parsed = serverSettings.safeParse(settings);
  if (!parsed.success) stop('INVALID_SERVER_POLICY');
  const context: ServerPlannerContext = Object.freeze({ kind: 'server-planner-context', provider: parsed.data.provider, model: parsed.data.model });
  policies.set(context, { settings: parsed.data, now, lastDay: '', days: new Map(), requests: new Set(), inFlight: 0 });
  return context;
}
function policyFor(context: ServerPlannerContext | undefined): ServerPolicy {
  requireServer();
  const policy = context && policies.get(context);
  if (!policy) stop('SERVER_CONTEXT_REQUIRED');
  return policy;
}
function budgetDay(policy: ServerPolicy) {
  const timestamp = policy.now();
  if (!Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) stop('INVALID_BUDGET_CLOCK');
  const day = new Date(timestamp).toISOString().slice(0, 10);
  if (day < policy.lastDay) stop('BUDGET_CLOCK_REGRESSION');
  policy.lastDay = day;
  let record = policy.days.get(day);
  if (!record) {
    record = { used: 0, settled: 0, calls: 0 }; policy.days.set(day, record);
    // Retain request deduplication for the entire bounded server context lifetime.
    while (policy.days.size > 2) policy.days.delete(policy.days.keys().next().value!);
  }
  return { day, record };
}
export function inspectPlannerBudget(context: ServerPlannerContext) {
  const policy = policyFor(context), { day, record } = budgetDay(policy);
  return { utcDay: day, reservedOrSpentMicrousd: record.used, settledMicrousd: record.settled, calls: record.calls, inFlight: policy.inFlight, retainedRequests: policy.requests.size };
}
function reserveCall(policy: ServerPolicy, key: string) {
  if (policy.inFlight >= 1) stop('MODEL_CONCURRENCY_LIMIT');
  if (policy.requests.has(key)) stop('DUPLICATE_MODEL_REQUEST');
  if (policy.requests.size >= 512) stop('BUDGET_HISTORY_LIMIT');
  const { record } = budgetDay(policy), amount = policy.settings.perCallLimitMicrousd;
  if (record.used + amount > policy.settings.dailyLimitMicrousd) stop('DAILY_BUDGET_EXHAUSTED');
  record.used += amount; record.calls++; policy.requests.add(key); policy.inFlight++;
  return {
    amount,
    settled: false,
    finish() { policy.inFlight--; },
    settle(actual: unknown) {
      if (!Number.isSafeInteger(actual) || Number(actual) < 0 || Number(actual) > 1_000_000_000) stop('INVALID_PROVIDER_COST');
      record.used += Number(actual) - amount; record.settled += Number(actual); this.settled = true;
      if (Number(actual) > amount) stop('PROVIDER_BUDGET_OVERRUN');
    },
  };
}

/** Fixed structured-task substitute. Goal prose is inert data, not interpreted instructions. */
export const deterministicPlannerDouble: PlannerCaller = {
  kind: 'test-double',
  async invoke(context) {
    context.tool('read-world', {});
    context.tool('query-resources', { stationId: 'forge' });
    const suggestion = context.tool('suggest-mission', context.mission) as { command: PlannerProposal['command'] };
    return { proposal: { schemaVersion: 4, ...context.source, summary: '测试替身按显式任务参数生成草案；未调用真实模型，目标文本仅作为数据。', command: suggestion.command }, costMicrousd: 0 };
  },
};

const toolSchemas = {
  'read-world': z.object({}).strict(),
  'query-resources': z.object({ stationId: id }).strict(),
  'estimate-route': z.object({ shipId: id, targetId: id }).strict(),
  'suggest-mission': missionSuggestionSchema,
};
function suggest(world: DominionSnapshot, input: MissionSuggestion) {
  const target = input.targetId;
  if (target && !(input.kind === 'rescue' ? world.ships.some(s => s.id === target) : world.stations.some(s => s.id === target && (input.kind !== 'science' || s.kind === 'sample')))) stop('UNKNOWN_TASK_TARGET');
  // These are advisory facts, not a reservation or a promise of completion.
  return { command: { type: 'add-mission' as const, ...input }, activeMissions: world.missions.filter(m => !['completed', 'cancelled', 'failed'].includes(m.status)).length, requiresApproval: true, executionAuthority: 'runtime.dispatch' };
}
function executeReadTool(world: DominionSnapshot, name: keyof typeof toolSchemas, input: unknown) {
  const parsed = toolSchemas[name].safeParse(input);
  if (!parsed.success) stop('INVALID_TOOL_INPUT');
  if (name === 'read-world') return {
    sessionId: world.sessionId, worldVersion: world.worldVersion, tick: world.tick, status: world.status,
    ships: world.ships.map(s => ({ id: s.id, role: s.role, nodeId: s.nodeId, transit: s.transit, cargo: s.cargo, capacity: s.capacity, energy: s.energy, missionId: s.missionId })),
    stations: world.stations.map(s => ({ id: s.id, label: s.label, kind: s.kind, dockCapacity: s.dockCapacity, blockedBerths: s.blockedBerths })),
    missions: world.missions.map(m => ({ id: m.id, kind: m.kind, status: m.status, attempt: m.attempt })),
    discoveries: world.discoveries,
    // Future fault schedules and undiscovered findings are intentionally absent.
  };
  if (name === 'query-resources') {
    const station = world.stations.find(s => s.id === (parsed.data as { stationId: string }).stationId);
    if (!station) stop('UNKNOWN_STATION');
    return { stationId: station.id, stock: station.stock, reserved: station.reserved };
  }
  if (name === 'estimate-route') {
    const request = parsed.data as { shipId: string; targetId: string };
    const ship = world.ships.find(s => s.id === request.shipId);
    if (!ship || !world.stations.some(s => s.id === request.targetId)) stop('UNKNOWN_ROUTE_ENTITY');
    if (ship.transit || ship.disabled) stop('SHIP_NOT_AVAILABLE_AT_NODE');
    return { shipId: ship.id, targetId: request.targetId, path: feasiblePath(world, ship, ship.nodeId, request.targetId), reservation: false };
  }
  return suggest(world, parsed.data as MissionSuggestion);
}

export interface PlannerAdapterOptions {
  runtime: Pick<DominionRuntime, 'snapshot' | 'dispatch'>;
  caller?: PlannerCaller;
  serverContext?: ServerPlannerContext;
  maxTools?: number;
  timeoutMs?: number;
  approvalTtlMs?: number;
}

/** One coordinator + read-only tools. No Shell/SQL/filesystem/URL tools or model-driven coordinates. */
export function createPlannerAdapter(options: PlannerAdapterOptions) {
  const caller = options.caller ?? deterministicPlannerDouble;
  if (!['test-double', 'live-model'].includes(caller.kind) || typeof caller.invoke !== 'function') stop('INVALID_CALLER');
  const mode: PlannerMode = caller.kind === 'live-model' ? 'model-assisted' : 'test-double';
  const maxTools = whole(1, 16).parse(options.maxTools ?? 8);
  const timeoutMs = whole(10, 30_000).parse(options.timeoutMs ?? 5000);
  const approvalTtlMs = whole(10, 300_000).parse(options.approvalTtlMs ?? 60_000);
  const runtime = options.runtime;
  const adapterId = globalThis.crypto.randomUUID();
  let epoch = 0, outstanding = 0, disposed = false, sequence = 0;
  let active: { id: string; controller: AbortController } | undefined;
  let draft: { proposal: ApprovedProposal; expiresAt: number; signal?: AbortSignal } | undefined;
  let state: PlanningResult | { status: 'idle' | 'planning' | 'approved' | 'rejected'; mode: PlannerMode } = { status: 'idle', mode };
  const audits: PlannerAudit[] = [];
  const requests = new Map<string, { fingerprint: string; promise: Promise<PlanningResult> }>();
  const approvals = new Map<string, { fingerprint: string; result: CommandResult }>();
  function audit(type: string, requestId: string | null, code: string | null = null, started = performance.now()) {
    audits.push({ seq: ++sequence, type, requestId, code, mode, durationMs: Math.max(0, performance.now() - started) });
    if (audits.length > 128) audits.shift();
  }
  function current(world: DominionSnapshot) {
    const now = runtime.snapshot;
    return now.status !== 'closed' && now.connected && now.sessionId === world.sessionId && now.worldVersion === world.worldVersion && sourceKey(now) === sourceKey(world);
  }
  function cancel(code = 'CANCELLED') {
    epoch++; draft = undefined;
    const prior = active; active = undefined;
    prior?.controller.abort(new PlannerError(code));
    state = { status: 'cancelled', code, message: code };
    audit('planning.cancelled', prior?.id ?? null, code);
  }
  function plan(input: PlannerRequest, signal?: AbortSignal): Promise<PlanningResult> {
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return Promise.resolve({ status: 'failed', code: 'INVALID_REQUEST', message: 'INVALID_REQUEST' });
    const request = parsed.data, world = runtime.snapshot;
    if (disposed || signal?.aborted) return Promise.resolve({ status: 'cancelled', code: disposed ? 'DISPOSED' : 'CANCELLED', message: '未开始调用' });
    const fingerprint = JSON.stringify({ request, sourceKey: sourceKey(world) });
    const key = `${world.sessionId}/${request.requestId}`;
    const previous = requests.get(key);
    if (previous) return previous.fingerprint === fingerprint ? previous.promise : Promise.resolve({ status: 'failed', code: 'REQUEST_ID_CONFLICT', message: 'REQUEST_ID_CONFLICT' });
    if (active || outstanding) return Promise.resolve({ status: 'failed', code: 'PLANNER_BUSY', message: '等待上一调用完成或确认取消；不并发发起新调用。' });
    if (requests.size >= 128) return Promise.resolve({ status: 'failed', code: 'REQUEST_HISTORY_LIMIT', message: '请建立新的受控适配器。' });
    const generation = ++epoch, controller = new AbortController(), started = performance.now();
    active = { id: request.requestId, controller }; draft = undefined; state = { status: 'planning', mode };
    const tools: PlannerToolResult[] = [];
    let toolCount = 0, toolFailure: PlannerError | undefined, toolSessionOpen = true;
    const check = () => {
      if (controller.signal.aborted || generation !== epoch || disposed) stop('CANCELLED');
      if (performance.now() - started > timeoutMs) stop('TIMEOUT');
      if (!current(world)) stop('STALE_WORLD');
      if (toolFailure) throw toolFailure;
    };
    let reservation: ReturnType<typeof reserveCall> | undefined;
    const promise = (async (): Promise<PlanningResult> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => controller.abort(new PlannerError('CANCELLED'));
      let removeAbort = () => {};
      try {
        check();
        const policy = mode === 'model-assisted' ? policyFor(options.serverContext) : undefined;
        if (policy) reservation = reserveCall(policy, key);
        signal?.addEventListener('abort', onAbort, { once: true });
        const stopped = new Promise<never>((_resolve, reject) => {
          const listener = () => reject(controller.signal.reason instanceof PlannerError ? controller.signal.reason : new PlannerError('CANCELLED'));
          controller.signal.addEventListener('abort', listener, { once: true });
          removeAbort = () => controller.signal.removeEventListener('abort', listener);
        });
        timer = setTimeout(() => controller.abort(new PlannerError('TIMEOUT')), timeoutMs);
        const context: PlannerContext = Object.freeze({
          requestId: request.requestId, mode, goal: request.goal,
          mission: Object.freeze(clone(request.mission ?? { kind: 'supply' as const, targetId: 'ice', quantity: 2 })),
          source: Object.freeze({ sessionId: world.sessionId, worldVersion: world.worldVersion, sourceKey: sourceKey(world) }),
          provider: policy?.settings.provider ?? null, model: policy?.settings.model ?? null,
          maxCostMicrousd: reservation?.amount ?? 0, signal: controller.signal,
          tool(name: string, toolInput: unknown) {
            try {
              if (!toolSessionOpen) stop('CALL_COMPLETED');
              check();
              if (++toolCount > maxTools) stop('TOOL_STEP_LIMIT');
              if (!Object.hasOwn(toolSchemas, name)) stop('TOOL_NOT_ALLOWED');
              const toolStart = performance.now();
              const output = clone(executeReadTool(world, name as keyof typeof toolSchemas, toolInput));
              tools.push({ tool: name, input: clone(toolInput), output: clone(output), sources: [`session:${world.sessionId}`, `world:${world.worldVersion}`, `tick:${world.tick}`, world.plannerVersion], durationMs: Math.max(0, performance.now() - toolStart) });
              return output;
            } catch (error) {
              toolFailure = error instanceof PlannerError ? error : new PlannerError('TOOL_FAILED');
              throw toolFailure;
            }
          },
        });
        outstanding++;
        // Keep the concurrency slot until the actual caller settles, even if it ignores abort.
        const invocation = Promise.resolve().then(() => { check(); return caller.invoke(context); }).finally(() => { outstanding--; reservation?.finish(); });
        const response = await Promise.race([invocation, stopped]);
        check();
        if (!response || typeof response !== 'object') stop('INVALID_MODEL_RESPONSE');
        if (reservation) reservation.settle(response.costMicrousd);
        const text = typeof response.proposal === 'string' ? response.proposal : JSON.stringify(response.proposal);
        if (typeof text !== 'string' || text.length > 64 * 1024 || new TextEncoder().encode(text).byteLength > 64 * 1024) stop('PROPOSAL_SIZE_LIMIT');
        let value: unknown;
        try { value = JSON.parse(text); } catch { stop('INVALID_PROPOSAL'); }
        const validated = plannerProposalSchema.safeParse(value);
        if (!validated.success) stop('INVALID_PROPOSAL');
        const proposal = validated.data;
        if (proposal.sessionId !== world.sessionId || proposal.worldVersion !== world.worldVersion || proposal.sourceKey !== sourceKey(world)) stop('PROPOSAL_SOURCE_MISMATCH');
        suggest(world, proposal.command);
        check();
        const approved: ApprovedProposal = { ...proposal, proposalId: `proposal:${adapterId}:${generation}`, mode, tools };
        draft = { proposal: clone(approved), expiresAt: performance.now() + approvalTtlMs, signal };
        state = { status: 'awaiting-approval', proposal: clone(approved) };
        audit('proposal.created', request.requestId, null, started);
        return clone(state);
      } catch (error) {
        const code = error instanceof PlannerError ? error.code : 'PLANNER_FAILED';
        const result: PlanningResult = { status: code === 'CANCELLED' || code === 'DISPOSED' ? 'cancelled' : 'failed', code, message: code };
        if (generation === epoch && !disposed) { state = result; draft = undefined; }
        audit('planning.stopped', request.requestId, code, started);
        // A failed, timed-out or cancelled call retains its reserved ceiling unless actual cost was known.
        return result;
      } finally {
        toolSessionOpen = false;
        if (timer) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort); removeAbort();
        if (active?.controller === controller) active = undefined;
      }
    })();
    requests.set(key, { fingerprint, promise });
    return promise;
  }
  function approve(input: PlannerApproval): CommandResult {
    const parsed = approvalSchema.safeParse(input);
    const failure = (message: string): CommandResult => ({ accepted: false, duplicate: false, message });
    if (!parsed.success) return failure('INVALID_APPROVAL');
    const approval = parsed.data, fingerprint = JSON.stringify(approval);
    const old = approvals.get(approval.proposalId);
    if (old) return old.fingerprint === fingerprint ? { ...old.result, duplicate: true } : failure('APPROVAL_CONFLICT');
    if (disposed || !draft || draft.proposal.proposalId !== approval.proposalId) return failure('NO_PENDING_PROPOSAL');
    const proposal = draft.proposal, now = runtime.snapshot;
    if (approval.sessionId !== proposal.sessionId || approval.worldVersion !== proposal.worldVersion || approval.sourceKey !== proposal.sourceKey) return failure('APPROVAL_SOURCE_MISMATCH');
    if (!approval.approved) { draft = undefined; state = { status: 'rejected', mode }; audit('proposal.rejected', null); return failure('USER_REJECTED'); }
    if (draft.signal?.aborted) { cancel(); return failure('CANCELLED'); }
    if (performance.now() > draft.expiresAt || now.status === 'closed' || !now.connected || now.sessionId !== proposal.sessionId || now.worldVersion !== proposal.worldVersion || sourceKey(now) !== proposal.sourceKey) {
      draft = undefined; state = { status: 'failed', code: 'STALE_APPROVAL', message: '世界变化或确认超时，请重新规划。' }; return failure('STALE_APPROVAL');
    }
    // One high-level command, not an array of partially committed model actions. Runtime revalidates everything.
    let result: CommandResult;
    try { result = runtime.dispatch(clone(proposal.command), `planner:${proposal.proposalId}`); }
    catch { result = failure('RUNTIME_REJECTED'); }
    approvals.set(proposal.proposalId, { fingerprint, result: clone(result) });
    draft = undefined; state = result.accepted ? { status: 'approved', mode } : { status: 'failed', code: 'RUNTIME_REJECTED', message: result.message };
    audit(result.accepted ? 'proposal.committed' : 'proposal.execution-rejected', null);
    return clone(result);
  }
  return {
    mode,
    get state() { return clone(state); },
    get events() { return clone(audits); },
    plan, approve, cancel,
    dispose() { cancel('DISPOSED'); disposed = true; },
  };
}
