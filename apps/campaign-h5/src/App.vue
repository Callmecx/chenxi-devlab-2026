<script setup lang="ts">
import { ArrowUpRight, CalendarDays, Compass, Layers3, X } from 'lucide-vue-next';
import { useCampaign } from './store';
const store = useCampaign();
const portfolioUrl = import.meta.env.BASE_URL.replace(/pulse\/$/, '') || '/';
function focusMain() {
  document.getElementById('main')?.focus();
}
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="focusMain">跳至主要内容</a>
  <header class="site-header">
    <RouterLink class="wordmark" to="/" aria-label="Pulse 首页"
      >pulse<span class="brand-star">✳</span><small>城市灵感现场</small></RouterLink
    >
    <nav class="desktop-nav" aria-label="主导航">
      <RouterLink to="/">发现现场</RouterLink><RouterLink to="/records">我的行程</RouterLink
      ><a :href="portfolioUrl">DevLab <ArrowUpRight :size="14" /></a>
    </nav>
    <RouterLink to="/book" class="header-book"
      >预约体验 <span>{{ store.draft.selectedIds.length.toString().padStart(2, '0') }}</span
      ><ArrowUpRight :size="16"
    /></RouterLink>
  </header>
  <div v-if="store.storageWarning" class="storage-notice" role="status">
    {{ store.storageWarning
    }}<button aria-label="关闭存储提示" @click="store.storageWarning = ''"><X :size="16" /></button>
  </div>
  <main id="main" tabindex="-1">
    <RouterView v-slot="{ Component }"
      ><Transition name="page" mode="out-in"><component :is="Component" /></Transition
    ></RouterView>
  </main>
  <footer class="site-footer">
    <RouterLink to="/" class="footer-brand">pulse✳</RouterLink>
    <p>让灵感发生在生活里。</p>
    <div>
      <span>原创互动 H5 / Chenxi DevLab</span><span>所有活动均为虚构 · 仅本机保存 Mock 记录</span>
    </div>
  </footer>
  <nav class="mobile-nav" aria-label="移动导航">
    <RouterLink to="/"><Compass :size="20" /><span>发现现场</span></RouterLink
    ><RouterLink to="/book"
      ><Layers3 :size="20" /><span
        >预约
        <b v-if="store.draft.selectedIds.length">{{ store.draft.selectedIds.length }}</b></span
      ></RouterLink
    ><RouterLink to="/records"><CalendarDays :size="20" /><span>我的行程</span></RouterLink>
  </nav>
</template>
