<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ArrowRight, CalendarDays, Check, X } from 'lucide-vue-next';
import { sessions, type Booking } from '../domain';
import { useCampaign } from '../store';
const store = useCampaign();
const filter = ref('全部');
const pending = ref<Booking | null>(null);
const dialogElement = ref<HTMLDialogElement>();
watch(pending, async (value) => {
  await nextTick();
  if (value && !dialogElement.value?.open) dialogElement.value?.showModal();
  else if (!value) dialogElement.value?.close();
});
const feedback = ref('');
const records = computed(() =>
  store.bookings.filter(
    (b) =>
      filter.value === '全部' ||
      b.status === (filter.value === '已预约' ? 'confirmed' : 'cancelled'),
  ),
);
function cancel() {
  if (pending.value) {
    store.cancel(pending.value.id);
    pending.value = null;
    feedback.value = '模拟预约已取消，名额已释放。';
  }
}
const dateText = (value: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));
</script>

<template>
  <div class="shell inner-page records-page">
    <div class="page-heading">
      <p class="eyebrow">MY CREATIVE JOURNEY <span class="mock-tag">仅当前浏览器</span></p>
      <h1>灵感，已经在路上。</h1>
      <p>你的小小计划，都认真收在这里。</p>
    </div>
    <div class="stat-grid">
      <div>
        <span>有效模拟预约</span
        ><strong>{{ store.confirmed.length.toString().padStart(2, '0') }}</strong
        ><small>笔预约</small>
      </div>
      <div>
        <span>不同体验</span><strong>{{ store.experienceCount.toString().padStart(2, '0') }}</strong
        ><small>种体验</small>
      </div>
      <div>
        <span>累计体验名额</span
        ><strong>{{ store.attendanceCount.toString().padStart(2, '0') }}</strong
        ><small>场次 × 人数</small>
      </div>
    </div>
    <div class="filter-row">
      <div class="filters" role="group" aria-label="筛选预约状态">
        <button
          v-for="item in ['全部', '已预约', '已取消']"
          :key="item"
          :class="{ active: filter === item }"
          :aria-pressed="filter === item"
          @click="filter = item"
        >
          {{ item }}
        </button>
      </div>
      <span class="session-count">{{ records.length }} RECORDS</span>
    </div>
    <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
    <div v-if="!records.length" class="empty-state">
      <CalendarDays :size="42" />
      <h2>这里还有一点空白。</h2>
      <p>
        {{ filter === '全部' ? '选一场喜欢的体验，让新的故事开始。' : '当前筛选下没有预约记录。' }}
      </p>
      <RouterLink to="/" class="button primary">去发现现场 <ArrowRight :size="17" /></RouterLink>
    </div>
    <div v-else class="records-list">
      <article v-for="booking in records" :key="booking.id" class="record-card">
        <div class="record-top">
          <span class="record-status" :class="booking.status"
            ><Check v-if="booking.status === 'confirmed'" :size="14" /><X v-else :size="14" />{{
              booking.status === 'confirmed' ? '模拟预约成功' : '已取消'
            }}</span
          ><span>{{ dateText(booking.createdAt) }}</span>
        </div>
        <div class="record-heading">
          <h2>{{ booking.nickname }}的灵感日</h2>
          <span>{{ booking.tickets }} 人同行</span>
        </div>
        <div class="record-sessions">
          <p v-for="id in booking.selectedIds" :key="id">
            <span>{{ sessions.find((s) => s.id === id)?.start }}</span
            ><strong>{{ sessions.find((s) => s.id === id)?.title }}</strong>
          </p>
        </div>
        <div class="record-bottom">
          <span>演示编号 {{ booking.id.slice(0, 11).toUpperCase() }}</span>
          <div>
            <RouterLink :to="`/success/${booking.id}`"
              >查看回执 <ArrowRight :size="15" /></RouterLink
            ><button
              v-if="booking.status === 'confirmed'"
              class="cancel-link"
              @click="pending = booking"
            >
              取消预约
            </button>
          </div>
        </div>
      </article>
    </div>
    <p class="records-footnote">
      数据只来自当前浏览器的模拟记录，非真实活动运营统计。清除浏览器存储会删除这些记录。
    </p>
    <dialog
      ref="dialogElement"
      class="dialog"
      aria-labelledby="cancel-title"
      @cancel="pending = null"
    >
      <template v-if="pending"
        ><button class="dialog-close" aria-label="关闭取消确认" @click="pending = null">
          <X :size="20" /></button
        ><span class="eyebrow">CHANGE OF PLANS</span>
        <h2 id="cancel-title">给计划留点弹性。</h2>
        <p>
          确认取消「{{ pending.nickname }}」的模拟预约？对应演示名额将立即释放，你可以重新预约。
        </p>
        <div class="dialog-actions">
          <button class="button secondary" @click="pending = null">保留预约</button
          ><button class="button primary" @click="cancel">确认取消</button>
        </div></template
      >
    </dialog>
  </div>
</template>
