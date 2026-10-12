<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { Moon, Sun, Menu, X, ArrowUpRight } from "lucide-vue-next";
import { useTheme } from "./stores/theme";
const theme = useTheme();
const menu = ref(false);
const route = useRoute();
const immersive = computed(() => route.path === "/intelligence");
function skipToMain() {
  const main = document.getElementById("main");
  main?.focus();
  main?.scrollIntoView();
}
watch(
  () => route.fullPath,
  () => {
    menu.value = false;
  },
);
</script>
<template>
  <a class="skip-link" href="#main" @click.prevent="skipToMain">跳至主要内容</a>
  <header v-if="!immersive" class="site-header">
    <div class="header-inner">
      <RouterLink to="/" class="brand" aria-label="Chenxi DevLab 首页"
        ><span class="brand-symbol" aria-hidden="true">c<span>›</span></span
        ><span
          >Chenxi<span class="brand-light"> DevLab</span
          ><small aria-hidden="true">INDEPENDENT DEVELOPER</small></span
        ></RouterLink
      >
      <nav aria-label="主导航" class="desktop-nav">
        <RouterLink to="/">首页</RouterLink
        ><RouterLink to="/intelligence">智能实验室</RouterLink
        ><RouterLink to="/projects">项目作品</RouterLink
        ><RouterLink to="/capabilities">技术与方法</RouterLink
        ><RouterLink to="/writing">工程笔记</RouterLink
        ><RouterLink to="/contact"
          >联系我 <ArrowUpRight :size="14"
        /></RouterLink>
      </nav>
      <div class="header-actions">
        <button
          class="icon-button"
          :aria-label="theme.dark ? '切换浅色模式' : '切换深色模式'"
          @click="theme.toggle"
        >
          <Sun v-if="theme.dark" :size="19" /><Moon v-else :size="18" /></button
        ><button
          class="icon-button mobile-menu-button"
          aria-label="展开导航菜单"
          :aria-expanded="menu"
          aria-controls="mobile-nav"
          @click="menu = !menu"
        >
          <X v-if="menu" :size="22" /><Menu v-else :size="22" />
        </button>
      </div>
    </div>
    <nav v-if="menu" id="mobile-nav" class="mobile-nav" aria-label="移动导航">
      <RouterLink to="/">首页</RouterLink
      ><RouterLink to="/intelligence">智能实验室</RouterLink
      ><RouterLink to="/projects">项目作品</RouterLink
      ><RouterLink to="/capabilities">技术与方法</RouterLink
      ><RouterLink to="/writing">工程笔记</RouterLink
      ><RouterLink to="/contact">联系我</RouterLink>
    </nav>
  </header>
  <main id="main" tabindex="-1" :class="{ 'orbit-host': immersive }">
    <RouterView v-slot="{ Component }"
      ><Transition name="page" mode="out-in"
        ><component :is="Component" :key="route.path" /></Transition
    ></RouterView>
  </main>
  <footer v-if="!immersive" class="site-footer">
    <div class="footer-top">
      <RouterLink class="brand" to="/"
        ><span class="brand-symbol" aria-hidden="true">c<span>›</span></span
        >Chenxi DevLab</RouterLink
      >
      <p>把想法落在代码里，把细节留给体验。</p>
      <a
        href="https://github.com/Callmecx"
        target="_blank"
        rel="noopener noreferrer"
        >GitHub <ArrowUpRight :size="15"
      /></a>
    </div>
    <div class="footer-bottom">
      <span>© 2026 Chenxi · 原创设计与工程实践</span
      ><span>Vue 3 / TypeScript / Built with care.</span>
    </div>
  </footer>
</template>
