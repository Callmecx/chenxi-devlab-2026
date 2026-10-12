import type { Envelope, ShopSession } from '../../../../../packages/shared/src/api';
export type { Cart, DemoAddress, Order, Quote, Operation } from '../../../../../packages/shared/src/api';
export interface Race { id: string; stock: number; winner: 'A' | 'B' | null; attempts: Array<{ actor: 'A' | 'B'; success: boolean; at: string }> }
export interface OrderIntent { key: string; body: { quoteId: string }; createdAt: string }
export class ExperimentError extends Error { constructor(message: string, readonly code: string, readonly status: number) { super(message); } }
export const newKey = () => crypto.randomUUID();
export function orderIntent(quoteId: string, key: string = newKey()): OrderIntent {
  return { key, body: { quoteId }, createdAt: new Date().toISOString() };
}
export function parseIntent(raw: string | null): OrderIntent | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || !value) return null;
    const data = value as Partial<OrderIntent>;
    if (typeof data.key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(data.key) || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) || !data.body || typeof data.body.quoteId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.body.quoteId) || Object.keys(data.body).length !== 1) return null;
    return { key: data.key, body: { quoteId: data.body.quoteId }, createdAt: data.createdAt };
  } catch { return null; }
}
/** Archive only the request, never an identity token. Archived requests must not be replayed in a new session. */
export function archiveIntent(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string, intent: OrderIntent): number {
  let previous: OrderIntent[] = [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (Array.isArray(raw)) previous = raw.map(item => parseIntent(JSON.stringify(item))).filter((item): item is OrderIntent => item !== null);
  } catch { /* A corrupt archive must not prevent preserving the current valid request. */ }
  const records = [...previous.filter(item => item.key !== intent.key), intent].slice(-5);
  storage.setItem(key, JSON.stringify(records));
  return records.length;
}
export class ExperimentClient {
  token = '';
  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args)) {}
  async connect(signal?: AbortSignal, hasPendingIntent = false) {
    if (hasPendingIntent) throw new ExperimentError('原订单请求仍未处理，但本标签页会话身份已丢失。禁止创建新身份并重放旧请求；原键与内容已保留，可在下方明确归档并放弃旧恢复入口。', 'RECOVERY_IDENTITY_MISSING', 401);
    const session = await this.request<ShopSession>('/demo/session', { method: 'POST', body: {}, signal });
    this.token = session.data.token;
    return session;
  }
  async request<T>(path: string, options: { method?: 'GET' | 'POST'; body?: object; key?: string; signal?: AbortSignal } = {}): Promise<Envelope<T>> {
    const response = await this.transport(`/api/v1/shop${path}`, {
      method: options.method ?? 'GET', signal: options.signal,
      headers: { Accept: 'application/json', ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
      ...(options.method === 'POST' ? { body: JSON.stringify(options.body ?? {}) } : {}),
    });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new ExperimentError('当前地址没有可用的 JSON 演示服务；尚未验证任何服务端结果。', 'SERVICE_UNAVAILABLE', response.status);
    const payload = await response.json();
    if (!response.ok) throw new ExperimentError(payload.error?.message ?? '服务请求失败。', payload.error?.code ?? 'UNKNOWN', response.status);
    if (!payload || !('data' in payload) || typeof payload.requestId !== 'string' || typeof payload.serverTime !== 'string') throw new ExperimentError('响应不符合演示 API 协议；无法确认结果。', 'INVALID_RESPONSE', response.status);
    return payload as Envelope<T>;
  }
}
