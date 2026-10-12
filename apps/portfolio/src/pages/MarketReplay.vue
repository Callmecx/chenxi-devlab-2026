<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { EVENT_COUNT, prepareSyntheticEvents, projectPrefix, ReplayLoader, type MarketEvent, type SymbolId } from '../domain/market/replay';

const symbol = ref<SymbolId>('ATLAS');
const events = ref<MarketEvent[]>([]);
const cursor = ref(0);
const playing = ref(false);
const speed = ref(1);
const loading = ref(false);
const loadError = ref('');
const message = ref('选择播放或单步，观察每一条合成事件如何改变状态。');
const gaps = ref(new Set<number>());
const duplicates = ref(new Set<number>());
const loader = new ReplayLoader();
let timer: ReturnType<typeof setTimeout> | undefined;
const projection = computed(() => projectPrefix(events.value.flatMap(event => duplicates.value.has(event.seq) ? [event, event] : [event]), cursor.value, gaps.value));
const money = (cents: number | null) => cents === null ? '—' : (cents / 100).toFixed(2);
const time = (at: number) => new Date(at).toISOString().slice(11, 19);
const visibleRows = computed(() => events.value.filter(event => event.seq <= cursor.value).slice(-8).reverse());
const chartRange = computed(() => {
  const prices = projection.value.applied.map(event => event.priceCents);
  const low = prices.length ? Math.min(...prices) - 8 : 0;
  const high = prices.length ? Math.max(...prices) + 8 : 100;
  return { low, high, span: Math.max(16, high - low) };
});
const y = (price: number) => 180 - (price - chartRange.value.low) / chartRange.value.span * 145;
const volumeMaximum = computed(() => Math.max(1, ...projection.value.candles.map(candle => candle.volume)));
const bookMaximum = computed(() => Math.max(1, ...projection.value.bids.map(level => level.quantity), ...projection.value.asks.map(level => level.quantity)));

function pause() { playing.value = false; clearTimeout(timer); }
function step(manual = true) {
  if (manual) pause();
  if (loading.value || !events.value.length) return;
  cursor.value = Math.min(EVENT_COUNT, cursor.value + 1);
  if (cursor.value === EVENT_COUNT) { pause(); message.value = '回放已结束。可以拖回时间轴、重置，或切换合成标的。'; }
}
function tick() { timer = setTimeout(() => { if (!playing.value) return; step(false); if (playing.value) tick(); }, 800 / speed.value); }
function play() {
  if (playing.value) { pause(); return; }
  if (cursor.value >= EVENT_COUNT) cursor.value = 0;
  playing.value = true; tick();
}
function seek(event: Event) {
  pause(); cursor.value = Number((event.target as HTMLInputElement).value);
  message.value = `已回到事件 ${cursor.value}；报价、订单簿和 K 线从该前缀重新计算。`;
}
function reset() {
  pause(); cursor.value = 0; gaps.value = new Set(); duplicates.value = new Set();
  message.value = '已清除故障注入并重置到空状态。没有保留未来报价或成交量。';
}
async function selectSymbol(next: SymbolId) {
  reset(); symbol.value = next; events.value = []; loading.value = true; loadError.value = '';
  try {
    const result = await loader.load(next, prepareSyntheticEvents);
    if (result === null) return;
    events.value = result; loading.value = false;
    message.value = `${next} 合成序列已准备，尚未应用任何事件。旧标的未完成的加载已取消。`;
  } catch {
    loading.value = false; loadError.value = '合成序列未能准备完成，请重试。';
  }
}
function changeSymbol(event: Event) { void selectSymbol((event.target as HTMLSelectElement).value as SymbolId); }
function injectGap() {
  pause(); gaps.value = new Set([...gaps.value, cursor.value]);
  message.value = `已移除事件 ${cursor.value}。连续前缀在缺口前停止；后续事件等待回补。`;
}
function injectDuplicate() {
  pause(); duplicates.value = new Set([...duplicates.value, cursor.value]);
  message.value = `已重复投递事件 ${cursor.value}。相同事件身份只记一次，成交量不增加。`;
}
function recover() {
  gaps.value = new Set();
  message.value = '已回补缺失事件，并从头重算当前时间轴之前的连续前缀；未读取后续价格。';
}
void selectSymbol('ATLAS');
onBeforeUnmount(() => { pause(); loader.cancel(); });
</script>

<template>
  <div class="section-wrap page-shell market-lab">
    <p class="eyebrow">INTERACTIVE ENGINEERING / 01</p>
    <div class="lab-heading">
      <div><h1 class="page-title">先看见事件，<br><span>再相信状态。</span></h1><p class="page-intro">把报价、订单簿与成交放进同一条时间轴。试着打断它，再检查恢复是否可信。</p></div>
      <div class="mode-note"><strong>合成数据 · 客户端回放</strong><p>ATLAS / LUMEN 均为虚构标的。没有行情接口、真实交易或收益分析；订单簿为合成快照，非撮合引擎。</p></div>
    </div>
    <section class="replay-desk" aria-label="金融事件回放控制台" :aria-busy="loading">
      <div class="desk-top">
        <label>合成标的<select :value="symbol" @change="changeSymbol"><option value="ATLAS">ATLAS / 合成资产 A</option><option value="LUMEN">LUMEN / 合成资产 B</option></select></label>
        <span class="feed-label">{{ loading ? '正在准备合成序列…' : projection.missing.length ? '缺口保护 · 状态停留在连续前缀' : '本地回放 · 非实时行情' }}</span>
      </div>
      <div v-if="loadError" class="lab-error" role="alert">{{ loadError }} <button class="button secondary" @click="selectSymbol(symbol)">重新准备</button></div>
      <div class="quote-strip">
        <div><span>最后应用报价</span><strong data-testid="market-price">{{ money(projection.lastPrice) }}</strong><small>合成计价单位</small></div>
        <div><span>已应用 / 已播放</span><strong data-testid="market-prefix">{{ projection.lastSequence }} / {{ cursor }}</strong><small>共 {{ EVENT_COUNT }} 条合成事件</small></div>
        <div><span>等待前序 / 重复丢弃</span><strong>{{ projection.waitingCount }} / {{ projection.duplicateCount }}</strong><small>缺失 {{ projection.missing.length }} 条</small></div>
      </div>
      <div class="visual-grid">
        <section class="candles-panel">
          <div class="panel-heading"><h2>成交 K 线</h2><span>每 6 秒一根 · 最后一根未收盘</span></div>
          <svg viewBox="0 0 480 255" role="img" :aria-label="`已应用 ${projection.applied.length} 条合成成交，共 ${projection.candles.length} 根六秒K线；最后一根未收盘`">
            <title>只根据当前连续前缀生成的六秒成交 K 线与成交量</title>
            <path d="M36 36H438 M36 108H438 M36 180H438" class="chart-grid" />
            <text x="441" y="39" class="axis-label">{{ projection.lastPrice === null ? '—' : money(chartRange.high) }}</text>
            <text x="441" y="181" class="axis-label">{{ projection.lastPrice === null ? '—' : money(chartRange.low) }}</text>
            <g v-for="(candle, index) in projection.candles" :key="candle.start" :class="candle.close >= candle.open ? 'candle-up' : 'candle-down'">
              <line :x1="52 + index * 32" :x2="52 + index * 32" :y1="y(candle.high)" :y2="y(candle.low)" stroke-width="2" />
              <rect :x="44 + index * 32" :y="Math.min(y(candle.open), y(candle.close))" width="16" :height="Math.max(2, Math.abs(y(candle.open) - y(candle.close)))" :fill-opacity="candle.closed ? 1 : 0.45" />
              <rect :x="44 + index * 32" :y="232 - candle.volume / volumeMaximum * 32" width="16" :height="candle.volume / volumeMaximum * 32" opacity="0.45" />
            </g>
            <text v-if="!projection.applied.length" x="235" y="111" text-anchor="middle" class="chart-placeholder">点击单步或播放，逐条生成图表</text>
            <text x="36" y="250" class="axis-label">01:30:00 UTC</text><text x="333" y="250" class="axis-label">合成事件时间 →</text>
          </svg>
          <p class="chart-caption">实体为已收盘区间，浅色为未收盘区间；细线表示高低价，下方柱表示已知成交量。图表随前缀重算，不预画后续走势。</p>
        </section>
        <section class="order-book"><div class="panel-heading"><h2>订单簿快照</h2><span>价 / 量</span></div><p v-if="!projection.bids.length" class="empty-book">尚无已应用报价</p>
          <div v-for="(level, index) in [...projection.asks].reverse()" :key="`ask-${index}`" class="book-row ask"><i :style="{ width: `${level.quantity / bookMaximum * 100}%` }" /><span>卖 {{ 5 - index }}</span><b>{{ money(level.priceCents) }}</b><span>{{ level.quantity }}</span></div>
          <div class="book-spread">买卖价差 {{ projection.bids.length ? money(projection.asks[0].priceCents - projection.bids[0].priceCents) : '—' }}</div>
          <div v-for="(level, index) in projection.bids" :key="`bid-${index}`" class="book-row bid"><i :style="{ width: `${level.quantity / bookMaximum * 100}%` }" /><span>买 {{ index + 1 }}</span><b>{{ money(level.priceCents) }}</b><span>{{ level.quantity }}</span></div>
        </section>
      </div>
      <div class="transport">
        <div class="transport-actions"><button class="button primary" :disabled="loading || !events.length" @click="play">{{ playing ? '暂停回放' : '播放回放' }}</button><button class="button secondary" :disabled="loading || cursor >= EVENT_COUNT" @click="step()">单步 +1</button><button class="text-link" :disabled="loading" @click="reset">重置</button><label>倍速<select v-model.number="speed"><option :value="0.5">0.5×</option><option :value="1">1×</option><option :value="2">2×</option><option :value="4">4×</option></select></label></div>
        <label class="seek-label" for="market-seek">时间轴 · 已播放 {{ cursor }} / {{ EVENT_COUNT }} 条</label><input id="market-seek" type="range" min="0" :max="EVENT_COUNT" :value="cursor" :disabled="loading" @input="seek">
      </div>
    </section>
    <div class="recovery-grid">
      <section class="fault-panel"><p class="eyebrow">FAULT INJECTION</p><h2>主动制造一个不完整的世界。</h2><p>移除当前事件后继续单步，后续事件会等待前序。回补后重新计算，检查报价和累计量是否恢复。</p><div class="fault-actions"><button class="button secondary" :disabled="loading || cursor === 0 || gaps.has(cursor)" @click="injectGap">移除当前事件</button><button class="button secondary" :disabled="loading || cursor === 0 || duplicates.has(cursor)" @click="injectDuplicate">重复投递当前事件</button><button class="button primary" :disabled="!gaps.size" @click="recover">回补并重算</button></div><p class="feedback" role="status">{{ message }}</p><p v-if="projection.missing.length" class="gap-note">缺失序号：{{ projection.missing.join('、') }}。最后可信状态停留在 #{{ projection.lastSequence }}。</p></section>
      <section class="event-panel"><div class="panel-heading"><h2>最近已播放事件</h2><span>按回放前缀显示</span></div><p v-if="!visibleRows.length">尚未播放事件。</p><div v-for="event in visibleRows" :key="event.id" class="event-row"><span>#{{ event.seq }}<small>{{ time(event.at) }}</small></span><b>{{ gaps.has(event.seq) ? '—' : money(event.priceCents) }}</b><span>{{ gaps.has(event.seq) ? '缺失' : event.seq > projection.lastSequence ? '等待前序' : '已应用' }}</span></div></section>
    </div>
    <div class="lab-footnote"><p>这是本轮独立的事件处理演示，未连接或重跑任何历史 Solana / Rust 项目。切换标的会中止旧加载，并再次核对请求代次，避免迟到响应覆盖新标的。</p><RouterLink to="/writing#prefix-replay" class="text-link">阅读前缀重算的工程说明 ↗</RouterLink></div>
  </div>
</template>

<style scoped>
.market-lab{padding-bottom:80px}.lab-heading{display:grid;grid-template-columns:1.5fr 1fr;gap:48px;align-items:end;margin-bottom:36px}.lab-heading .page-intro{max-width:620px}.mode-note{border-left:3px solid var(--accent);padding:12px 0 12px 22px}.mode-note p{font-size:14px;margin:10px 0 0}.replay-desk{border:1px solid var(--line);background:var(--paper);border-radius:20px;overflow:clip}.desk-top,.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.desk-top{padding:22px 28px;border-bottom:1px solid var(--line)}label{display:flex;align-items:center;gap:12px;font-size:14px}select{min-height:44px;max-width:100%;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:8px 12px}.feed-label,.panel-heading>span{font-size:12px;color:var(--muted)}.quote-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:28px}.quote-strip>div{display:flex;flex-direction:column;gap:6px}.quote-strip span,.quote-strip small{font-size:12px;color:var(--muted)}.quote-strip strong{font-size:32px;font-variant-numeric:tabular-nums;letter-spacing:-1px}.visual-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(200px,1fr);border-block:1px solid var(--line)}.candles-panel,.order-book{min-width:0;padding:24px}.candles-panel{border-right:1px solid var(--line)}.panel-heading h2{font-size:16px;margin:0}.candles-panel svg{display:block;width:100%;height:auto;margin-top:20px;overflow:visible}.chart-grid{fill:none;stroke:var(--line);stroke-dasharray:3 5}.axis-label{font-size:9px;fill:var(--muted)}.chart-placeholder{font-size:12px;fill:var(--muted)}.candle-up{fill:#257258;stroke:#257258}.candle-down{fill:#bd4c31;stroke:#bd4c31}.chart-caption{font-size:12px;margin:14px 0 0}.book-row{position:relative;display:grid;grid-template-columns:1fr 1fr 35px;gap:12px;font-size:12px;line-height:2.15;font-variant-numeric:tabular-nums;padding-inline:8px}.book-row>*:not(i){position:relative}.book-row i{position:absolute;right:0;top:0;height:100%;opacity:.1}.ask i{background:var(--accent)}.bid i{background:var(--green)}.book-row b{text-align:right}.book-row>span:last-child{text-align:right}.order-book .panel-heading{margin-bottom:18px}.book-spread{padding:8px;font-size:12px;border-block:1px solid var(--line);margin-block:8px}.empty-book{padding-block:40px;font-size:14px}.transport{padding:24px 28px}.transport-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.transport-actions .text-link{background:none;border:0;padding:12px}.transport-actions label{margin-left:auto}.seek-label{margin-top:22px}input[type=range]{display:block;width:100%;margin-top:14px;min-height:32px;accent-color:var(--accent)}.recovery-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:24px;margin-top:28px}.fault-panel,.event-panel{padding:28px;background:var(--surface);border:1px solid var(--line);border-radius:16px;min-width:0}.fault-panel h2{font-size:24px;line-height:1.4}.fault-panel p{font-size:14px}.fault-actions{display:flex;flex-wrap:wrap;gap:10px}.feedback{padding:14px 16px;background:var(--paper);border-left:3px solid var(--green);margin-top:20px;min-height:64px}.gap-note{font-weight:600}.event-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums}.event-row small{display:block;color:var(--muted);font-size:11px}.event-row b{align-self:center}.event-row>span:last-child{text-align:right;align-self:center}.event-panel .panel-heading{margin-bottom:16px}.lab-footnote{margin-top:32px;max-width:850px}.lab-footnote p{font-size:14px}.lab-error{padding:20px}.market-lab button:disabled{opacity:.5}.market-lab button:focus-visible,.market-lab select:focus-visible,.market-lab input:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
@media(max-width:800px){.lab-heading{grid-template-columns:1fr;gap:16px}.visual-grid{grid-template-columns:1fr}.candles-panel{border-right:0;border-bottom:1px solid var(--line)}.recovery-grid{grid-template-columns:1fr}.order-book{max-width:none}.desk-top{flex-wrap:wrap}.quote-strip{gap:12px;padding:22px 18px}.quote-strip strong{font-size:25px}.desk-top,.transport{padding:20px}.candles-panel,.order-book,.fault-panel,.event-panel{padding:20px}.mode-note{padding-left:16px}.transport-actions label{margin-left:0}.panel-heading{flex-wrap:wrap}.quote-strip span{font-size:11px}.market-lab .button{min-height:44px;padding:12px 16px}.event-row{font-size:12px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
