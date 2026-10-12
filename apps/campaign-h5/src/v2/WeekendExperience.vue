<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWeekend } from "./store";
import { useCampaign } from "../store";
import type { Booking } from "../../../../packages/shared/src/api";
import "./weekend.css";

const store = useWeekend(),
  legacy = useCampaign(),
  route = useRoute(),
  router = useRouter();
const participants = ref(1),
  alias = ref(""),
  accepted = ref(false),
  formError = ref("");
const cancelling = ref<Booking | null>(null),
  dialog = ref<HTMLDialogElement>();
const slotsLoading = ref(false);
let slotsLoad = 0;
const path = computed(() => route.path);
const routeId = computed(() =>
  String(route.params.id || route.query.route || ""),
);
const currentRoute = computed(() =>
  store.routes.find((item) => item.id === routeId.value),
);
const selectedSlot = computed(() =>
  store.slots.find((item) => item.id === route.query.slot),
);
const currentBooking = computed(() =>
  store.bookings.find((item) => item.id === route.params.id),
);
const activeBooking = computed(() =>
  store.bookings.find((item) => item.status === "CONFIRMED"),
);
const routePage = computed(() => path.value.startsWith("/session/"));
const recordPage = computed(() => path.value === "/records");
const receiptPage = computed(() => path.value.startsWith("/success/"));
const knownPage = computed(
  () =>
    ["/", "/preferences", "/routes", "/book", "/records"].includes(
      path.value,
    ) ||
    routePage.value ||
    receiptPage.value,
);
const statusText = {
  CONFIRMED: "预约已确认",
  USER_CANCELLED: "已主动取消",
  ACTIVITY_CANCELLED: "活动已取消",
  EXPIRED: "体验已结束",
};
const time = (value: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Shanghai",
      }).format(new Date(value))
    : "—";
const slotLabel = (status: string, available: number) =>
  status === "CANCELLED"
    ? "已取消"
    : status === "ENDED"
      ? "已结束"
      : status === "CLOSED"
        ? "已截止"
        : available === 0
          ? "已满额"
          : available <= 3
            ? `仅余 ${available} 位`
            : `可约 ${available} 位`;
async function syncPage() {
  if (!store.connected) return;
  if ((routePage.value || path.value === "/book") && routeId.value) {
    const id = ++slotsLoad;
    slotsLoading.value = true;
    await store.loadSlots(routeId.value);
    if (id === slotsLoad) slotsLoading.value = false;
  }
  if (recordPage.value || receiptPage.value) await store.refresh();
}
watch(() => [route.fullPath, store.connected], syncPage);
watch(
  () => store.campaign?.rulesVersion,
  () => {
    accepted.value = false;
  },
);
watch(cancelling, async (value) => {
  await nextTick();
  if (value) dialog.value?.showModal();
  else dialog.value?.close();
});
async function submit() {
  formError.value = "";
  if (
    !selectedSlot.value ||
    !accepted.value ||
    !Number.isInteger(participants.value) ||
    participants.value < 1 ||
    participants.value > 4
  ) {
    formError.value = "请选择有效场次、1–4 人并确认演示规则。";
    return;
  }
  if (/@|\d{7,}/.test(alias.value) || [...alias.value.trim()].length > 16) {
    formError.value = "请使用不超过 16 字的虚构代号，不要填写手机或邮箱。";
    return;
  }
  const result = await store.book({
    slotId: selectedSlot.value.id,
    participantCount: participants.value,
    ...(alias.value.trim() ? { alias: alias.value.trim() } : {}),
    rulesAccepted: true,
    rulesVersion: store.campaign!.rulesVersion,
    source:
      route.query.source === "recommendation" ? "recommendation" : "browse",
  });
  if (result) {
    accepted.value = false;
    await router.replace(`/success/${result.id}`);
  }
}
async function confirmCancel() {
  if (!cancelling.value) return;
  const result = await store.cancel(cancelling.value.id);
  if (result) cancelling.value = null;
}
function visibility() {
  if (document.visibilityState === "visible" && store.connected) {
    void store.refresh();
    void syncPage();
  }
}
function abandonRecovery() {
  if (
    window.confirm(
      "原请求可能已经成功。停止恢复只归档本机请求，不会取消服务器预约，也不会自动创建新会话。确认停止原会话恢复？",
    )
  )
    store.abandonIdentityRecovery();
}
onMounted(() => {
  if (!store.connected) void store.connect();
  else void syncPage();
  document.addEventListener("visibilitychange", visibility);
});
onUnmounted(() => document.removeEventListener("visibilitychange", visibility));
</script>

<template>
  <div class="weekend-v2 shell">
    <div class="wk-service-state">
      <span class="wk-dot" :class="{ ready: store.connected }"></span
      ><span>{{
        store.connected
          ? "服务端演示已连接"
          : store.loading
            ? "正在连接演示服务…"
            : "服务尚未连接"
      }}</span
      ><small>虚构活动 · 每位访客独立模拟名额池</small>
    </div>
    <div v-if="store.error" class="wk-alert" role="alert">
      {{ store.error }}
      <button
        v-if="!store.pending"
        type="button"
        @click="store.connected ? syncPage() : store.connect()"
      >
        重试
      </button>
    </div>
    <p v-if="store.notice" class="wk-notice" role="status">
      {{ store.notice }}
    </p>
    <section v-if="store.pending" class="wk-pending" aria-live="polite">
      <h2>先确认上一条操作</h2>
      <p v-if="store.identityLost">
        原会话身份已失效，不能在新会话重放此请求。你可以保留记录，或明确停止恢复。
      </p>
      <button
        v-if="store.identityLost"
        class="wk-secondary"
        :disabled="store.busy"
        @click="abandonRecovery"
      >
        停止原会话恢复
      </button>
      <p>可能已经成功。原请求与标识已保留，暂时不能修改或开始另一条操作。</p>
      <div class="wk-actions">
        <button :disabled="store.busy" @click="store.recover(true)">
          查询原请求</button
        ><button :disabled="store.busy" @click="store.recover(false)">
          使用原请求重试</button
        ><RouterLink to="/records">查看我的预约</RouterLink>
      </div>
    </section>
    <div v-if="!store.connected" class="wk-empty">
      <span class="wk-kicker">LOCAL SERVICE / EXPLICIT CONNECTION</span>
      <h1>{{ store.loading ? "正在准备你的周末。" : "连接服务，再出发。" }}</h1>
      <p>
        当前页面需要同源 /api/v1
        演示服务。公开静态站点没有后台时会停留在这里，不会把本地结果伪装成服务器成功。
      </p>
      <button
        class="wk-primary"
        :disabled="store.loading"
        @click="store.connect()"
      >
        {{ store.loading ? "连接中…" : "重新连接服务" }}
      </button>
    </div>
    <template v-else>
      <nav class="wk-nav" aria-label="周末服务导航">
        <RouterLink to="/">周末提案</RouterLink
        ><RouterLink to="/preferences">三题偏好</RouterLink
        ><RouterLink to="/routes">全部路线</RouterLink
        ><RouterLink to="/records">我的预约</RouterLink>
      </nav>
      <section v-if="path === '/'" class="wk-hero">
        <div>
          <span class="wk-kicker">CHENGDU WEEKEND LAB / 2026</span>
          <h1><span>周末，</span><span>换一种</span><em>打开方式。</em></h1>
          <p>
            {{
              store.campaign?.description ||
              "在熟悉的城市，给自己留一段没安排过的时间。慢逛、手作，或向户外走一步。"
            }}
          </p>
          <div class="wk-actions">
            <RouterLink class="wk-primary" to="/preferences"
              >找到我的周末 ↗</RouterLink
            ><RouterLink class="wk-secondary" to="/routes"
              >直接浏览路线</RouterLink
            >
          </div>
          <small>原创城市体验提案 · 业务数据全部模拟 · 无真实收费</small>
        </div>
        <div class="wk-poster" aria-label="原创周末路线图形">
          <span>LESS SCROLL.<br />MORE STROLL.</span>
          <div class="wk-orbit"><i>慢</i><i>作</i><i>游</i></div>
          <strong>留一点时间，<br />给生活本身。</strong
          ><small>03 ROUTES / ONE GOOD AFTERNOON</small>
        </div>
      </section>
      <section v-else-if="path === '/preferences'" class="wk-section">
        <span class="wk-kicker">01 / YOUR WEEKEND, YOUR RULES</span>
        <h1>从三个小选择开始。</h1>
        <p class="wk-lead">
          无需个人资料。推荐只看主题、环境和时间，分数有明确依据。
        </p>
        <form
          class="wk-preferences"
          @submit.prevent="router.push('/routes?recommended=1')"
        >
          <fieldset>
            <legend>① 今天想怎么度过？</legend>
            <label
              v-for="item in [
                { v: 'quiet', t: '慢下来 · 安静漫步' },
                { v: 'creative', t: '动手做 · 灵感创作' },
                { v: 'active', t: '走出去 · 城市探索' },
              ]"
              :key="item.v"
              ><input
                v-model="store.preferences.theme"
                type="radio"
                name="theme"
                :value="item.v"
              />{{ item.t }}</label
            >
          </fieldset>
          <fieldset>
            <legend>② 更喜欢哪种环境？</legend>
            <label
              v-for="item in [
                { v: 'indoor', t: '舒适室内' },
                { v: 'outdoor', t: '开阔户外' },
                { v: 'any', t: '都可以' },
              ]"
              :key="item.v"
              ><input
                v-model="store.preferences.environment"
                type="radio"
                name="environment"
                :value="item.v"
              />{{ item.t }}</label
            >
          </fieldset>
          <fieldset>
            <legend>③ 愿意留出多久？</legend>
            <label v-for="minutes in [90, 120, 180]" :key="minutes"
              ><input
                v-model="store.preferences.minutes"
                type="radio"
                name="minutes"
                :value="minutes"
              />{{ minutes }} 分钟</label
            >
          </fieldset>
          <button class="wk-primary">看看适合我的路线 ↗</button>
        </form>
      </section>
      <section v-else-if="path === '/routes'" class="wk-section">
        <span class="wk-kicker">02 / SMALL PLANS, GOOD DAYS</span>
        <h1>
          {{
            route.query.recommended ? "给你的周末提案。" : "选一条，慢慢感受。"
          }}
        </h1>
        <p class="wk-lead">
          主题 +4，环境 +2，时间合适 +2、超时 −3。余量不参与推荐排名。
        </p>
        <div class="wk-route-grid">
          <article
            v-for="(item, index) in store.recommendations"
            :key="item.route.id"
            class="wk-route-card"
          >
            <div class="wk-route-art" :class="`wk-art-${item.route.theme}`">
              <span>0{{ index + 1 }}</span
              ><strong>{{
                item.route.theme === "quiet"
                  ? "慢"
                  : item.route.theme === "creative"
                    ? "作"
                    : "游"
              }}</strong>
            </div>
            <div class="wk-card-body">
              <span class="wk-kicker"
                >{{ item.route.environment === "indoor" ? "室内" : "户外" }} ·
                {{ item.route.duration }} MIN</span
              >
              <h2>{{ item.route.title }}</h2>
              <p>{{ item.route.description }}</p>
              <div v-if="route.query.recommended" class="wk-reasons">
                <strong>匹配分 {{ item.score }}</strong>
                <p v-for="reason in item.reasons" :key="reason">
                  ✓ {{ reason }}
                </p>
                <p v-for="reason in item.tradeoffs" :key="reason">
                  △ {{ reason }}
                </p>
              </div>
              <RouterLink
                class="wk-link"
                :to="`/session/${item.route.id}${route.query.recommended ? '?source=recommendation' : ''}`"
                >查看路线与场次 →</RouterLink
              >
            </div>
          </article>
        </div>
      </section>
      <section v-else-if="routePage && currentRoute" class="wk-section">
        <RouterLink class="wk-link" to="/routes">← 全部路线</RouterLink>
        <div class="wk-detail-head">
          <span class="wk-kicker"
            >A LITTLE WAY OUT / {{ currentRoute.duration }} MIN</span
          >
          <h1>{{ currentRoute.title }}</h1>
          <p class="wk-lead">{{ currentRoute.description }}</p>
          <ul class="wk-highlights">
            <li v-for="item in currentRoute.highlights" :key="item">
              {{ item }}
            </li>
          </ul>
        </div>
        <h2>选择一个模拟场次</h2>
        <p>时间为北京时间，以服务端状态为准；名额仅在提交成功后确认。</p>
        <p v-if="slotsLoading" role="status">正在查询场次和最新名额…</p>
        <p v-else-if="!store.slots.length">
          暂时没有场次。<button @click="syncPage">重新查询</button>
        </p>
        <div class="wk-slots">
          <article v-for="slot in store.slots" :key="slot.id">
            <div>
              <span class="wk-badge">{{
                slotLabel(slot.status, slot.available)
              }}</span>
              <h3>{{ time(slot.startsAt) }}</h3>
              <p>
                报名截止 {{ time(slot.deadline) }} · 容量 {{ slot.capacity }} 人
              </p>
            </div>
            <RouterLink
              v-if="slot.status === 'OPEN' && slot.available > 0"
              class="wk-primary"
              :to="`/book?route=${currentRoute.id}&slot=${slot.id}&source=${route.query.source || 'browse'}`"
              >预约此场次</RouterLink
            ><span v-else class="wk-muted">暂不可预约</span>
          </article>
        </div>
      </section>
      <section v-else-if="path === '/book'" class="wk-section">
        <span class="wk-kicker">03 / SAVE A LITTLE TIME</span>
        <h1>为周末，留一个位置。</h1>
        <template v-if="activeBooking"
          ><div class="wk-notice">
            当前会话已有有效预约。每场活动只能保留一条有效预约。
          </div>
          <RouterLink class="wk-primary" :to="`/success/${activeBooking.id}`"
            >查看已有预约</RouterLink
          ></template
        ><template v-else-if="selectedSlot && currentRoute"
          ><form class="wk-book-form" @submit.prevent="submit">
            <div class="wk-summary">
              <span class="wk-kicker">{{ currentRoute.title }}</span>
              <h2>{{ time(selectedSlot.startsAt) }}</h2>
              <p>
                {{ slotLabel(selectedSlot.status, selectedSlot.available) }} ·
                免费模拟体验
              </p>
            </div>
            <fieldset :disabled="store.busy || store.pending">
              <label for="wk-people">同行人数（含你自己）</label
              ><select id="wk-people" v-model.number="participants">
                <option v-for="n in 4" :key="n" :value="n">
                  {{ n }} 人
                </option></select
              ><label for="wk-alias">虚构代号 · 选填</label
              ><input
                id="wk-alias"
                v-model="alias"
                autocomplete="off"
                maxlength="16"
                placeholder="例如：橘子星人"
              /><small>不填写姓名、手机号或邮箱。留空由服务生成代号。</small
              ><label class="wk-consent"
                ><input
                  v-model="accepted"
                  type="checkbox"
                />我知道活动、日期与名额均为模拟；每位访客独立体验。我同意当前规则
                {{ store.campaign?.rulesVersion }}。</label
              >
              <p v-if="formError" role="alert" class="wk-alert">
                {{ formError }}
              </p>
              <button
                class="wk-primary"
                :disabled="
                  !accepted ||
                  selectedSlot.status !== 'OPEN' ||
                  selectedSlot.available < participants
                "
              >
                {{ store.busy ? "正在确认名额…" : "确认模拟预约" }}
              </button>
            </fieldset>
          </form></template
        ><template v-else
          ><p>
            {{ slotsLoading ? "正在载入所选场次…" : "请先选择路线和场次。" }}
          </p>
          <RouterLink class="wk-primary" to="/routes"
            >选择路线</RouterLink
          ></template
        >
      </section>
      <section v-else-if="recordPage || receiptPage" class="wk-section">
        <span class="wk-kicker">YOUR WEEKEND / SERVER RECORDS</span>
        <h1>{{ receiptPage ? "周末，有了着落。" : "我的周末预约。" }}</h1>
        <p class="wk-lead">
          仅当前演示会话可见。刷新从服务器查询，Cookie 不会写入分享链接。
        </p>
        <button
          class="wk-secondary"
          :disabled="store.busy"
          @click="store.refresh"
        >
          刷新预约状态
        </button>
        <div v-if="receiptPage && !currentBooking" class="wk-empty">
          <h2>没有可访问的回执。</h2>
          <p>记录可能不存在、属于其他会话，或会话已过期。</p>
          <RouterLink to="/records">查看当前会话预约</RouterLink>
        </div>
        <div v-else-if="!store.bookings.length" class="wk-empty">
          <h2>还没有预约。</h2>
          <RouterLink class="wk-primary" to="/routes">挑选周末路线</RouterLink>
        </div>
        <div class="wk-records">
          <article
            v-for="booking in receiptPage
              ? currentBooking
                ? [currentBooking]
                : []
              : store.bookings"
            :key="booking.id"
            class="wk-record"
          >
            <span
              class="wk-badge"
              :class="{ inactive: booking.status !== 'CONFIRMED' }"
              >{{ statusText[booking.status] }}</span
            >
            <h2>{{ booking.routeTitle }}</h2>
            <p>
              {{ time(booking.startsAt) }} · {{ booking.participantCount }} 人 ·
              {{ booking.alias || "周末探索者" }}
            </p>
            <code>{{ booking.id }}</code>
            <div class="wk-actions">
              <RouterLink
                v-if="!receiptPage"
                class="wk-link"
                :to="`/success/${booking.id}`"
                >查看回执 →</RouterLink
              ><button
                v-if="booking.status === 'CONFIRMED'"
                class="wk-secondary"
                :disabled="store.busy || store.pending"
                @click="cancelling = booking"
              >
                取消预约
              </button>
            </div>
          </article>
        </div>
        <details v-if="legacy.bookings.length" class="wk-legacy">
          <summary>
            旧版本地历史 · {{ legacy.bookings.length }} 条（不计入服务端名额）
          </summary>
          <p>这些记录仅保存在当前浏览器，从未上传或迁移为服务端预约。</p>
          <p v-for="item in legacy.bookings" :key="item.id">
            {{ item.nickname }} · {{ item.tickets }} 人 ·
            {{ item.status === "confirmed" ? "旧版已确认" : "旧版已取消" }} ·
            {{ item.id }}
          </p>
        </details>
      </section>
      <section v-else-if="!knownPage || routePage" class="wk-empty">
        <h1>这条路线暂时找不到。</h1>
        <p>地址可能已失效，回到全部路线重新选择。</p>
        <RouterLink class="wk-primary" to="/routes">查看全部路线</RouterLink>
      </section>
      <p class="wk-clock">
        服务端时间 {{ time(store.serverTime) }} · 演示会话有效至
        {{ time(store.expiresAt) }}
      </p>
    </template>
    <dialog
      ref="dialog"
      class="wk-dialog"
      aria-labelledby="wk-cancel-title"
      @cancel="!store.busy && (cancelling = null)"
    >
      <h2 id="wk-cancel-title">给计划留点弹性。</h2>
      <p>
        确认取消「{{ cancelling?.routeTitle }}」？服务端确认后释放模拟名额。
      </p>
      <p v-if="store.error" role="alert">{{ store.error }}</p>
      <div class="wk-actions">
        <button
          class="wk-secondary"
          :disabled="store.busy"
          autofocus
          @click="cancelling = null"
        >
          保留预约</button
        ><button
          class="wk-primary"
          :disabled="store.busy || store.pending"
          @click="confirmCancel"
        >
          {{ store.busy ? "取消中…" : "确认取消" }}
        </button>
      </div>
    </dialog>
  </div>
</template>
