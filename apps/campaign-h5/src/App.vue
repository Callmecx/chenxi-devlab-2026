<script setup lang="ts">
import {
  ArrowUpRight,
  CalendarDays,
  Compass,
  Layers3,
  X,
} from "lucide-vue-next";
import { useCampaign } from "./store";
import { useWeekend } from "./v2/store";
import WeekendExperience from "./v2/WeekendExperience.vue";
const store = useCampaign();
const weekend = useWeekend();
const portfolioUrl = import.meta.env.BASE_URL.replace(/pulse\/$/, "") || "/";
function focusMain() {
  document.getElementById("main")?.focus();
}
</script>

<template>
  <div class="wk-mode">
    <p>
      <strong>蓉城周末 Lab</strong
      >{{
        weekend.mode === "local"
          ? "本地演示 · 旧版 Pulse 流程与历史，仅当前浏览器保存"
          : "服务端演示 · 名额、预约与取消由 API 确认"
      }}
    </p>
    <div class="wk-mode-actions">
      <button
        :aria-pressed="weekend.mode === 'local'"
        :disabled="weekend.busy || weekend.pending || weekend.loading"
        @click="weekend.setMode('local')"
      >
        本地演示</button
      ><button
        :aria-pressed="weekend.mode === 'server'"
        :disabled="weekend.busy || weekend.pending || weekend.loading"
        @click="weekend.setMode('server')"
      >
        连接本地服务
      </button>
    </div>
  </div>
  <a class="skip-link" href="#main" @click.prevent="focusMain">跳至主要内容</a>
  <header class="site-header">
    <RouterLink class="wordmark" to="/" aria-label="蓉城周末 Lab 首页"
      >周末 Lab<span class="brand-star">✳</span
      ><small>蓉城周末提案</small></RouterLink
    >
    <nav class="desktop-nav" aria-label="主导航">
      <RouterLink to="/">发现现场</RouterLink
      ><RouterLink to="/records">我的行程</RouterLink
      ><a :href="portfolioUrl">DevLab <ArrowUpRight :size="14" /></a>
    </nav>
    <RouterLink to="/book" class="header-book"
      >预约体验
      <span>{{
        store.draft.selectedIds.length.toString().padStart(2, "0")
      }}</span
      ><ArrowUpRight :size="16"
    /></RouterLink>
  </header>
  <div v-if="store.storageWarning" class="storage-notice" role="status">
    {{ store.storageWarning
    }}<button aria-label="关闭存储提示" @click="store.storageWarning = ''">
      <X :size="16" />
    </button>
  </div>
  <main id="main" tabindex="-1">
    <WeekendExperience v-if="weekend.mode === 'server'" />
    <RouterView v-else v-slot="{ Component }"
      ><Transition name="page" mode="out-in"
        ><component :is="Component" /></Transition
    ></RouterView>
  </main>
  <footer class="site-footer">
    <RouterLink to="/" class="footer-brand">周末 Lab✳</RouterLink>
    <p>让灵感发生在生活里。</p>
    <div>
      <span>原创互动 H5 / Chenxi DevLab</span
      ><span>{{
        weekend.mode === "server"
          ? "虚构活动 · 服务端演示 · 无真实预订"
          : "旧版本地演示 · 仅本机保存 Mock 记录"
      }}</span>
    </div>
  </footer>
  <nav class="mobile-nav" aria-label="移动导航">
    <RouterLink to="/"><Compass :size="20" /><span>发现现场</span></RouterLink
    ><RouterLink to="/book"
      ><Layers3 :size="20" /><span
        >预约
        <b v-if="store.draft.selectedIds.length">{{
          store.draft.selectedIds.length
        }}</b></span
      ></RouterLink
    ><RouterLink to="/records"
      ><CalendarDays :size="20" /><span>我的行程</span></RouterLink
    >
  </nav>
</template>
