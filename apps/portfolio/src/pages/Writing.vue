<script setup lang="ts">
import { nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
const route = useRoute();
function jump(id: string) { document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }
async function followHash() { await nextTick(); if (route.hash) document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: 'start' }); }
onMounted(followHash);
watch(() => route.hash, followHash);
const prefixCode = `for (let seq = 1; seq <= cursor; seq++) {
  const event = bySequence.get(seq)
  if (!event) break // stop at the first missing event
  applied.push(event)
}
// Charts, volume and order book derive only from applied.`;
const currencyCode = `// Physical stock includes reserved inventory.
available = stock - reserved
receivableCents = shipped * unitPriceCents
remainingCents = receivableCents - paidCents
// Reject: payment <= 0 or payment > remainingCents.`;
</script>

<template>
  <div class="section-wrap page-shell writing-page">
    <p class="eyebrow">ENGINEERING NOTES / 实现记录</p>
    <h1 class="page-title">把选择讲清楚，<br><span>把边界留下来。</span></h1>
    <p class="page-intro">从本轮实际代码里整理的两篇工程说明：时间轴如何恢复可信状态，业务流程如何守住数量与金额。不是补写的项目经历。</p>
    <nav class="article-index" aria-label="工程文章索引"><button @click="jump('prefix-replay')"><span>01 / EVENT SYSTEMS</span><strong>时间轴向后走，状态必须一起退回。</strong><small>前缀重算 · 缺口 · 迟到响应</small></button><button @click="jump('business-invariants')"><span>02 / BUSINESS RULES</span><strong>库存预留与现货，不是同一个数字。</strong><small>状态约束 · 整数分 · 请求重放</small></button></nav>
    <article id="prefix-replay" class="engineering-article">
      <header><p class="eyebrow">01 / 本轮独立合成回放实现</p><h2>时间轴向后走，状态必须一起退回。</h2><p class="article-meta">2026-10-12 · Vue / TypeScript · 本地合成数据</p></header>
      <p>回放控件不难做，难的是让“已经知道什么”跟着时间轴一起变化。如果先用完整数据计算 K 线，再只把图表裁短，后面的最高价、成交量或未收盘状态就可能泄漏进过去。</p>
      <h3>把 cursor 作为计算边界</h3><p>本轮 <code>domain/market/replay.ts</code> 中的 <code>projectPrefix</code> 先过滤掉 <code>seq &gt; cursor</code> 的事件，再按事件身份去重。报价、订单簿和 K 线只读取连续的已应用前缀；拖动时间轴不是删除几个图形，而是重新执行同一段投影逻辑。</p>
      <pre><code>{{ prefixCode }}</code></pre>
      <h3>缺口之后，不假装状态仍然完整</h3><p>例如已经播放到第 10 条，但第 4 条缺失：1–3 条可以应用，5–10 条虽然已经收到，仍应等待前序。界面分别显示“已播放 10”“已应用 3”“等待 6”，避免一个绿色状态掩盖数据不完整。</p><p>点击回补后，移除缺口标记并重新计算到第 10 条。成交量只来自去重后的这 10 条，既不把重复事件加两次，也不读第 11 条之后的价格。合成数据规模有限，选择从头重算来简化正确性；大规模回放需要另行设计检查点及其失效策略，本页没有实现或宣称该能力。</p>
      <h3>取消请求，还需要隔离迟到结果</h3><p>切换标的会先触发 AbortController，但请求来源不一定合作。<code>ReplayLoader</code> 同时递增请求代次，在 Promise 返回时再次核对；旧请求即便忽略取消并晚到，也只能返回空结果，不能覆盖新标的。离开页面同样取消未完成工作与播放定时器。</p>
      <h3>测试针对结果，而不是图形坐标</h3><ul><li>把未来事件价格与数量改成极大值，当前前缀的投影必须完全相同。</li><li>移除第 4 条、回补、倒放和重置后，检查实际应用事件、K 线开闭状态与成交量。</li><li>对同一事件重复投递，成交与累计量保持不变。</li><li>让旧标的请求忽略 abort 并晚于新请求完成，旧结果仍不得写回。</li></ul><p>这些场景已写入并执行本轮领域单元测试。单元测试不替代真实浏览器布局、键盘、性能或最终发布验收；当前文章不为尚未执行的检查补写通过率。</p>
      <aside class="article-boundary">ATLAS / LUMEN 是本轮确定性合成标的；订单簿是快照，K 线是合成成交聚合。没有实时行情、撮合、策略回测或交易执行，也不使用历史 V23 / Rust 私有工程。</aside>
      <RouterLink to="/labs/market-replay" class="button primary">操作合成事件回放 ↗</RouterLink>
    </article>
    <article id="business-invariants" class="engineering-article">
      <header><p class="eyebrow">02 / 本轮独立企业流程仿真</p><h2>库存预留与现货，不是同一个数字。</h2><p class="article-meta">2026-10-12 · 业务状态机 · 整数分金额</p></header>
      <p>销售要 50 台，仓库有 30 台。审批后可以先预留 30 台，但不应该把现货也减到 0：预留表达占用关系，出库才改变现货。混淆这两个数字，会让之后的采购缺口和发货校验一起出错。</p>
      <h3>让每一步的前置条件可见</h3><p>本轮 <code>domain/enterprise/workflow.ts</code> 把流程写为草稿、已审批、采购在途、已收货、已出库和已结清。审批预留 30 台；关联采购生成 20 台在途；收货后现货和预留都是 50 台；全量出库后两者归零，已发货变为 50 台。</p><p>用户可以尝试提前出库或重复收货。领域函数先检查状态，拒绝时返回原状态对象，不生成业务流水。页面上的等待提示只是本地操作反馈，业务成功由领域函数的结果决定。</p>
      <pre><code>{{ currencyCode }}</code></pre>
      <h3>分次结算不需要依赖浮点运气</h3><p>模拟单价为 5000 元，应收总额在出库后生成。输入金额用十进制文本解析为整数分，拒绝科学计数法、三位小数、零值和超额收款。先登记 100000 元后仍为待结清，再登记 150000 元才进入已结清状态。</p><p>这个浏览器样例采用整数分。原 EnterpriseFlow 是 Java 服务，资料显示使用 BigDecimal；两种实现都用于解释金额边界，不能把本轮 TypeScript 示例说成原系统源码。</p>
      <h3>同一请求只产生一次结果</h3><p>每次有效操作保存请求标识及规范化内容。重放相同请求时返回当前业务状态，不再次收货或收款；同键换金额会被拒绝。页面的“重放上次有效请求”可以直接检验流水数量不变。</p><p>这是当前内存状态的幂等演示。刷新会重置，没有服务器事务、多进程锁或跨设备一致性。要实现真实服务，必须把幂等记录、库存与账款更新放进可靠的持久化事务，不能只保留按钮锁。</p>
      <h3>验证不变量，保留历史边界</h3><ul><li>各步骤的现货、预留、采购和已发货数量符合预期。</li><li>提前采购、收货、出库或收款不会改变状态。</li><li>部分收款保留未收余额，超额拒绝，足额后才结清。</li><li>重复请求不增流水；同键不同内容拒绝；重置不保留旧收据。</li></ul><p>这些场景对应本轮已执行的独立领域测试。原项目的 MySQL / Redis、七角色浏览器链和 19 项回归仍是历史材料，没有因本页出现动画而变成今天复测。</p>
      <aside class="article-boundary">该样例解释单仓、全量收货出库与分次收款；没有真实客户、物流、支付或完整会计总账。本轮不修改原 EnterpriseFlow 工程。</aside>
      <RouterLink to="/labs/enterprise-flow" class="button primary">操作独立业务仿真 ↗</RouterLink><RouterLink to="/projects/enterprise-flow" class="text-link article-secondary">查看原项目事实与证据 ↗</RouterLink>
    </article>
  </div>
</template>

<style scoped>
.writing-page{padding-bottom:96px}.article-index{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin:40px 0 72px}.article-index button{text-align:left;border:1px solid var(--line);background:var(--paper);border-radius:14px;padding:28px;display:flex;flex-direction:column;gap:18px}.article-index span,.article-index small{font-size:12px;color:var(--muted)}.article-index strong{font-size:23px;line-height:1.5;font-weight:600}.article-index button:hover{border-color:var(--green)}.engineering-article{max-width:820px;margin-inline:auto;padding:30px 0 70px;scroll-margin-top:120px;border-bottom:1px solid var(--line)}.engineering-article+article{margin-top:50px}.engineering-article h2{font-size:36px;line-height:1.4;letter-spacing:-.5px}.engineering-article h3{font-size:23px;margin:38px 0 16px}.engineering-article p,.engineering-article li{font-size:16px;line-height:1.95}.engineering-article li{margin-block:10px;color:var(--muted)}.engineering-article ul{padding-left:24px}.article-meta{font-size:12px!important;margin-bottom:36px}.engineering-article code{font-family:'Cascadia Code',Consolas,monospace;font-size:.88em;overflow-wrap:anywhere}.engineering-article pre{background:#17251f;color:#ecf4ed;padding:24px;border-radius:12px;overflow-x:auto;line-height:1.8}.engineering-article pre code{font-size:13px;overflow-wrap:normal;white-space:pre}.article-boundary{border-left:3px solid var(--accent);background:var(--surface);padding:20px 24px;margin:30px 0;font-size:14px;line-height:1.85}.article-secondary{display:inline-block;margin:18px 0 0 22px}
@media(max-width:700px){.article-index{grid-template-columns:1fr;margin-bottom:36px;gap:14px}.article-index button{padding:22px}.article-index strong{font-size:21px}.engineering-article h2{font-size:29px}.engineering-article h3{font-size:21px}.engineering-article{scroll-margin-top:100px}.engineering-article pre{padding:16px}.article-secondary{display:block;margin-left:0}}
</style>
