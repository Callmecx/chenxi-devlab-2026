<script setup lang="ts">
import { ref } from "vue";
import { ArrowUpRight, Copy, Check } from "lucide-vue-next";
const copied = ref(false);
const feedback = ref("");
async function copy() {
  try {
    await navigator.clipboard.writeText("496684212@qq.com");
    copied.value = true;
    feedback.value = "邮箱已复制";
  } catch {
    feedback.value = "自动复制不可用，请手动选择邮箱文字。";
  }
}
</script>
<template>
  <div class="section-wrap page-shell contact-page">
    <p class="eyebrow">LET'S BUILD SOMETHING USEFUL</p>
    <h1 class="page-title">从一次交流，<br /><span>开始下一次创造。</span></h1>
    <p class="page-intro">
      如果你正在寻找关注业务、体验与交付的开发者，<br />欢迎聊聊团队、项目，以及我们可以一起解决的问题。
    </p>
    <div class="contact-grid">
      <article class="contact-card main-contact">
        <span class="eyebrow">01 / SAY HELLO</span>
        <h2>发一封邮件</h2>
        <a class="email-link" href="mailto:496684212@qq.com"
          >496684212@qq.com <ArrowUpRight
        /></a>
        <p>前端 / 全栈岗位 · AI 应用研发 · 项目合作</p>
        <button class="button secondary" @click="copy">
          <Check v-if="copied" :size="16" /><Copy v-else :size="16" />{{
            copied ? "已复制" : "复制邮箱"
          }}</button
        ><span role="status" class="copy-status">{{ feedback }}</span>
      </article>
      <article class="contact-card">
        <span class="eyebrow">02 / CHECK THE CODE</span>
        <h2>在 GitHub 认识我</h2>
        <p>查看公开代码、工程结构与项目实践。</p>
        <a
          class="button primary"
          href="https://github.com/Callmecx"
          target="_blank"
          rel="noopener noreferrer"
          >@Callmecx <ArrowUpRight :size="17"
        /></a>
      </article>
    </div>
    <div class="contact-footnote">
      <span class="status-dot"></span>
      <p>
        公开邮箱由本人授权展示。本站无广告追踪；演示应用无需真实姓名、手机号、地址或支付信息。
      </p>
    </div>
  </div>
</template>
