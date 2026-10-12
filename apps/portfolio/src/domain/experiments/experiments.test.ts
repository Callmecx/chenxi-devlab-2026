import { describe, expect, it, vi } from 'vitest';
import { archiveIntent, ExperimentClient, orderIntent, parseIntent } from './client';
import { ROW_COUNT, rowAt, selectIndices, visibleWindow, WorkerGeneration } from './list';

describe('experiment data and virtual window', () => {
  it('filters the whole generated dataset and sorts by numeric values, stably', () => {
    const matches = selectIndices(ROW_COUNT, 'LAB-100000', 'id');
    expect([...matches]).toEqual([99_999]);
    const sorted = [...selectIndices(500, '基础设施', 'value-desc')];
    expect(sorted.length).toBe(125);
    expect(sorted.every(index => rowAt(index).category === '基础设施')).toBe(true);
    expect(sorted.map(index => rowAt(index).value)).toEqual(sorted.map(index => rowAt(index).value).sort((a, b) => b - a));
  });
  it('bounds rendered work independently of 100k records and handles empty/end windows', () => {
    expect(visibleWindow(100_000, 2_200_000, 440)).toEqual({ start: 49_995, end: 50_015 });
    expect(visibleWindow(0, 0, 440)).toEqual({ start: 0, end: 0 });
    const end = visibleWindow(100_000, 4_399_560, 440);
    expect(end.end).toBe(100_000); expect(end.start).toBeGreaterThan(99_980);
  });
  it('terminates old workers and refuses queued messages after replacement or leaving', () => {
    const gate = new WorkerGeneration(); const first = { terminate: vi.fn() }; const second = { terminate: vi.fn() };
    const old = gate.start(first); const current = gate.start(second);
    expect(first.terminate).toHaveBeenCalledOnce(); expect(gate.accepts(old)).toBe(false); expect(gate.accepts(current)).toBe(true);
    gate.cancel(); expect(second.terminate).toHaveBeenCalledOnce(); expect(gate.accepts(current)).toBe(false);
  });
});
describe('server experiment contract', () => {
  it('cannot create a new identity while an original order intent requires recovery', async () => {
    const transport = vi.fn<typeof fetch>();
    const client = new ExperimentClient(transport);
    await expect(client.connect(undefined, true)).rejects.toMatchObject({ code: 'RECOVERY_IDENTITY_MISSING' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('bounds the explicit-abandonment archive and propagates storage failure before caller clears evidence', () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    for (let index = 0; index < 7; index++) archiveIntent(storage, 'archive', orderIntent(`quote_${index}`, `request_${index}`));
    const archived = JSON.parse(value!);
    expect(archived).toHaveLength(5); expect(archived[0].key).toBe('request_2'); expect(archived[4].body.quoteId).toBe('quote_6');
    const brokenStorage = { ...storage, setItem: () => { throw new Error('quota'); } };
    expect(() => archiveIntent(brokenStorage, 'archive', orderIntent('quote_latest', 'request_latest'))).toThrow('quota');
  });
  it('restores an exact pending key/body, refuses corrupt or extended order requests', () => {
    const original = orderIntent('quote_original', 'request-original');
    expect(parseIntent(JSON.stringify(original))).toEqual(original);
    expect(parseIntent('{broken')).toBeNull();
    expect(parseIntent(JSON.stringify({ ...original, body: { quoteId: 'quote_original', quantity: 3 } }))).toBeNull();
  });
  it('sends identical order intent on retry, with the isolated session and no automatic retry', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('network response lost')).mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 'order-only-one' }, requestId: 'test', serverTime: '2026-10-12T00:00:00.000Z' }), { headers: { 'content-type': 'application/json' } }));
    const api = new ExperimentClient(transport); api.token = 'isolated-demo-token'; const pending = orderIntent('quote_original', 'request-original');
    await expect(api.request('/orders', { method: 'POST', ...pending })).rejects.toThrow('network response lost');
    expect(transport).toHaveBeenCalledTimes(1);
    await api.request('/orders', { method: 'POST', ...pending });
    expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
    expect(transport.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer isolated-demo-token', 'Idempotency-Key': pending.key });
  });
  it('never interprets an unavailable endpoint or API error as successful server evidence', async () => {
    const unavailable = new ExperimentClient(vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>Pages fallback</html>', { headers: { 'content-type': 'text/html' } })));
    await expect(unavailable.request('/orders')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const conflict = new ExperimentClient(vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'IDEMPOTENCY_CONFLICT', message: '不同内容' } }), { status: 409, headers: { 'content-type': 'application/json' } })));
    await expect(conflict.request('/orders')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', status: 409 });
  });
});
