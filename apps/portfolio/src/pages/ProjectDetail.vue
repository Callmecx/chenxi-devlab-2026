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
          <div class="decision-block">
            <h3>遇到的问题</h3>
            <p>{{ project.challenge }}</p>
          </div>
          <div class="decision-block solution">
            <h3>实际方案</h3>
            <p>{{ project.solution }}</p>
          </div>
        </section>
        <section id="project-evidence">
          <p class="eyebrow">04 / THE EVIDENCE</p>
          <h2>可检查，才有说服力</h2>
          <p>{{ project.evidence }}</p>
          <ul v-if="project.limitations" class="limitations">
            <li v-for="limit in project.limitations" :key="limit">
              {{ limit }}
            </li>
          </ul>
          <template v-if="project.screenshot"
            ><button
              class="screenshot-button"
              aria-label="放大功能截图"
              @click="lightbox?.showModal()"
            >
              <img
                :src="`${siteBase}${project.screenshot}`"
                :alt="`${project.name} 实际浏览器功能截图`"
                loading="lazy"
              /><span>{{
                project.screenshotCaption || "实际浏览器截图 · 点击放大 ↗"
              }}</span>
            </button>
            <dialog ref="lightbox" class="lightbox" @click="lightbox?.close()">
              <button
                class="icon-button"
                aria-label="关闭截图"
                @click="lightbox?.close()"
              >
                <X /></button
              ><img
                :src="`${siteBase}${project.screenshot}`"
                :alt="`${project.name} 实际浏览器功能截图`"
              /></dialog
          ></template>
          <p v-else class="evidence-note">
            未提供可公开的历史产品截图。上方视觉为原创示意，不作为产品运行证据。
          </p>
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
              >本次交付的测试说明 ↗</a
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
