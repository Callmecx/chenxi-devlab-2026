import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
  emptyDraft,
  parseBookings,
  parseDraft,
  validateBooking,
  validateSelection,
  type Booking,
  type Draft,
} from './domain';

const STORAGE = 'chenxi-pulse-v1';
export const useCampaign = defineStore('campaign', () => {
  const draft = ref<Draft>(emptyDraft());
  const bookings = ref<Booking[]>([]);
  const storageWarning = ref('');
  const submitting = ref(false);
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const saved: unknown = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1)
        throw new Error('Unsupported storage');
      draft.value = parseDraft('draft' in saved ? saved.draft : undefined);
      bookings.value = parseBookings('bookings' in saved ? saved.bookings : undefined);
    }
  } catch {
    storageWarning.value = '本地记录无法读取，已使用新的演示状态。';
  }

  const persist = () => {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({ version: 1, draft: draft.value, bookings: bookings.value }),
      );
    } catch {
      storageWarning.value = '浏览器暂时无法保存数据；本次页面内的操作仍可继续，刷新后可能丢失。';
    }
  };
  watch([draft, bookings], persist, { deep: true, flush: 'sync' });
  const confirmed = computed(() => bookings.value.filter((b) => b.status === 'confirmed'));
  const attendanceCount = computed(() =>
    confirmed.value.reduce((n, b) => n + b.selectedIds.length * b.tickets, 0),
  );
  const experienceCount = computed(
    () => new Set(confirmed.value.flatMap((b) => b.selectedIds)).size,
  );

  function toggleSession(id: string): string | null {
    if (draft.value.selectedIds.includes(id)) {
      draft.value.selectedIds = draft.value.selectedIds.filter((item) => item !== id);
      return null;
    }
    const next = [...draft.value.selectedIds, id];
    const error = validateSelection(next, draft.value.tickets, bookings.value);
    if (error) return error;
    draft.value.selectedIds = next;
    return null;
  }

  async function submit(fail: boolean): Promise<{ id?: string; error?: string }> {
    if (submitting.value) return { error: '预约正在提交，请稍候。' };
    const snapshot = parseDraft(draft.value);
    const error = validateBooking(snapshot, bookings.value);
    if (error) return { error };
    submitting.value = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (fail) return { error: '模拟服务暂时不可用。草稿已保留，请关闭「模拟失败」后重试。' };
      const recheck = validateBooking(snapshot, bookings.value);
      if (recheck) return { error: recheck };
      const id = `PL-${crypto.randomUUID()}`;
      bookings.value.unshift({
        id,
        selectedIds: [...snapshot.selectedIds],
        nickname: snapshot.nickname.trim(),
        tickets: snapshot.tickets,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
      });
      draft.value = emptyDraft();
      return { id };
    } catch {
      return { error: '本地演示提交失败，草稿已保留。请稍后重试，或使用支持安全上下文的浏览器。' };
    } finally {
      submitting.value = false;
    }
  }

  function cancel(id: string) {
    const booking = bookings.value.find((b) => b.id === id);
    if (booking) booking.status = 'cancelled';
  }
  return {
    draft,
    bookings,
    submitting,
    storageWarning,
    confirmed,
    attendanceCount,
    experienceCount,
    toggleSession,
    submit,
    cancel,
  };
});
