import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useCampaign } from './store';

beforeEach(() => {
  setActivePinia(createPinia());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Pulse asynchronous booking store', () => {
  function validStore() {
    const store = useCampaign();
    store.draft = {
      selectedIds: ['print', 'talk'],
      nickname: '演示星人',
      tickets: 2,
      note: '',
      consent: true,
    };
    return store;
  }
  it('holds a submission lock and creates exactly one booking', async () => {
    const store = validStore();
    const pending = store.submit(false);
    expect(store.submitting).toBe(true);
    expect(await store.submit(false)).toEqual({ error: '预约正在提交，请稍候。' });
    await vi.advanceTimersByTimeAsync(900);
    const result = await pending;
    expect(result.id).toMatch(/^PL-/);
    expect(store.bookings).toHaveLength(1);
    expect(store.submitting).toBe(false);
    expect(store.draft.selectedIds).toEqual([]);
    expect(store.attendanceCount).toBe(4);
  });
  it('keeps a failed draft and permits a successful retry', async () => {
    const store = validStore();
    const failed = store.submit(true);
    await vi.advanceTimersByTimeAsync(900);
    expect((await failed).error).toContain('模拟服务暂时不可用');
    expect(store.bookings).toHaveLength(0);
    expect(store.draft.nickname).toBe('演示星人');
    expect(store.submitting).toBe(false);
    const retry = store.submit(false);
    await vi.advanceTimersByTimeAsync(900);
    expect((await retry).id).toBeDefined();
    expect(store.bookings).toHaveLength(1);
  });
  it('submits a fixed snapshot even if a draft changes during the simulated request', async () => {
    const store = validStore();
    const pending = store.submit(false);
    store.draft.nickname = '临时修改';
    await vi.advanceTimersByTimeAsync(900);
    await pending;
    expect(store.bookings[0].nickname).toBe('演示星人');
  });
  it('cancels a booking and updates statistics without deleting the audit record', async () => {
    const store = validStore();
    const pending = store.submit(false);
    await vi.advanceTimersByTimeAsync(900);
    const result = await pending;
    store.cancel(result.id!);
    expect(store.bookings).toHaveLength(1);
    expect(store.bookings[0].status).toBe('cancelled');
    expect(store.confirmed).toHaveLength(0);
    expect(store.attendanceCount).toBe(0);
    expect(store.experienceCount).toBe(0);
  });
  it('survives malformed local data and storage write failures', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{bad-json',
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    });
    const store = useCampaign();
    expect(store.storageWarning).toContain('无法读取');
    expect(store.bookings).toEqual([]);
    store.draft.nickname = '新昵称';
    expect(store.storageWarning).toContain('无法保存');
    expect(store.draft.nickname).toBe('新昵称');
  });
  it('handles an unexpected local runtime error without leaving the submission locked', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => {
        throw new Error('Unavailable random generator');
      },
    });
    const store = validStore();
    const pending = store.submit(false);
    await vi.advanceTimersByTimeAsync(900);
    expect((await pending).error).toContain('草稿已保留');
    expect(store.submitting).toBe(false);
    expect(store.draft.nickname).toBe('演示星人');
    expect(store.bookings).toHaveLength(0);
  });
});
