<script setup lang="ts">
import { computed, ref } from "vue";
import { projects } from "../data/projects";
import ProjectCard from "../components/ProjectCard.vue";
const filter = ref("全部");
const query = ref("");
const categories = ["全部", "前端体验", "全栈系统", "AI 应用", "数据与工具"];
const filtered = computed(() =>
  projects.filter(
    (p) =>
      (filter.value === "全部" || p.category === filter.value) &&
      `${p.name} ${p.summary} ${p.tags.join(" ")}`
        .toLowerCase()
        .includes(query.value.toLowerCase().trim()),
  ),
);
</script>
<template>
  <div class="section-wrap page-shell">
    <p class="eyebrow">THE PROJECT INDEX / 2026</p>
    <h1 class="page-title">用作品，<span>回答问题。</span></h1>
    <p class="page-intro">
      前端界面、业务系统与自动化工具。每一项实践，都是把问题拆开、再认真连接起来的过程。
    </p>
    <div class="project-controls">
      <div class="filter-group" role="group" aria-label="项目分类">
        <button
          v-for="c in categories"
          :key="c"
          :class="{ active: filter === c }"
          :aria-pressed="filter === c"
          @click="filter = c"
        >
          {{ c }}
        </button>
      </div>
      <label class="search-label"
        ><span class="sr-only">搜索项目</span
        ><input
          v-model="query"
          placeholder="搜索项目或技术…"
          type="search"
          aria-label="搜索项目"
      /></label>
    </div>
    <p class="result-count" aria-live="polite">
      {{ filtered.length }} 个项目 · 档案与交互演示分别标记
    </p>
    <div class="projects-grid">
      <ProjectCard v-for="p in filtered" :key="p.slug" :project="p" />
    </div>
    <div v-if="!filtered.length" class="empty-state">
      <h2>还没有匹配的项目</h2>
      <p>试试 Vue、Python，或切换分类。</p>
      <button
        class="button primary"
        @click="
          filter = '全部';
          query = '';
        "
      >
        重置筛选
      </button>
    </div>
    <aside class="evidence-note">
      关于证据：历史项目展示脱敏技术摘要，不包含私有源码、客户数据或未经核实的线上指标。新作品提供可交互演示和仓库测试记录。
    </aside>
  </div>
</template>
