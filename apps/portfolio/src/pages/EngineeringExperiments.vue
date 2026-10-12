<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { archiveIntent, ExperimentClient, ExperimentError, newKey, orderIntent, parseIntent, type Cart, type DemoAddress, type Operation, type Order, type OrderIntent, type Quote, type Race } from '../domain/experiments/client';
import { ROW_COUNT, ROW_HEIGHT, rowAt, visibleWindow, WorkerGeneration, type SortOrder } from '../domain/experiments/list';

type Scenario = 'race' | 'idempotency' | 'list';
const scenario = ref<Scenario>('race');
const scenarios = [{ id: 'race', number: '01', name: '一件库存，两位竞争者', detail: '真实 API · 事务约束' }, { id: 'idempotency', number: '02', name: '响应消失，订单还在吗', detail: '真实 API · 故障注入' }, { id: 'list', number: '03', name: '十万行，只画眼前这些', detail: '本地 Worker · 虚拟列表' }] as const;
const api = new ExperimentClient();
const storageKey = 'chenxi-engineering-experiments-v2';
const intentKey = `${storageKey}-order`;
const archiveKey = `${storageKey}-archive`;
const connected = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('API 实验尚未连接。业务数据为模拟；点击连接后才会向当前站点的演示服务发送请求。');
const serverTime = ref('');
const pending = ref<OrderIntent | null>(null);
const race = ref<Race | null>(null);
const raceDuration = ref<number | null>(null);
const orderPhase = ref<'ready' | 'unknown' | 'confirmed'>('ready');
const orders = ref<Order[] | null>(null);
const operationState = ref('尚未查询');
const orderRequestCount = ref(0);
let requestGeneration = 0;
let controller: AbortController | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  api.token = sessionStorage.getItem(storageKey) ?? '';
  pending.value = parseIntent(sessionStorage.getItem(intentKey));
  if (pending.value) { orderPhase.value = 'unknown'; notice.value = '发现本标签页保留的订单请求。请连接服务，再查询原操作或原键重试；不会自动创建新订单。'; }
} catch { error.value = '本浏览器未允许会话存储。订单故障实验必须先保存原请求，否则不会提交。'; }
const orderPhaseLabel = computed(() => ({ ready: '尚未提交', unknown: '结果未知 · 保留原请求', confirmed: '已从服务核对' })[orderPhase.value]);
const unresolvedOrder = computed(() => pending.value !== null && orderPhase.value === 'unknown');
const raceInvariant = computed(() => race.value?.attempts.length === 2 && race.value.stock === 0 && race.value.attempts.filter(item => item.success).length === 1 && race.value.winner !== null);
const formatTime = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
function cancelRequest() { requestGeneration++; controller?.abort(); clearTimeout(timeout); busy.value = false; }
function fail(reason: unknown) {
  if (reason instanceof ExperimentError && reason.status === 401) connected.value = false;
  error.value = reason instanceof Error ? reason.message : '请求未完成。';
}
async function run(action: (signal: AbortSignal, ensureCurrent: () => void) => Promise<void>) {
  if (busy.value) return;
  cancelRequest(); const generation = requestGeneration;
  controller = new AbortController(); const signal = controller.signal;
  timeout = setTimeout(() => controller?.abort(), 15_000);
  busy.value = true; error.value = '';
  const ensureCurrent = () => { if (signal.aborted || generation !== requestGeneration) throw new DOMException('请求已取消', 'AbortError'); };
  try { await action(signal, ensureCurrent); }
  catch (reason) { if (generation === requestGeneration) fail(signal.aborted ? new Error('请求超时，结果可能尚未确认。订单原请求仍保留，请查询操作后再重试。') : reason); }
  finally { if (generation === requestGeneration) { busy.value = false; clearTimeout(timeout); } }
}
function connect() {
  void run(async (signal, current) => {
    if (!api.token) { const result = await api.connect(signal, pending.value !== null); current(); sessionStorage.setItem(storageKey, result.data.token); }
    const result = await api.request<Order[]>('/orders', { signal }); current();
    orders.value = result.data; serverTime.value = result.serverTime; connected.value = true;
    notice.value = '已验证当前标签页的独立服务会话。库存与订单保存在演示服务中；不是实际商城交易。';
  });
}
function freshSession() {
  if (busy.value) return;
  const hadPending = pending.value !== null;
  try {
    if (pending.value) archiveIntent(sessionStorage, archiveKey, pending.value);
    sessionStorage.removeItem(storageKey); sessionStorage.removeItem(intentKey);
  } catch (reason) { fail(reason); return; }
  api.token = ''; connected.value = false; pending.value = null; orders.value = null; race.value = null; orderPhase.value = 'ready'; operationState.value = '尚未查询';
  error.value = '';
  notice.value = `${hadPending ? '原键与请求体已归档至本标签页独立缓存（最多 5 条、不含令牌），不能用于新身份重放。' : ''}已放弃旧恢复入口；没有删除旧服务记录或其他会话。请连接新演示会话。`;
}
function runRace() {
  if (!connected.value) return;
  void run(async (signal, current) => {
    race.value = null; raceDuration.value = null;
    const created = await api.request<Race>('/experiments/races', { method: 'POST', body: {}, key: newKey(), signal }); current();
    const started = performance.now();
    const attempts = await Promise.allSettled((['A', 'B'] as const).map(actor => api.request<Race>(`/experiments/races/${created.data.id}/claim`, { method: 'POST', body: { actor }, key: newKey(), signal })));
    current();
    const final = await api.request<Race>(`/experiments/races/${created.data.id}`, { signal }); current();
    race.value = final.data; raceDuration.value = performance.now() - started; serverTime.value = final.serverTime;
    const failed = attempts.filter(item => item.status === 'rejected').length;
    notice.value = failed ? `${failed} 个响应未成功收到；下方显示 GET 读取的实际终态，不能据此宣称两次请求都完成。` : '两个请求已并发发出并收到响应；下方终态来自随后独立的 GET 查询。单次样本不代表吞吐量基准。';
  });
}
function loseOrderResponse() {
  if (!connected.value || pending.value) return;
  void run(async (signal, current) => {
    const initialOrders = await api.request<Order[]>('/orders', { signal }); current();
    if (initialOrders.data.length) throw new Error('本会话已有订单。请先使用“重置此实验会话”，再开始新的单订单实验。');
    const initialCart = await api.request<Cart>('/cart', { signal }); current();
    let cart = initialCart.data;
    if (!cart.items.length) { const added = await api.request<Cart>('/cart/items', { method: 'POST', key: newKey(), body: { skuId: 'book-clay', quantity: 2, cartVersion: cart.version }, signal }); current(); cart = added.data; }
    if (cart.items.length !== 1 || cart.items[0].skuId !== 'book-clay' || cart.items[0].quantity !== 2 || !cart.items[0].selected) throw new Error('演示购物车与预期不同。请重置此实验会话后重试。');
    const addresses = await api.request<DemoAddress[]>('/demo-addresses', { signal }); current();
    if (!addresses.data[0]) throw new Error('服务没有返回虚拟地址。');
    const quote = await api.request<Quote>('/checkout/quotes', { method: 'POST', key: newKey(), body: { cartVersion: cart.version, addressId: addresses.data[0].id }, signal }); current();
    const intent = orderIntent(quote.data.id);
    // Persist BEFORE mutation. A storage failure must prevent an unrecoverable order request.
    sessionStorage.setItem(intentKey, JSON.stringify(intent));
    pending.value = intent; orderPhase.value = 'unknown'; operationState.value = '尚未查询'; orders.value = null;
    notice.value = '原键与原内容已经保存。提交结果不会进入订单视图，随后必须主动核对。';
    orderRequestCount.value++;
    await api.request<unknown>('/orders', { method: 'POST', body: intent.body, key: intent.key, signal }); current();
    // Fault injection: deliberately discard the received payload; do not infer the business result in the UI.
    notice.value = '客户端故障已注入：收到的订单响应被主动丢弃，订单视图保持“结果未知”。这不是实际断网；请查询操作或用原键重试。';
  });
}
function recoverOrder(retry: boolean) {
  if (!connected.value || !pending.value) return;
  const intent = { key: pending.value.key, body: { quoteId: pending.value.body.quoteId }, createdAt: pending.value.createdAt };
  void run(async (signal, current) => {
    if (retry) { orderRequestCount.value++; await api.request<Order>('/orders', { method: 'POST', key: intent.key, body: intent.body, signal }); current(); }
    const operation = await api.request<Operation>(`/operations/${encodeURIComponent(intent.key)}?operation=orders.create`, { signal }); current();
    const result = await api.request<Order[]>('/orders', { signal }); current();
    operationState.value = `${operation.data.operation} / ${operation.data.status}`;
    orders.value = result.data; serverTime.value = result.serverTime; orderPhase.value = 'confirmed';
    notice.value = retry ? '已重试同一幂等键与原始请求体，并重新查询操作和订单列表。请核对下方实际订单数量。' : '已从服务查询原操作，再读取当前订单列表。查询失败或未找到不等于此前请求一定没有执行。';
  });
}
function resetSession() {
  if (!connected.value) return;
  if (unresolvedOrder.value) { error.value = '订单结果仍未知，不能清除服务操作证据。请先查询恢复，或明确归档并放弃旧会话。'; return; }
  void run(async (signal, current) => {
    await api.request('/demo/reset', { method: 'POST', body: {}, key: newKey(), signal }); current();
    const result = await api.request<Order[]>('/orders', { signal }); current();
    sessionStorage.removeItem(intentKey); pending.value = null; orders.value = result.data; race.value = null; raceDuration.value = null; orderPhase.value = 'ready'; operationState.value = '尚未查询'; orderRequestCount.value = 0;
    notice.value = '已重置当前实验会话，并读取空订单列表。商城、其他标签页和其他用户的独立会话没有被操作。';
  });
}

const query = ref('');
const sort = ref<SortOrder>('id');
const indices = shallowRef<Uint32Array>(new Uint32Array());
const processing = ref(false);
const workerError = ref('');
const workerDuration = ref<number | null>(null);
const totalDuration = ref<number | null>(null);
const generationLabel = ref(0);
const scrollTop = ref(0);
const listElement = ref<HTMLElement>();
const gate = new WorkerGeneration();
let debounce: ReturnType<typeof setTimeout> | undefined;
const virtualWindow = computed(() => visibleWindow(indices.value.length, scrollTop.value, 440));
const rendered = computed(() => Array.from(indices.value.slice(virtualWindow.value.start, virtualWindow.value.end), (index, offset) => ({ ...rowAt(index), top: (virtualWindow.value.start + offset) * ROW_HEIGHT })));
function cancelWorker() { clearTimeout(debounce); gate.cancel(); processing.value = false; }
function computeList() {
  if (scenario.value !== 'list') return;
  cancelWorker(); workerError.value = ''; processing.value = true; workerDuration.value = null; totalDuration.value = null; indices.value = new Uint32Array(); scrollTop.value = 0;
  if (listElement.value) listElement.value.scrollTop = 0;
  const started = performance.now();
  try {
    const worker = new Worker(new URL('../domain/experiments/list.worker.ts', import.meta.url), { type: 'module' });
    const generation = gate.start(worker); generationLabel.value = generation;
    worker.onmessage = (event: MessageEvent<{ generation: number; indices: Uint32Array; duration: number }>) => {
      if (!gate.accepts(generation) || event.data.generation !== generation || scenario.value !== 'list') return;
      indices.value = event.data.indices; workerDuration.value = event.data.duration; totalDuration.value = performance.now() - started; processing.value = false; worker.terminate();
    };
    worker.onerror = () => { if (gate.accepts(generation)) { processing.value = false; workerError.value = 'Worker 执行失败，未产生性能结果。'; worker.terminate(); } };
    worker.postMessage({ generation, query: query.value, sort: sort.value });
  } catch (reason) { processing.value = false; workerError.value = reason instanceof Error ? reason.message : 'Worker 不可用。'; }
}
watch([query, sort], () => { cancelWorker(); indices.value = new Uint32Array(); workerDuration.value = null; totalDuration.value = null; if (scenario.value === 'list') { processing.value = true; debounce = setTimeout(computeList, 140); } });
function changeScenario(next: Scenario) { cancelRequest(); cancelWorker(); scenario.value = next; error.value = ''; if (next === 'list') computeList(); }
onBeforeUnmount(() => { cancelRequest(); cancelWorker(); });
</script>

<template>
  <div class="section-wrap page-shell experiments-page">
    <p class="eyebrow">ENGINEERING / UNDER THE SURFACE</p>
    <div class="experiment-heading"><div><h1 class="page-title">让边界，<br><span>可以亲手验证。</span></h1><p class="page-intro">故意并发、故意丢失响应、故意放大数据。看一个界面如何解释失败，又怎样确认结果。</p></div><div class="boundary"><strong>两种执行环境，一条证据边界</strong><p>前两项需要当前站点可达的演示 API；第三项在你的浏览器中执行。所有商品和记录均为合成数据，不发生真实付款。</p></div></div>
    <nav class="scenario-nav" aria-label="选择工程实验"><button v-for="item in scenarios" :key="item.id" :aria-pressed="scenario === item.id" @click="changeScenario(item.id)"><span>{{ item.number }}</span><strong>{{ item.name }}</strong><small>{{ item.detail }}</small></button></nav>

    <template v-if="scenario !== 'list'">
      <section class="connection-bar" aria-label="演示服务连接"><div><span class="connection-dot" :class="{ connected }"></span><strong data-testid="experiment-connection">{{ connected ? '真实 API · 当前会话已验证' : '尚未验证服务连接' }}</strong><p>独立的 24 小时演示会话；令牌不展示。{{ serverTime ? `最近服务时钟 ${formatTime(serverTime)}（北京时间）` : '静态 Pages 不包含后端服务。' }}</p></div><button class="button secondary" :disabled="busy" @click="connect">{{ connected ? '重新核对连接' : '连接演示服务' }}</button></section>
      <p v-if="error" class="feedback error" role="alert">{{ error }}</p><p class="feedback" role="status">{{ notice }}</p>
      <section v-if="scenario === 'race'" class="experiment-panel" :aria-busy="busy" aria-labelledby="race-title">
        <div class="panel-heading"><div><p class="eyebrow">CONCURRENT REQUESTS / ATOMIC DECISION</p><h2 id="race-title">同一件库存，只能有一位赢家。</h2></div><span class="mode-pill">服务端事务</span></div>
        <p>建立库存为 1 的独立竞态样本，用两个不同操作键并发提交 A / B。获胜顺序由服务实际处理顺序决定；前端不预先指定赢家。</p>
        <div class="race-track"><article v-for="actor in ['A', 'B']" :key="actor"><span class="actor">{{ actor }}</span><strong>{{ race ? (race.attempts.find(attempt => attempt.actor === actor)?.success ? '获得库存' : race.attempts.some(attempt => attempt.actor === actor) ? '库存已被占用' : '尚无处理记录') : '等待请求' }}</strong><small>独立幂等键 · 同一会话库存池</small></article><div class="stock-core"><span>服务端剩余库存</span><b data-testid="race-stock">{{ race?.stock ?? '—' }}</b><small>{{ race ? `胜者 ${race.winner ?? '未确定'}` : '初始值将设为 1' }}</small></div></div>
        <div class="panel-actions"><button class="button primary" :disabled="!connected || busy" @click="runRace">{{ busy ? '服务正在处理…' : '并发争抢一件库存' }}</button><span v-if="raceDuration !== null">本机往返与终态查询 {{ raceDuration.toFixed(1) }} ms</span></div>
        <div v-if="race" class="result-box"><strong data-testid="race-invariant">{{ raceInvariant ? '终态核对：2 次尝试 / 1 次成功 / 库存 0' : '终态未满足完整样本条件，请检查请求结果。' }}</strong><p>本次 GET 样本 {{ race.id }}</p><ul><li v-for="(attempt, index) in race.attempts" :key="index">{{ index + 1 }} · {{ attempt.actor }} · {{ attempt.success ? '成功占用' : '约束拒绝' }} · {{ formatTime(attempt.at) }}</li></ul></div>
      </section>
      <section v-else class="experiment-panel" :aria-busy="busy" aria-labelledby="order-title">
        <div class="panel-heading"><div><p class="eyebrow">UNCERTAIN OUTCOME / SAME INTENT</p><h2 id="order-title">没看到成功，不等于没有成功。</h2></div><span class="mode-pill" data-testid="order-phase">{{ orderPhaseLabel }}</span></div>
        <p>流程为陶土手册 × 2 → 服务报价 → 创建订单。客户端保存原请求后，主动丢弃收到的订单响应。这个受控故障不会伪装成真实断网。</p>
        <ol class="order-steps"><li><b>01</b><span>先保存请求<br><small>同一个 key + quoteId</small></span></li><li><b>02</b><span>服务执行，响应丢弃<br><small>界面保持 unknown</small></span></li><li><b>03</b><span>查询或原键重试<br><small>读取实际订单数量</small></span></li></ol>
        <div class="panel-actions"><button class="button primary" :disabled="!connected || busy || !!pending" @click="loseOrderResponse">提交订单并丢弃响应</button><button class="button secondary" :disabled="!connected || busy || !pending" @click="recoverOrder(false)">查询原操作</button><button class="button secondary" :disabled="!connected || busy || !pending" @click="recoverOrder(true)">原键原内容重试</button></div>
        <div v-if="pending" class="intent-box"><strong>已保留的原始请求</strong><dl><div><dt>幂等键</dt><dd data-testid="order-intent-key">{{ pending.key }}</dd></div><div><dt>请求体</dt><dd><code>{{ JSON.stringify(pending.body) }}</code></dd></div><div><dt>恢复规则</dt><dd>刷新后仍保留；结果未明时不创建新键。操作查询未找到不代表此前请求一定未执行。</dd></div></dl></div>
        <div class="proof-grid"><div><span>当前操作查询</span><strong data-testid="operation-state">{{ operationState }}</strong></div><div><span>服务返回的当前会话订单数</span><strong data-testid="experiment-order-count">{{ orders === null ? '未查询' : orders.length }}</strong></div><div><span>本次页面生命周期的订单 POST 次数</span><strong>{{ orderRequestCount }}</strong></div></div>
        <ul v-if="orders?.length" class="order-results"><li v-for="order in orders" :key="order.id"><span>{{ order.id }}</span><strong>{{ order.status }}</strong><span>¥{{ (order.total / 100).toFixed(2) }} · {{ order.lines.reduce((sum, line) => sum + line.quantity, 0) }} 件</span></li></ul>
      </section>
      <div class="session-actions"><div><button class="button secondary" :disabled="!connected || busy || unresolvedOrder" @click="resetSession">重置此实验会话</button><p v-if="unresolvedOrder" class="measurement-note">原订单结果未知：先查询恢复，再重置。</p></div><details><summary>会话已过期或需要放弃恢复？</summary><p>明确放弃会先将原键与请求体归档到本标签页独立缓存（最多 5 条、不含令牌），再清除旧恢复入口。归档仅留作故障说明，不能使用新身份重放，也不代表撤销旧订单；不会清除旧服务记录或其他用户数据。</p><button class="button secondary" :disabled="busy" @click="freshSession">放弃旧恢复入口</button></details></div>
    </template>

    <section v-else class="experiment-panel list-panel" aria-labelledby="list-title">
      <div class="panel-heading"><div><p class="eyebrow">100,000 ROWS / SMALL DOM</p><h2 id="list-title">数据很多，界面不必一起拥挤。</h2></div><span class="mode-pill">本地合成 · Worker</span></div>
      <p>固定生成 {{ ROW_COUNT.toLocaleString() }} 条记录，真实搜索与数值排序在 Worker 中完成。只把结果索引传回主线程；旧任务会终止，过期代次也不能覆盖新结果。</p>
      <div class="list-tools"><label>搜索全部记录<input v-model="query" placeholder="试试 LAB-100000 或 基础设施" maxlength="80" data-testid="virtual-search"></label><label>排序<select v-model="sort"><option value="id">编号顺序</option><option value="value-asc">数值从小到大</option><option value="value-desc">数值从大到小</option></select></label><button class="button secondary" @click="computeList">重新测量</button></div>
      <div class="proof-grid list-metrics" aria-live="polite"><div><span>匹配 / 原始行数</span><strong data-testid="virtual-count">{{ processing ? '计算中…' : `${indices.length.toLocaleString()} / 100,000` }}</strong></div><div><span>当前渲染行数</span><strong data-testid="virtual-rendered">{{ rendered.length }}</strong></div><div><span>Worker 计算 / 含启动与传输</span><strong data-testid="virtual-timing">{{ workerDuration === null || totalDuration === null ? '尚无样本' : `${workerDuration.toFixed(1)} / ${totalDuration.toFixed(1)} ms` }}</strong></div></div>
      <p v-if="workerError" class="feedback error" role="alert">{{ workerError }}</p>
      <div class="virtual-header" aria-hidden="true"><span>记录编号 / 名称</span><span>合成类别</span><span>合成数值</span></div>
      <div ref="listElement" class="virtual-viewport" role="region" aria-label="十万行虚拟记录，可滚动浏览" tabindex="0" :aria-busy="processing" data-testid="virtual-viewport" @scroll="scrollTop = ($event.target as HTMLElement).scrollTop">
        <div v-if="!processing && !indices.length" class="empty-list">没有匹配记录。试试更短的关键词。</div>
        <div v-else class="virtual-spacer" role="list" :style="{ height: `${indices.length * ROW_HEIGHT}px` }"><div v-for="row in rendered" :key="row.index" role="listitem" :aria-posinset="virtualWindow.start + rendered.indexOf(row) + 1" :aria-setsize="indices.length" class="virtual-row" :style="{ transform: `translateY(${row.top}px)` }" data-testid="virtual-row"><span><b>{{ row.id }}</b><small>{{ row.label }}</small></span><span>{{ row.category }}</span><strong>{{ row.value.toLocaleString() }}</strong></div></div>
      </div>
      <p class="measurement-note">代次 {{ generationLabel }} · 可视区域 440 px · 行高 {{ ROW_HEIGHT }} px。数字来自当前机器本次运行，包含浏览器调度差异，不是预设基准或生产性能承诺。切换实验会停止 Worker。</p>
    </section>
    <div class="engineering-links"><RouterLink to="/labs/market-replay" class="text-link">继续验证事件前缀 ↗</RouterLink><RouterLink to="/labs/enterprise-flow" class="text-link">查看企业业务不变量 ↗</RouterLink></div>
  </div>
</template>

<style scoped>
.experiments-page{padding-bottom:80px}.experiment-heading{display:grid;grid-template-columns:1.5fr 1fr;gap:48px;align-items:end;margin-bottom:36px}.boundary{border-left:3px solid var(--accent);padding:12px 0 12px 20px}.boundary p{font-size:14px;margin-bottom:0}.scenario-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:32px 0}.scenario-nav button{background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:12px;padding:20px;text-align:left;display:grid;grid-template-columns:28px 1fr;gap:10px;cursor:pointer}.scenario-nav button[aria-pressed=true]{border-color:var(--green);background:var(--surface);box-shadow:inset 0 -3px var(--green)}.scenario-nav span{font-size:12px;color:var(--muted)}.scenario-nav small{grid-column:2;color:var(--muted);font-size:12px}.scenario-nav strong{font-size:15px}.connection-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px;border:1px solid var(--line);border-radius:12px}.connection-bar strong{font-size:14px}.connection-bar p{font-size:12px;margin:8px 0 0}.connection-dot{display:inline-block;width:8px;height:8px;background:var(--muted);border-radius:100%;margin-right:10px}.connection-dot.connected{background:var(--green)}.feedback{padding:14px 18px;background:var(--surface);font-size:13px;border-left:3px solid var(--green);line-height:1.8;margin:18px 0}.feedback.error{border-color:var(--accent)}.experiment-panel{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:30px}.panel-heading{display:flex;justify-content:space-between;align-items:start;gap:20px}.panel-heading .eyebrow{margin-bottom:12px}.panel-heading h2{font-size:28px;margin-bottom:18px}.mode-pill{flex-shrink:0;font-size:12px;border:1px solid var(--line);background:var(--surface);padding:8px 12px;border-radius:8px}.experiment-panel>p{font-size:14px;max-width:900px}.race-track{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin:28px 0}.race-track article,.stock-core{padding:24px;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}.race-track article:first-child{order:0}.race-track article:nth-child(2){order:2}.stock-core{order:1;background:var(--surface)}.actor{font-size:32px;font-weight:600;width:62px;height:62px;border-radius:50%;background:var(--surface);display:grid;place-items:center}.stock-core b{font-size:46px;font-variant-numeric:tabular-nums}.stock-core span,.race-track small{font-size:12px;color:var(--muted)}.panel-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:24px 0}.panel-actions>span{font-size:12px;color:var(--muted)}.result-box{padding:22px;background:var(--surface);border-radius:10px}.result-box>p{font-size:12px;overflow-wrap:anywhere}.result-box ul{font-size:13px;line-height:2;margin-bottom:0;padding-left:20px}.order-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:0;list-style:none;gap:18px;margin:28px 0}.order-steps li{display:flex;align-items:start;gap:14px;border-top:1px solid var(--line);padding-top:18px;font-size:14px}.order-steps b{font-size:13px;color:var(--muted)}.order-steps small{font-size:12px;color:var(--muted);line-height:2}.intent-box{border:1px dashed var(--line);border-radius:12px;padding:20px;overflow-wrap:anywhere}.intent-box>strong{font-size:14px}.intent-box dl{margin:16px 0 0}.intent-box dl>div{display:grid;grid-template-columns:80px 1fr;gap:12px;font-size:12px;line-height:1.8;margin:10px 0}.intent-box dt{color:var(--muted)}.intent-box dd{margin:0;min-width:0}.intent-box code{white-space:normal;overflow-wrap:anywhere}.proof-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:28px 0}.proof-grid>div{display:flex;flex-direction:column;gap:12px;min-width:0}.proof-grid span{font-size:12px;color:var(--muted)}.proof-grid strong{font-size:22px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.proof-grid>div:first-child strong{font-size:15px}.order-results{list-style:none;padding:0;margin:0}.order-results li{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;border-top:1px solid var(--line);padding:18px 0;font-size:12px;overflow-wrap:anywhere}.session-actions{display:flex;align-items:start;gap:24px;margin-top:24px}.session-actions details{font-size:13px;flex:1;max-width:700px;padding:10px}.session-actions summary{cursor:pointer}.session-actions details p{font-size:12px}.list-tools{display:flex;align-items:end;gap:16px;margin-top:26px}.list-tools label{display:flex;flex-direction:column;gap:8px;font-size:13px}.list-tools label:first-child{flex:1}.list-tools input,.list-tools select{border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:12px;min-height:46px;min-width:0}.list-metrics>div:first-child strong{font-size:22px}.virtual-header,.virtual-row{display:grid;grid-template-columns:1.4fr 1fr .6fr;gap:14px;align-items:center;padding:0 16px;font-size:12px}.virtual-header{background:var(--surface);height:40px;color:var(--muted);border:1px solid var(--line);border-bottom:0}.virtual-viewport{height:440px;overflow-y:auto;overscroll-behavior:contain;border:1px solid var(--line);contain:strict}.virtual-spacer{position:relative}.virtual-row{position:absolute;top:0;left:0;right:0;height:44px;border-bottom:1px solid var(--line);box-sizing:border-box}.virtual-row:nth-child(even){background:var(--surface)}.virtual-row span:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}.virtual-row b{font-size:11px}.virtual-row small{font-size:10px;color:var(--muted)}.virtual-row>strong,.virtual-header>span:last-child{text-align:right;font-variant-numeric:tabular-nums}.empty-list{padding:36px 20px;text-align:center;font-size:14px;color:var(--muted)}.measurement-note{font-size:12px!important;line-height:1.9;margin:18px 0 0}.engineering-links{display:flex;gap:24px;flex-wrap:wrap;margin-top:30px}.experiments-page button:disabled{opacity:.5;cursor:not-allowed}.experiments-page input:focus-visible,.experiments-page select:focus-visible,.virtual-viewport:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:950px){.experiment-heading{grid-template-columns:1fr;gap:20px}.scenario-nav button{padding:16px;grid-template-columns:1fr;gap:8px}.scenario-nav small{grid-column:1}.experiment-panel{padding:24px}.panel-heading{flex-wrap:wrap}.race-track{gap:12px}.race-track article,.stock-core{padding:20px 12px}.proof-grid{gap:12px}.proof-grid strong{font-size:18px}.list-tools{flex-wrap:wrap}.list-tools label:first-child{flex-basis:100%}.panel-heading h2{font-size:25px}}
@media(max-width:600px){.scenario-nav{grid-template-columns:1fr;gap:8px}.scenario-nav button{grid-template-columns:24px 1fr;column-gap:12px;padding:14px}.scenario-nav small{grid-column:2}.connection-bar{align-items:start;flex-direction:column;padding:18px}.experiment-panel{padding:20px 16px}.race-track{grid-template-columns:1fr 1fr}.stock-core{grid-column:1/-1;order:0;flex-direction:row;justify-content:space-between;padding:14px}.race-track article:first-child{order:1}.race-track article:nth-child(2){order:2}.stock-core b{font-size:32px}.race-track article strong{font-size:14px}.race-track article small{font-size:10px}.actor{font-size:24px;width:48px;height:48px}.order-steps{grid-template-columns:1fr;gap:12px}.order-steps li{padding-top:12px}.proof-grid{grid-template-columns:1fr;gap:18px}.proof-grid>div{gap:6px}.session-actions{flex-direction:column;gap:10px}.intent-box{padding:16px 12px}.intent-box dl>div{grid-template-columns:1fr;gap:3px}.list-tools{gap:12px}.list-tools input{width:100%}.list-tools label:nth-child(2){flex:1}.virtual-header,.virtual-row{grid-template-columns:1.2fr .9fr .6fr;gap:8px;padding:0 8px;font-size:10px}.virtual-row b{font-size:10px}.virtual-row small{font-size:9px}.panel-actions .button{width:100%;justify-content:center}.panel-heading h2{font-size:23px;line-height:1.45}.boundary p{font-size:13px}}
.virtual-row small{font-size:11px}.virtual-row b{font-size:12px}
@media(max-width:600px){.virtual-header,.virtual-row{font-size:12px}.virtual-row b{font-size:11px}.virtual-row small{font-size:11px}}
</style>
