<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ArrowLeft, ArrowRight, Clock3, MapPin, Users, Check, Plus } from 'lucide-vue-next';
import { sessions, remaining } from '../domain';
import { useCampaign } from '../store';
import Artwork from '../components/Artwork.vue';
const route = useRoute();
const store = useCampaign();
const session = computed(() => sessions.find((s) => s.id === route.params.id));
const selected = computed(
  () => !!session.value && store.draft.selectedIds.includes(session.value.id),
);
const message = ref('');
function toggle() {
  if (session.value)
    message.value =
      store.toggleSession(session.value.id) ||
      (selected.value ? '已加入你的灵感日。' : '已移除这场体验。');
}
</script>

<template>
  <div class="shell inner-page">
    <RouterLink class="back-link" to="/"><ArrowLeft :size="16" />返回发现现场</RouterLink>
    <section v-if="session" class="detail-grid">
      <Artwork :kind="session.art" large />
      <div class="detail-copy">
        <div class="eyebrow">
          EXPERIENCE {{ session.number }} <span class="mock-tag">虚构活动</span>
        </div>
        <h1>{{ session.title }}</h1>
        <p class="detail-english">{{ session.english }}</p>
        <p class="detail-description">{{ session.description }}</p>
        <div class="detail-facts">
          <p><Clock3 :size="18" />2026.11.14 · {{ session.start }}—{{ session.end }}</p>
          <p><MapPin :size="18" />{{ session.location }}（演示地点）</p>
          <p>
            <Users :size="18" />剩余 {{ remaining(session, store.bookings) }} /
            {{ session.capacity }} 个本地演示名额
          </p>
        </div>
        <div class="takeaway">
          <span>你将带走的灵感</span><strong>{{ session.takeaway }}</strong>
          <p>所有描述均为虚构活动设定，未提供真实线下服务。</p>
        </div>
        <p v-if="message" class="feedback" role="status">{{ message }}</p>
        <div class="detail-actions">
          <button
            class="button"
            :class="selected ? 'secondary' : 'primary'"
            :aria-pressed="selected"
            @click="toggle"
          >
            <Check v-if="selected" :size="18" /><Plus v-else :size="18" />{{
              selected ? '从灵感日移除' : '加入我的灵感日'
            }}</button
          ><RouterLink to="/book" class="text-button"
            >前往预约 <ArrowRight :size="17"
          /></RouterLink>
        </div>
      </div>
    </section>
    <div v-else class="empty-state">
      <h1>这场体验暂时不在现场。</h1>
      <p>看看其他灵感，也许会有意外发现。</p>
      <RouterLink class="button primary" to="/">探索全部体验</RouterLink>
    </div>
  </div>
</template>
