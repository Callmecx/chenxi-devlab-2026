<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { createEnterpriseState, invoiceCents, parseYuan, phaseLabels, transition, type Command } from '../domain/enterprise/workflow';
const state = ref(createEnterpriseState());
const payment = ref('100000');
const message = ref('先审批销售单，观察 30 台库存如何预留，再补足 20 台缺口。也可以尝试提前出库，查看约束反馈。');
const error = ref(false);
const busy = ref(false);
const lastCommand = ref<Command>();
let sequence = 0;
let pending: ReturnType<typeof setTimeout> | undefined;
const balance = computed(() => invoiceCents(state.value) - state.value.paidCents);
const format = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(cents / 100);
const steps = [
  { type: 'approve', label: '审批销售', detail: '需求 50 → 预留 30', phase: 'draft' },
  { type: 'purchase', label: '关联采购', detail: '缺口 20 → 在途 20', phase: 'approved' },
  { type: 'receive', label: '确认收货', detail: '现货 50 → 预留 50', phase: 'purchased' },
  { type: 'ship', label: '全量出库', detail: '出库 50 → 应收生成', phase: 'received' },
] as const;
function execute(command: Command) {
  if (busy.value) return;
  busy.value = true; error.value = false;
  message.value = '正在执行本地规则校验…';
  pending = setTimeout(() => {
    const result = transition(state.value, command);
    state.value = result.state; message.value = result.message; error.value = !result.ok;
    if (result.ok) lastCommand.value = command;
    busy.value = false;
  }, 250);
}
function act(type: 'approve' | 'purchase' | 'receive' | 'ship') { execute({ id: `local-${++sequence}`, type }); }
function pay() {
  if (busy.value) return;
  const cents = parseYuan(payment.value);
  if (cents === null) { error.value = true; message.value = '请输入普通数字金额，最多两位小数；不接受科学计数法或千分位。'; return; }
  execute({ id: `local-${++sequence}`, type: 'pay', cents });
}
function reset() {
  clearTimeout(pending); busy.value = false; state.value = createEnterpriseState(); lastCommand.value = undefined;
  sequence = 0; payment.value = '100000'; error.value = false; message.value = '已重置本轮独立仿真：需求 50、现货 30；没有改动原项目或任何服务器数据。';
}
onBeforeUnmount(() => clearTimeout(pending));
</script>

<template>
  <div class="section-wrap page-shell enterprise-lab">
    <p class="eyebrow">INTERACTIVE ENGINEERING / 02</p>
    <div class="lab-heading"><div><h1 class="page-title">缺的 20 台，<br><span>不能凭空出现。</span></h1><p class="page-intro">走一遍销售、采购、库存与结算。看见每一步如何改变状态，也看见哪些动作必须被拒绝。</p></div><div class="mode-note"><strong>本轮独立仿真 · 非原系统复测</strong><p>在浏览器内解释 EnterpriseFlow 的业务约束，没有连接原 Java 服务、数据库或客户数据。所有数量与金额均为模拟。</p></div></div>
    <section class="business-console" aria-label="企业流程独立仿真" :aria-busy="busy">
      <div class="console-heading"><div><span class="eyebrow">SIMULATED SALES ORDER</span><h2>演示销售单 / EF-LAB-001</h2></div><span class="phase-badge" data-testid="enterprise-phase">{{ phaseLabels[state.phase] }}</span></div>
      <div class="inventory-grid"><div><span>客户需求</span><strong>{{ state.demand }} <small>台</small></strong></div><div><span>仓库现货</span><strong data-testid="enterprise-stock">{{ state.stock }} <small>台</small></strong></div><div><span>已预留</span><strong>{{ state.reserved }} <small>台</small></strong></div><div><span>已发货</span><strong>{{ state.shipped }} <small>台</small></strong></div></div>
      <p class="stock-definition">现货包含已预留库存；预留不会再次扣减现货。当前可用库存为 <b>{{ state.stock - state.reserved }} 台</b>。采购在收货之前不会增加现货。</p>
      <div class="workflow-actions"><article v-for="(step, index) in steps" :key="step.type" :class="{ recommended: state.phase === step.phase }"><span class="step-index">0{{ index + 1 }}</span><h3>{{ step.label }}</h3><p>{{ step.detail }}</p><button class="button" :class="state.phase === step.phase ? 'primary' : 'secondary'" :disabled="busy" @click="act(step.type)">{{ step.label }}</button><small>{{ state.phase === step.phase ? '当前可执行' : '可点击检查状态约束' }}</small></article></div>
      <div class="business-feedback" :class="{ error }" :role="error ? 'alert' : 'status'">{{ message }}</div>
    </section>
    <div class="settlement-grid">
      <section class="settlement-card"><p class="eyebrow">RECEIVABLES / INTEGER CENTS</p><h2>分次收款，逐笔对齐。</h2><p>模拟单价 {{ format(state.unitPriceCents) }} / 台。应收只在出库后生成，金额以整数分计算；这不是完整财务总账。</p><dl class="amounts"><div><dt>应收总额</dt><dd>{{ format(invoiceCents(state)) }}</dd></div><div><dt>已登记收款</dt><dd>{{ format(state.paidCents) }}</dd></div><div class="remaining"><dt>剩余应收</dt><dd data-testid="enterprise-balance">{{ format(balance) }}</dd></div></dl><form @submit.prevent="pay"><label for="payment-yuan">本次模拟收款金额（元）</label><div class="payment-row"><input id="payment-yuan" v-model="payment" inputmode="decimal" autocomplete="off" aria-describedby="payment-help" :disabled="busy"><button class="button primary" :disabled="busy" type="submit">登记收款</button></div><p id="payment-help">试试先登记 100000 元，再登记 150000 元；超额、零值或未出库时都会被拒绝。</p></form><button class="text-link" :disabled="busy || balance <= 0" @click="payment = (balance / 100).toFixed(2)">填入剩余金额</button></section>
      <section class="journal-card"><div class="journal-heading"><div><p class="eyebrow">STATE JOURNAL</p><h2>每一步都有结果。</h2></div><span>{{ state.journal.length }} 条</span></div><p v-if="!state.journal.length">尚未发生有效业务操作。错误动作不会写入业务流水。</p><ol v-else class="journal"><li v-for="(entry, index) in state.journal" :key="entry.id"><span>0{{ index + 1 }}</span><div><p>{{ entry.text }}</p><small>请求 {{ entry.id }}</small></div></li></ol><button class="button secondary" :disabled="!lastCommand || busy" @click="lastCommand && execute(lastCommand)">重放上次有效请求</button><p class="replay-note">重放原键与原内容只返回当前状态，不新增库存或收款。这是本地规则演示，不宣称分布式幂等。</p></section>
    </div>
    <div class="reset-row"><button class="button secondary" @click="reset">重置独立仿真</button><RouterLink to="/projects/enterprise-flow" class="text-link">返回真实项目案例 ↗</RouterLink><RouterLink to="/writing#business-invariants" class="text-link">查看业务不变量说明 ↗</RouterLink></div>
    <p class="lab-footnote">原项目的 MySQL / Redis、权限、历史回归和七角色浏览器链属于历史验收材料；本页不调用原服务，也没有重跑原项目。刷新页面会重新开始，仿真状态不上传。</p>
  </div>
</template>

<style scoped>
.enterprise-lab{padding-bottom:80px}.lab-heading{display:grid;grid-template-columns:1.5fr 1fr;gap:48px;align-items:end;margin-bottom:36px}.mode-note{padding:14px 0 14px 22px;border-left:3px solid var(--accent)}.mode-note p{font-size:14px;margin-bottom:0}.business-console{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:32px}.console-heading,.journal-heading{display:flex;align-items:center;justify-content:space-between;gap:20px}.console-heading .eyebrow{margin-bottom:10px;display:block}.console-heading h2{font-size:22px;margin:0}.phase-badge{background:var(--surface);padding:10px 14px;border-radius:8px;font-size:13px;border:1px solid var(--line)}.inventory-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;margin-top:36px}.inventory-grid>div{display:flex;flex-direction:column;gap:6px;border-right:1px solid var(--line)}.inventory-grid>div:last-child{border-right:0}.inventory-grid span{font-size:13px;color:var(--muted)}.inventory-grid strong{font-size:42px;font-variant-numeric:tabular-nums}.inventory-grid small{font-size:14px;font-weight:400}.stock-definition{font-size:13px;padding:16px 0;margin:0}.workflow-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:20px}.workflow-actions article{padding:22px 16px;border:1px solid var(--line);border-radius:12px;min-width:0}.workflow-actions article.recommended{background:var(--surface);border-color:var(--green)}.step-index{font-size:12px;color:var(--muted)}.workflow-actions h3{font-size:18px;margin:18px 0 6px}.workflow-actions p,.workflow-actions small{font-size:12px}.workflow-actions .button{width:100%;justify-content:center;min-height:44px;padding:10px}.workflow-actions small{display:block;margin-top:10px;color:var(--muted)}.business-feedback{padding:16px 20px;background:var(--surface);border-left:3px solid var(--green);margin-top:24px;line-height:1.7;font-size:14px}.business-feedback.error{border-color:var(--accent)}.settlement-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:24px}.settlement-card,.journal-card{border:1px solid var(--line);border-radius:16px;padding:28px;min-width:0}.settlement-card h2,.journal-card h2{font-size:25px}.settlement-card>p,.journal-card>p{font-size:14px}.amounts{margin:24px 0}.amounts>div{display:flex;justify-content:space-between;gap:20px;padding:12px 0;border-bottom:1px solid var(--line)}.amounts dt{font-size:14px;color:var(--muted)}.amounts dd{margin:0;font-variant-numeric:tabular-nums}.remaining dd{font-size:24px;font-weight:600}.payment-row{display:flex;gap:10px;margin-top:10px}.payment-row input{width:0;min-width:0;flex:1;min-height:48px;background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px 12px;font-variant-numeric:tabular-nums}.payment-row .button{flex-shrink:0}.settlement-card label{font-size:14px}.settlement-card form p{font-size:12px;margin-top:10px}.settlement-card>.text-link{border:0;background:none;padding:10px 0}.journal-heading{align-items:start}.journal-heading .eyebrow{margin-bottom:12px}.journal-heading>span{font-size:13px;color:var(--muted)}.journal{padding:0;list-style:none;margin:14px 0 24px}.journal li{display:grid;grid-template-columns:30px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.journal li>span,.journal small{font-size:11px;color:var(--muted)}.journal p{font-size:13px;margin:0}.replay-note{font-size:12px!important;margin-top:16px}.reset-row{display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-top:28px}.lab-footnote{font-size:13px;max-width:920px;margin-top:24px}.enterprise-lab button:disabled{opacity:.5}.enterprise-lab input:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
@media(max-width:900px){.lab-heading{grid-template-columns:1fr;gap:20px}.workflow-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.settlement-grid{grid-template-columns:1fr}.business-console{padding:22px}.inventory-grid{gap:14px}.inventory-grid strong{font-size:33px}.console-heading{align-items:start;flex-direction:column}.settlement-card,.journal-card{padding:22px}}
@media(max-width:400px){.inventory-grid{grid-template-columns:repeat(2,1fr);row-gap:20px}.inventory-grid>div:nth-child(2){border-right:0}.payment-row{flex-direction:column}.payment-row input{width:100%}.workflow-actions article{padding:16px 12px}.amounts{font-size:14px}.remaining dd{font-size:20px}}
</style>
