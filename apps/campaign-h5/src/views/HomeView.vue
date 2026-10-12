<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin, Sparkles, Ticket } from 'lucide-vue-next';
import { sessions, remaining, type Category } from '../domain';
import { useCampaign } from '../store';
import SessionCard from '../components/SessionCard.vue';

const store = useCampaign();
const selectedCategory = ref('全部体验');
const categories: Array<Category | '全部体验'> = ['全部体验', '创作工作坊', '城市漫游', '灵感对谈'];
const visibleSessions = computed(() =>
  sessions.filter(
    (s) => selectedCategory.value === '全部体验' || s.category === selectedCategory.value,
  ),
);
const feedback = ref('');
function toggle(id: string) {
  const wasSelected = store.draft.selectedIds.includes(id);
  feedback.value =
    store.toggleSession(id) ||
    (wasSelected ? '已从灵感日移除，草稿自动保存。' : '已加入灵感日，草稿自动保存。');
}
const shareFeedback = ref('');
async function share() {
  try {
    await navigator.clipboard.writeText(window.location.href.split('#')[0] + '#/');
    shareFeedback.value = '活动页链接已复制。分享后仍为演示活动。';
  } catch {
    shareFeedback.value = '当前浏览器不支持复制，请复制浏览器地址栏链接。';
  }
}
</script>

<template>
  <div>
    <section class="hero shell">
      <div class="hero-copy">
        <div class="eyebrow">
          <span class="status-dot"></span> THE CREATIVE CITY WEEKEND
          <span class="mock-tag">MOCK 演示</span>
        </div>
        <h1>
          给日常，<br />一点<span class="orange-text"
            >灵感脉冲<span class="small-star">✳</span></span
          >
        </h1>
        <p class="hero-intro">
          走出惯常的路线，遇见有趣的人。<br />在创作、漫游与交谈之间，找回生活的新鲜感。
        </p>
        <div class="hero-actions">
          <RouterLink :to="{ path: '/', hash: '#experiences' }" class="button primary"
            >探索你的灵感日 <ArrowDown :size="18" /></RouterLink
          ><button class="text-button" @click="share">
            分享这份灵感 <ArrowUpRight :size="17" />
          </button>
        </div>
        <p v-if="shareFeedback" class="inline-feedback" role="status">{{ shareFeedback }}</p>
        <div class="hero-info">
          <div>
            <span>WHEN</span><strong>11.14 <small>SAT / 2026</small></strong>
          </div>
          <div>
            <span>WHERE</span><strong><MapPin :size="15" />成都 · 想象街区</strong>
          </div>
          <div class="hero-demo-note">虚构活动<br />免费模拟预约</div>
        </div>
      </div>
      <div class="hero-poster" aria-label="原创几何活动海报：Make room for a little wonder">
        <div class="poster-top"><span>PULSE FESTIVAL</span><span>VOL. 001 / CD</span></div>
        <div class="poster-orbit"></div>
        <div class="poster-disc">
          <span>MAKE<br />ROOM FOR<br /><em>WONDER.</em></span>
        </div>
        <div class="poster-sticker">想法碰撞<br /><strong>正在发生 ↗</strong></div>
        <div class="poster-bottom">
          <span>A LITTLE CURIOSITY.<br />A WHOLE NEW PERSPECTIVE.</span
          ><span class="poster-symbol">✳</span>
        </div>
      </div>
    </section>
    <div class="ticker" aria-hidden="true">
      <span>MAKE SOMETHING</span><i>✳</i><span>MEET SOMEONE</span><i>✳</i
      ><span>FEEL DIFFERENT</span><i>✳</i><span>STAY CURIOUS</span><i>✳</i>
    </div>
    <section id="experiences" class="experience-section shell">
      <div class="section-heading">
        <div>
          <p class="eyebrow">01 / FIND YOUR FREQUENCY</p>
          <h2>你的灵感，<br class="mobile-only" />不止一种打开方式。</h2>
        </div>
        <p>四种体验，一天慢慢探索。<br />选择喜欢的现场，拼出自己的灵感日。</p>
      </div>
      <div class="filter-row">
        <div class="filters" role="group" aria-label="筛选体验类型">
          <button
            v-for="category in categories"
            :key="category"
            :class="{ active: selectedCategory === category }"
            :aria-pressed="selectedCategory === category"
            @click="selectedCategory = category"
          >
            {{ category }}
          </button>
        </div>
        <span class="session-count"
          >{{ visibleSessions.length.toString().padStart(2, '0') }} EXPERIENCES</span
        >
      </div>
      <p v-if="feedback" class="feedback" role="status">{{ feedback }}</p>
      <div class="session-grid">
        <SessionCard
          v-for="session in visibleSessions"
          :key="session.id"
          :session="session"
          :selected="store.draft.selectedIds.includes(session.id)"
          :available="remaining(session, store.bookings)"
          @toggle="toggle"
        />
      </div>
      <div v-if="store.draft.selectedIds.length" class="selection-summary">
        <div>
          <Ticket :size="21" /><span
            >已选 <strong>{{ store.draft.selectedIds.length }}</strong> 场体验
            <small>选择已自动保存</small></span
          >
        </div>
        <RouterLink to="/book" class="button primary">去预约 <ArrowRight :size="17" /></RouterLink>
      </div>
    </section>
    <section class="manifesto shell">
      <div class="manifesto-title">
        <Sparkles :size="27" /><span>好的灵感，<br />来自真实的参与。</span>
      </div>
      <div class="manifesto-step">
        <span>01</span>
        <h3>找到你的频率</h3>
        <p>选择 1–3 场体验，系统会帮你检查时间冲突。</p>
      </div>
      <div class="manifesto-step">
        <span>02</span>
        <h3>留一个虚构昵称</h3>
        <p>不需要手机号与邮箱，完整体验模拟预约。</p>
      </div>
      <div class="manifesto-step">
        <span>03</span>
        <h3>带着好奇心出发</h3>
        <p>在我的行程查看回执，随时取消并释放名额。</p>
      </div>
    </section>
    <section class="end-note shell">
      <span>一点提醒 / THIS IS A DEMO</span>
      <p>
        这是一个展示移动端交互与业务流程的原创项目。活动、地点与名额均为演示数据；不会产生真实预约或费用，记录仅保存在当前浏览器。
      </p>
    </section>
  </div>
</template>
