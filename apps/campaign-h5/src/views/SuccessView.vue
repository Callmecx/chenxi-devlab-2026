<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowRight, Check, Copy, X } from 'lucide-vue-next';
import { sessions } from '../domain';
import { useCampaign } from '../store';
const route = useRoute();
const store = useCampaign();
const booking = computed(() => store.bookings.find((b) => b.id === route.params.id));
const message = ref('');
async function copy() {
  try {
    await navigator.clipboard.writeText(
      `Pulse 虚构活动 · ${booking.value?.nickname}的灵感日 · 2026.11.14 · ${booking.value?.selectedIds.map((id) => sessions.find((s) => s.id === id)?.title).join(' / ')}。仅为本地演示回执，不可用于现场入场。`,
    );
    message.value = '演示行程文字已复制。';
  } catch {
    message.value = '当前浏览器无法访问剪贴板，请手动复制页面文字。';
  }
}
</script>

<template>
  <div class="shell inner-page receipt-page">
    <template v-if="booking"
      ><div class="success-icon">
        <Check v-if="booking.status === 'confirmed'" :size="30" /><X v-else :size="30" />
      </div>
      <p class="eyebrow">
        {{
          booking.status === 'confirmed' ? 'SEE YOU IN THE POSSIBILITIES' : 'ROOM FOR ANOTHER DAY'
        }}
      </p>
      <h1>{{ booking.status === 'confirmed' ? '你的灵感日，已就位。' : '这份预约，已取消。' }}</h1>
      <p class="receipt-intro">
        {{
          booking.status === 'confirmed'
            ? '模拟预约成功。给好奇心留一席，给生活一点新鲜。'
            : '演示名额已释放，随时欢迎新的计划。'
        }}
      </p>
      <article class="receipt">
        <div class="receipt-head">
          <span class="footer-brand">pulse✳</span><span class="mock-tag">DEMO PASS</span>
        </div>
        <div class="receipt-name">
          <span>ADMIT / 灵感探索者</span>
          <h2>{{ booking.nickname }}</h2>
          <p>2026.11.14 · {{ booking.tickets }} 人 · 成都 / 虚构活动</p>
        </div>
        <div class="receipt-events">
          <div v-for="id in booking.selectedIds" :key="id">
            <span>{{ sessions.find((s) => s.id === id)?.start }}</span
            ><strong>{{ sessions.find((s) => s.id === id)?.title }}</strong>
          </div>
        </div>
        <div class="receipt-code">
          <span>{{ booking.id.slice(0, 11).toUpperCase() }}</span
          ><span>{{ booking.status === 'confirmed' ? '已模拟确认' : '已取消' }}</span>
        </div>
        <p>仅为交互演示回执，非真实票券，不可用于现场入场。</p>
      </article>
      <div class="receipt-actions">
        <RouterLink to="/records" class="button primary"
          >查看我的行程 <ArrowRight :size="17" /></RouterLink
        ><button class="button secondary" @click="copy"><Copy :size="16" />复制行程文字</button>
      </div>
      <p v-if="message" role="status" class="feedback">{{ message }}</p></template
    >
    <div v-else class="empty-state">
      <h1>这份回执不在当前浏览器。</h1>
      <p>模拟预约只保存在创建它的浏览器中。</p>
      <RouterLink to="/records" class="button primary">查看本地行程</RouterLink>
    </div>
  </div>
</template>
