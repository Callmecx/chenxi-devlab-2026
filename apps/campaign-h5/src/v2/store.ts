import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  recommendRoutes,
  type Booking,
  type Campaign,
  type CampaignRoute,
  type CreateBookingInput,
  type Preferences,
  type Slot,
} from "../../../../packages/shared/src/api";
import { WeekendClient } from "./client";

export const useWeekend = defineStore("weekend-v2", () => {
  const mode = ref<"local" | "server">("local");
  const error = ref(""),
    notice = ref(""),
    busy = ref(false),
    connected = ref(false),
    loading = ref(false);
  const pending = ref(false),
    expiresAt = ref(""),
    serverTime = ref("");
  const identityLost = ref(false);
  const campaign = ref<Campaign | null>(null),
    routes = ref<CampaignRoute[]>([]),
    slots = ref<Slot[]>([]),
    bookings = ref<Booking[]>([]);
  const preferences = ref<Preferences>({
    theme: "quiet",
    environment: "any",
    minutes: 120,
  });
  let client: WeekendClient | undefined;
  let recordsGeneration = 0;
  let generation = 0,
    slotGeneration = 0;
  try {
    if (localStorage.getItem("chenxi-weekend-mode-v2") === "server")
      mode.value = "server";
  } catch {
    /* Default remains explicitly local. */
  }
  function api() {
    return (client ??= new WeekendClient(localStorage));
  }
  function sync() {
    pending.value = !!client?.pending;
    identityLost.value = !!client?.identityLost;
    serverTime.value = client?.serverTime || "";
  }
  function message(reason: unknown) {
    error.value =
      reason instanceof Error ? reason.message : "请求失败，请重试。";
    sync();
  }
  async function setMode(value: "local" | "server") {
    if (loading.value) {
      notice.value = "正在连接服务，请等待连接结果后再切换模式。";
      return;
    }
    if (busy.value || pending.value) {
      error.value = "请先确认在途请求，避免丢失操作结果。";
      return;
    }
    mode.value = value;
    generation++;
    connected.value = false;
    error.value = "";
    try {
      localStorage.setItem("chenxi-weekend-mode-v2", value);
    } catch {
      notice.value = "模式偏好无法保存，刷新后将回到本地演示。";
    }
    if (value === "server") await connect();
  }
  async function connect() {
    if (loading.value || busy.value) return;
    const current = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const session = await api().connect();
      const [activity, list, records] = await Promise.all([
        api().request<Campaign>("/campaigns/weekend"),
        api().request<CampaignRoute[]>("/campaigns/weekend/routes"),
        api().request<Booking[]>("/bookings"),
      ]);
      if (current !== generation) return;
      campaign.value = activity;
      routes.value = list;
      bookings.value = records;
      expiresAt.value = session.expiresAt;
      connected.value = true;
    } catch (reason) {
      if (current === generation) {
        connected.value = false;
        message(reason);
      }
    } finally {
      if (current === generation) {
        loading.value = false;
        sync();
      }
    }
  }
  async function loadSlots(id: string) {
    const current = ++slotGeneration,
      scope = generation;
    slots.value = [];
    error.value = "";
    try {
      const data = await api().request<Slot[]>(
        `/routes/${encodeURIComponent(id)}/slots`,
      );
      if (current === slotGeneration && scope === generation)
        slots.value = data;
    } catch (reason) {
      if (current === slotGeneration && scope === generation) message(reason);
    } finally {
      sync();
    }
  }
  async function refresh() {
    error.value = "";
    const scope = generation;
    const current = ++recordsGeneration;
    try {
      const data = await api().request<Booking[]>("/bookings");
      if (scope === generation && current === recordsGeneration)
        bookings.value = data;
    } catch (reason) {
      if (scope === generation && current === recordsGeneration)
        message(reason);
    } finally {
      sync();
    }
  }
  async function write(
    operation: string,
    path: string,
    body: unknown,
  ): Promise<Booking | undefined> {
    if (busy.value) return;
    recordsGeneration++;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      const booking = await api().write<Booking>(operation, path, body);
      await refresh();
      return booking;
    } catch (reason) {
      message(reason);
    } finally {
      busy.value = false;
      sync();
    }
  }
  const book = (body: CreateBookingInput) =>
    write("bookings.create", "/bookings", body);
  const cancel = (id: string) =>
    write("bookings.cancel", `/bookings/${encodeURIComponent(id)}/cancel`, {});
  async function recover(lookup: boolean) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      if (lookup) await api().lookup();
      else await api().retry();
      await refresh();
      notice.value = "原请求结果已确认，请查看我的预约。";
    } catch (reason) {
      message(reason);
      if (lookup && client?.pending)
        error.value += " 查询未成功不代表请求未执行，请使用原请求重试。";
    } finally {
      busy.value = false;
      sync();
    }
  }
  const recommendations = computed(() =>
    recommendRoutes(routes.value, preferences.value),
  );
  function abandonIdentityRecovery() {
    try {
      api().abandonIdentityRecovery();
      connected.value = false;
      error.value = "";
      notice.value =
        "已停止原会话恢复，未知结果的原请求已在本机归档。这不会撤销服务端结果。请手动选择下一次体验。";
    } catch (reason) {
      message(reason);
    } finally {
      sync();
    }
  }
  return {
    mode,
    error,
    notice,
    busy,
    pending,
    identityLost,
    abandonIdentityRecovery,
    connected,
    loading,
    campaign,
    routes,
    slots,
    bookings,
    preferences,
    recommendations,
    expiresAt,
    serverTime,
    setMode,
    connect,
    loadSlots,
    refresh,
    book,
    cancel,
    recover,
  };
});
