<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  Trash2,
} from 'lucide-vue-next';
import {
  sessions,
  remaining,
  validateBooking,
  validateProfile,
  validateSelection,
} from '../domain';
import { useCampaign } from '../store';
import Artwork from '../components/Artwork.vue';
const store = useCampaign();
const router = useRouter();
const step = ref(1);
const error = ref('');
const simulateFailure = ref(false);
const chosen = computed(() => sessions.filter((s) => store.draft.selectedIds.includes(s.id)));
const stageTitle = ref<HTMLHeadingElement>();
const titles = ['挑选你的灵感现场', '让我们怎么称呼你？', '确认你的灵感日'];
function toggle(id: string) {
  error.value = store.toggleSession(id) || '';
}
async function move(next: number) {
  if (next > step.value) {
    error.value =
      (step.value === 1
        ? validateSelection(store.draft.selectedIds, store.draft.tickets, store.bookings)
        : validateProfile(store.draft)) || '';
    if (error.value) return;
  }
  error.value = '';
  step.value = next;
  await nextTick();
  stageTitle.value?.focus();
}
async function submit() {
  error.value = validateBooking(store.draft, store.bookings) || '';
  if (error.value) return;
  const result = await store.submit(simulateFailure.value);
  if (result.error) error.value = result.error;
  else if (result.id) await router.replace(`/success/${result.id}`);
}
</script>

<template>
  <div class="shell inner-page booking-page">
    <RouterLink class="back-link" to="/"><ArrowLeft :size="16" />返回发现现场</RouterLink>
    <div class="page-heading">
      <p class="eyebrow">YOUR CREATIVE DAY <span class="mock-tag">本地模拟预约</span></p>
      <h1>把灵感，排进日程。</h1>
      <p>简单三步，给自己留一段好奇的时间。</p>
    </div>
    <ol class="stepper" aria-label="预约进度">
      <li
        v-for="(label, index) in ['选择体验', '填写昵称', '确认预约']"
        :key="label"
        :class="{ active: step === index + 1, done: step > index + 1 }"
        :aria-current="step === index + 1 ? 'step' : undefined"
      >
        <span
          ><Check v-if="step > index + 1" :size="15" /><template v-else>{{
            index + 1
          }}</template></span
        >{{ label }}
      </li>
    </ol>
    <div class="booking-layout">
      <form
        class="booking-panel"
        :aria-busy="store.submitting"
        @submit.prevent="step < 3 ? move(step + 1) : submit()"
      >
        <h2 ref="stageTitle" tabindex="-1">{{ titles[step - 1] }}</h2>
        <p class="panel-intro">
          {{
            step === 1
              ? '最多选择 3 场；时间重叠的体验无法同时预约。'
              : step === 2
                ? '请使用虚构昵称，不要填写真实姓名、电话或其他隐私。'
                : '这是一次免费模拟预约，不会产生真实活动名额。'
          }}
        </p>
        <template v-if="step === 1">
          <div class="booking-options">
            <button
              v-for="session in sessions"
              :key="session.id"
              type="button"
              class="booking-option"
              :class="{ selected: store.draft.selectedIds.includes(session.id) }"
              :aria-pressed="store.draft.selectedIds.includes(session.id)"
              @click="toggle(session.id)"
            >
              <Artwork :kind="session.art" /><span class="option-content"
                ><strong>{{ session.title }}</strong
                ><span>{{ session.start }}—{{ session.end }}</span
                ><small
                  >{{ session.category }} · 余 {{ remaining(session, store.bookings) }} 席</small
                ></span
              ><span class="checkbox"
                ><Check v-if="store.draft.selectedIds.includes(session.id)" :size="16"
              /></span>
            </button>
          </div>
          <label class="field-label" for="tickets">同行人数 <span>含你自己</span></label
          ><select id="tickets" v-model.number="store.draft.tickets" class="input">
            <option :value="1">1 人 · 独自发现</option>
            <option :value="2">2 人 · 灵感搭子</option>
            <option :value="3">3 人 · 小小创作团</option>
          </select>
        </template>
        <template v-else-if="step === 2">
          <label class="field-label" for="nickname">虚构昵称 <span>必填</span></label
          ><input
            id="nickname"
            v-model="store.draft.nickname"
            class="input"
            autocomplete="off"
            maxlength="16"
            placeholder="例如：橘子星人"
            aria-describedby="nickname-hint"
          />
          <p id="nickname-hint" class="field-hint">2–16 位文字或数字，用一个有趣的名字就好。</p>
          <label class="field-label" for="note">我的灵感关键词 <span>选填</span></label
          ><textarea
            id="note"
            v-model="store.draft.note"
            class="input"
            rows="3"
            maxlength="80"
            placeholder="例如：几何、街角、橘色、声音……"
          />
          <p class="field-hint counter">{{ store.draft.note.length }} / 80 · 仅保存为本地草稿</p>
          <label class="consent"
            ><input v-model="store.draft.consent" type="checkbox" /><span
              >我知道这是演示项目，仅在当前浏览器保存模拟预约，不会产生真实预订，也不填写真实个人信息。</span
            ></label
          >
        </template>
        <template v-else>
          <div class="confirmation-profile">
            <span class="avatar">{{ store.draft.nickname.trim().slice(0, 1) }}</span>
            <div>
              <strong>{{ store.draft.nickname.trim() }}</strong
              ><span>{{ store.draft.tickets }} 位灵感探索者 · {{ chosen.length }} 场体验</span>
            </div>
            <CheckCircle2 :size="24" />
          </div>
          <div v-for="session in chosen" :key="session.id" class="confirmation-session">
            <div>
              <span>{{ session.start }}—{{ session.end }}</span>
              <h3>{{ session.title }}</h3>
              <p>{{ session.location }}</p>
            </div>
            <span>免费</span>
          </div>
          <div class="mock-controls">
            <span class="eyebrow">可交互的异常演示</span
            ><label class="consent"
              ><input v-model="simulateFailure" type="checkbox" :disabled="store.submitting" /><span
                >模拟服务失败（用于验证错误反馈与重试）</span
              ></label
            >
            <p>提交将模拟约 0.9 秒网络延迟。草稿自动保存，重复点击不会生成多笔预约。</p>
          </div>
        </template>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="form-actions">
          <button
            v-if="step > 1"
            class="text-button"
            type="button"
            :disabled="store.submitting"
            @click="move(step - 1)"
          >
            <ArrowLeft :size="16" />上一步</button
          ><button class="button primary" type="submit" :disabled="store.submitting">
            <LoaderCircle v-if="store.submitting" class="spin" :size="18" />{{
              store.submitting ? '正在模拟提交…' : step === 3 ? '确认模拟预约' : '下一步'
            }}<ArrowRight v-if="!store.submitting" :size="17" />
          </button>
        </div>
      </form>
      <aside class="booking-summary">
        <span class="eyebrow">YOUR DAY, YOUR WAY</span>
        <h2>我的灵感日<span>✳</span></h2>
        <div class="summary-date">2026.11.14 <small>星期六</small></div>
        <div v-if="!chosen.length" class="summary-empty">
          还没有选择体验。<br />从一件感兴趣的小事开始吧。
        </div>
        <div v-for="session in chosen" :key="session.id" class="summary-item">
          <div>
            <span>{{ session.start }}</span
            ><strong>{{ session.title }}</strong>
          </div>
          <button
            v-if="step === 1"
            type="button"
            :aria-label="`移除${session.title}`"
            @click="toggle(session.id)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <div class="summary-total">
          <span>{{ chosen.length }} 场体验 × {{ store.draft.tickets }} 人</span
          ><strong>¥ 0 <small>DEMO</small></strong>
        </div>
        <p class="privacy-note">
          <ShieldCheck :size="18" /><span
            >无登录，无支付，无真实隐私采集。<br />本地演示记录可在「我的行程」取消。</span
          >
        </p>
      </aside>
    </div>
  </div>
</template>
