<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { ArrowLeft, ArrowUpRight, X } from "lucide-vue-next";
import { projects, siteBase } from "../data/projects";
import ProjectVisual from "../components/ProjectVisual.vue";
const route = useRoute();
const project = computed(() =>
  projects.find((p) => p.slug === route.params.slug),
);
const lightbox = ref<HTMLDialogElement>();
function scrollSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}
</script>
<template>
  <div v-if="project" class="section-wrap page-shell detail-page">
    <RouterLink to="/projects" class="text-link"
      ><ArrowLeft :size="16" /> 返回项目索引</RouterLink
    >
    <div class="detail-heading">
      <div>
        <p class="eyebrow">
          PROJECT {{ project.number }} / {{ project.category }}
        </p>
        <h1 class="page-title">{{ project.name }}</h1>
        <p class="detail-subtitle">{{ project.subtitle }}</p>
      </div>
      <div class="tags">
        <span v-for="tag in project.tags" :key="tag">{{ tag }}</span>
      </div>
    </div>
    <dl class="case-facts">
      <div><dt>实现范围</dt><dd>{{ project.status }}</dd></div>
      <div><dt>资料审阅</dt><dd>{{ project.reviewedAt || '未记录' }}</dd></div>
      <div><dt>历史验收日期</dt><dd>{{ project.historicalAcceptanceDate || '未确认，不以审阅日期替代' }}</dd></div>
    </dl>
    <p class="case-role"><strong>个人职责与来源：</strong>{{ project.role }}</p>
    <div class="detail-cover">
      <ProjectVisual :kind="project.tone" />
      <div class="detail-cover-caption">
        原创概念视觉 · 非历史产品截图<span>{{ project.status }}</span>
      </div>
    </div>
    <div class="detail-layout">
      <aside class="detail-sidebar">
        <span class="eyebrow">PROJECT NOTES</span
        ><a href="#project-goal" @click.prevent="scrollSection('project-goal')">01 项目目标</a
        ><a href="#project-process" @click.prevent="scrollSection('project-process')">02 业务与架构</a
        ><a href="#project-solution" @click.prevent="scrollSection('project-solution')">03 难点与方案</a
        ><a href="#project-evidence" @click.prevent="scrollSection('project-evidence')">04 证据与演示</a
        ><a v-if="project.demo" :href="project.demo" class="button primary"
          >运行演示 <ArrowUpRight :size="16" /></a
        ><a
          v-if="project.github"
          :href="project.github"
          target="_blank"
          rel="noopener noreferrer"
          class="text-link"
          >{{ project.sourceLabel || "项目 GitHub" }} <ArrowUpRight :size="16"
        /></a>
      </aside>
      <div class="detail-body">
        <section id="project-goal">
          <p class="eyebrow">01 / THE CONTEXT</p>
          <h2>要解决什么问题？</h2>
          <p>{{ project.goal }}</p>
          <ul v-if="project.features?.length" class="case-features"><li v-for="feature in project.features" :key="feature">{{ feature }}</li></ul>
        </section>
        <section id="project-process">
          <p class="eyebrow">02 / THE SYSTEM</p>
          <h2>让业务有序流动</h2>
          <div class="flow">
            <div v-for="(item, i) in project.flow" :key="item">
              <span>0{{ i + 1 }}</span
              ><b>{{ item }}</b>
            </div>
          </div>
          <h3>架构分层</h3>
          <div class="architecture-stack">
            <div v-for="(item, i) in project.architecture" :key="item">
              <span>L{{ i + 1 }}</span
              >{{ item }}
            </div>
          </div>
        </section>
        <section id="project-solution">
          <p class="eyebrow">03 / THE DECISIONS</p>
          <h2>关键难点与解决思路</h2>
          <article v-for="(decision, index) in project.decisions" :key="decision.title" class="case-decision">
            <p class="eyebrow">DECISION 0{{ index + 1 }}</p><h3>{{ decision.title }}</h3>
            <p>{{ decision.trigger }}</p>
            <div class="decision-block solution"><h4>实现选择</h4><p>{{ decision.choice }}</p></div>
            <p><strong>取舍与边界：</strong>{{ decision.tradeoff }}</p>
            <p class="decision-source"><strong>证据：</strong>{{ decision.evidence }}</p>
          </article>
        </section>
        <section id="project-evidence">
          <p class="eyebrow">04 / THE EVIDENCE</p>
          <h2>可检查，才有说服力</h2>
          <p>{{ project.evidence }}</p>
          <div class="verification-grid"><section><h3>已有证据支持</h3><ul><li v-for="item in project.verifiedScope" :key="item">{{ item }}</li></ul></section><section><h3>尚未验证 / 不在范围</h3><ul><li v-for="item in project.pendingScope" :key="item">{{ item }}</li></ul></section></div>
          <div v-if="project.evidenceSources?.length" class="source-locations"><h3>可追溯的资料定位</h3><ul><li v-for="source in project.evidenceSources" :key="source"><code>{{ source }}</code></li></ul><p>上述为对应项目内的文件定位，不代表旧项目已通过本轮复测。没有把私有原源码或客户数据导入本站。</p></div>
          <ul v-if="project.limitations" class="limitations">
            <li v-for="limit in project.limitations" :key="limit">
              {{ limit }}
            </li>
          </ul>
          <template v-if="project.screenshot"
            ><button
              class="screenshot-button"
              aria-label="放大项目证据图"
              @click="lightbox?.showModal()"
            >
              <img
                :src="`${siteBase}${project.screenshot}`"
                :alt="project.screenshotAlt || project.screenshotCaption || `${project.name} 已审阅的历史证据图`"
                loading="lazy"
              /><span>{{
                project.screenshotCaption || "已审阅的历史证据图 · 点击放大 ↗"
              }}</span>
            </button>
            <dialog ref="lightbox" class="lightbox" :aria-label="`${project.name} 项目证据图`" @click="lightbox?.close()">
              <button
                class="icon-button"
                aria-label="关闭截图"
                @click="lightbox?.close()"
              >
                <X /></button
              ><img
                :src="`${siteBase}${project.screenshot}`"
                :alt="project.screenshotAlt || project.screenshotCaption || `${project.name} 已审阅的历史证据图`"
              /></dialog
          ></template>
          <p v-else class="evidence-note">
            未提供可公开的历史产品截图。上方视觉为原创示意，不作为产品运行证据。
          </p>
          <p v-if="project.screenshot" class="evidence-note">当前展示 1 张已审阅证据图。拍摄日期未在本页独立核实，不以资料审阅日期充当拍摄日期。</p>
          <div v-if="project.interactiveRoute" class="independent-lab"><h3>从业务说明，走到可操作样例</h3><p>{{ project.simulationNotice }}</p><RouterLink :to="project.interactiveRoute" class="button primary">{{ project.interactiveLabel }} ↗</RouterLink></div>
          <div class="detail-links">
            <a v-if="project.demo" :href="project.demo" class="button primary"
              >打开交互演示 <ArrowUpRight :size="16" /></a
            ><a
              v-if="project.github"
              :href="project.github"
              class="button secondary"
              target="_blank"
              rel="noopener noreferrer"
              >{{ project.sourceLabel || "查看源码" }} ↗</a
            ><a
              :href="`${siteBase}evidence/TEST_REPORT.md`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link"
              >本站 V1 交付记录（不是旧项目复测） ↗</a
            >
          </div>
        </section>
      </div>
    </div>
    <div class="next-project">
      <span class="eyebrow">KEEP EXPLORING</span
      ><RouterLink to="/projects">下一件作品，另一种解法。 ↗</RouterLink>
    </div>
  </div>
  <div v-else class="section-wrap page-shell empty-state">
    <h1>未找到这个项目</h1>
    <RouterLink to="/projects" class="button primary">返回项目索引</RouterLink>
  </div>
</template>

<style scoped>
.case-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding:24px 0;border-block:1px solid var(--line);margin:0 0 18px}.case-facts dt{font-size:12px;color:var(--muted);margin-bottom:8px}.case-facts dd{margin:0;font-size:14px;line-height:1.7}.case-role{font-size:14px;max-width:950px;margin-bottom:30px}.case-features{padding-left:20px;line-height:1.9;color:var(--muted)}.case-decision{padding-block:24px;border-bottom:1px solid var(--line)}.case-decision h3{font-size:24px;line-height:1.5}.case-decision h4{margin:0 0 8px;font-size:14px}.case-decision .eyebrow{margin-bottom:12px}.case-decision .decision-block p{margin-bottom:0}.decision-source{font-size:13px}.verification-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}.verification-grid>section{padding:20px!important;background:var(--surface);border-radius:12px;margin:8px 0 20px!important;border:1px solid var(--line)}.verification-grid h3,.source-locations h3,.independent-lab h3{font-size:18px}.verification-grid ul{padding-left:18px;font-size:13px;line-height:1.9;color:var(--muted)}.source-locations{padding-block:16px}.source-locations ul{list-style:none;padding:0;font-size:12px;line-height:2}.source-locations code{overflow-wrap:anywhere}.source-locations p{font-size:12px}.independent-lab{border:1px solid var(--line);background:var(--surface);padding:24px;border-radius:14px;margin-block:24px}.independent-lab p{font-size:14px}.evidence-note{font-size:12px}
@media(max-width:700px){.case-facts{grid-template-columns:1fr;gap:14px}.case-facts>div{display:grid;grid-template-columns:100px 1fr;gap:12px}.case-facts dt{margin:0}.verification-grid{grid-template-columns:1fr}.case-decision h3{font-size:21px}}
</style>
