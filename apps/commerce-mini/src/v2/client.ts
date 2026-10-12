import type {
  Envelope,
  Operation,
  ShopSession,
} from "../../../../packages/shared/src/api";

export interface ShopPending {
  operation: string;
  key: string;
  path: string;
  body: string;
}
export interface ShopStorage {
  get(key: string): unknown;
  set(key: string, value: string): void;
  remove(key: string): void;
}
export type Sender = (
  path: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body?: string,
) => Promise<{ status: number; data: unknown }>;
export const SHOP_PENDING_KEY = "chenxi-select-pending-v2";
export const SHOP_SESSION_KEY = "chenxi-select-session-v2";
const messages: Record<string, string> = {
  CONNECTION_UNAVAILABLE:
    "无法连接演示服务。请检查 API 配置与网络，然后重试；不会自动退回本地模拟。",
  API_NOT_CONFIGURED:
    "小程序服务端演示尚未配置 HTTPS API 地址，请使用明确标记的本地演示。",
  VALIDATION_ERROR: "请检查选择的商品、数量和地址。",
  UNAUTHORIZED: "演示会话不可用，请重新连接。",
  SESSION_EXPIRED: "演示会话已过期，请明确开始新体验。",
  NOT_FOUND: "没有找到当前会话可以访问的数据。",
  CART_CHANGED: "购物袋已更新，请刷新并重新确认。",
  OUT_OF_STOCK: "库存不足，请减少数量或更换规格。",
  COUPON_UNAVAILABLE: "优惠券不可用或未达到门槛，请重新选择。",
  QUOTE_EXPIRED: "报价已过期，请重新获取报价。",
  PRICE_CHANGED: "商品价格已变化，请重新报价。",
  ORDER_STATE: "订单状态已变化，请刷新查看可用操作。",
  IDEMPOTENCY_CONFLICT: "相同请求标识不能用于不同内容，请恢复原请求。",
  RATE_LIMITED: "操作频繁，请稍后使用原请求重试。",
};
export class ShopApiError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
  ) {
    super(
      messages[code] ||
        (uncertain
          ? "请求结果暂不确定。原请求已保存，请查询结果或使用原请求重试。"
          : "服务暂时无法完成请求，请稍后重试。"),
    );
  }
}
export const uniStorage: ShopStorage = {
  get: (key) => uni.getStorageSync(key),
  set: (key, value) => uni.setStorageSync(key, value),
  remove: (key) => uni.removeStorageSync(key),
};
export const uniSender: Sender = (path, method, header, data) =>
  new Promise((resolve, reject) => {
    let base = import.meta.env.VITE_SHOP_API_BASE || "/api/v1/shop";
    // #ifndef H5
    base = import.meta.env.VITE_SHOP_API_BASE || "";
    if (!base.startsWith("https://")) {
      reject(new ShopApiError("API_NOT_CONFIGURED"));
      return;
    }
    // #endif
    uni.request({
      url: `${base.replace(/\/$/, "")}${path}`,
      method,
      header,
      ...(data === undefined ? {} : { data }),
      timeout: 12000,
      success: (response) =>
        resolve({ status: response.statusCode, data: response.data }),
      fail: () => reject(new ShopApiError("NETWORK", true)),
    });
  });
function key() {
  return `select-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export class SelectClient {
  identityLost = false;
  pending: ShopPending | null = null;
  session: ShopSession | null = null;
  serverTime = "";
  constructor(
    private storage: ShopStorage = uniStorage,
    private send: Sender = uniSender,
  ) {
    const raw = storage.get(SHOP_PENDING_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(String(raw)) as Partial<ShopPending>;
        if (
          typeof parsed.path !== "string" ||
          !parsed.path.startsWith("/") ||
          typeof parsed.key !== "string" ||
          typeof parsed.body !== "string" ||
          typeof parsed.operation !== "string"
        )
          throw new Error();
        this.pending = parsed as ShopPending;
      } catch {
        throw new Error(
          "待确认请求无法读取，为避免重复下单请保留存储并检查数据。",
        );
      }
    }
    try {
      const cached = JSON.parse(
        String(storage.get(SHOP_SESSION_KEY) || "null"),
      ) as ShopSession | null;
      if (
        cached &&
        typeof cached.token === "string" &&
        typeof cached.expiresAt === "string"
      )
        this.session = cached;
    } catch {
      /* No token is invented from corrupt cache. */
    }
  }
  async request<T>(
    path: string,
    method: "GET" | "POST" = "GET",
    body?: string,
    requestKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.session) headers.Authorization = `Bearer ${this.session.token}`;
    if (requestKey) headers["Idempotency-Key"] = requestKey;
    try {
      const response = await this.send(path, method, headers, body);
      const value = response.data as Envelope<T> & {
        error?: { code?: string };
      };
      if (response.status < 200 || response.status >= 300 || value?.error)
        throw new ShopApiError(
          value?.error?.code || "UNAVAILABLE",
          response.status >= 500 || response.status === 429,
        );
      if (!value || !("data" in value) || typeof value.serverTime !== "string")
        throw new ShopApiError("INVALID_RESPONSE", true);
      this.serverTime = value.serverTime;
      return value.data;
    } catch (reason) {
      if (reason instanceof ShopApiError) {
        if (
          this.pending &&
          ["UNAUTHORIZED", "SESSION_EXPIRED"].includes(reason.code)
        )
          this.identityLost = true;
        if (reason.uncertain && !this.pending)
          throw new ShopApiError("CONNECTION_UNAVAILABLE");
        throw reason;
      }
      throw new ShopApiError(
        this.pending ? "NETWORK" : "CONNECTION_UNAVAILABLE",
        !!this.pending,
      );
    }
  }
  async connect(): Promise<ShopSession> {
    if (this.session && Date.parse(this.session.expiresAt) > Date.now())
      return this.session;
    if (this.pending) {
      this.identityLost = true;
      throw new Error(
        "上次会话有待确认请求。请先查询或重试原请求，不会自动换会话。",
      );
    }
    const session = await this.request<ShopSession>(
      "/demo/session",
      "POST",
      "{}",
    );
    try {
      this.storage.set(SHOP_SESSION_KEY, JSON.stringify(session));
    } catch {
      throw new Error("无法保存演示会话。请恢复设备存储后连接，暂不允许下单。");
    }
    this.session = session;
    return session;
  }
  async write<T>(operation: string, path: string, body: unknown): Promise<T> {
    const serialized = JSON.stringify(body);
    const initial = !this.pending;
    if (
      this.pending &&
      (this.pending.path !== path ||
        this.pending.body !== serialized ||
        this.pending.operation !== operation)
    )
      throw new Error("请先确认上一条请求的结果，再开始新操作。");
    if (!this.pending) {
      const next = { operation, path, body: serialized, key: key() };
      try {
        this.storage.set(SHOP_PENDING_KEY, JSON.stringify(next));
      } catch {
        throw new Error("无法保存原请求，尚未发送。请恢复设备存储后重试。");
      }
      this.pending = next;
    }
    return this.retry<T>(initial);
  }
  async retry<T>(initial = false): Promise<T> {
    if (!this.pending) throw new Error("没有待确认请求。");
    try {
      const result = await this.request<T>(
        this.pending.path,
        "POST",
        this.pending.body,
        this.pending.key,
      );
      this.clear();
      return result;
    } catch (reason) {
      if (
        initial &&
        reason instanceof ShopApiError &&
        !reason.uncertain &&
        !["UNAUTHORIZED", "SESSION_EXPIRED", "IDEMPOTENCY_CONFLICT"].includes(
          reason.code,
        )
      )
        this.clear();
      throw reason;
    }
  }
  async lookup() {
    if (!this.pending) throw new Error("没有待确认请求。");
    const result = await this.request<Operation>(
      `/operations/${encodeURIComponent(this.pending.key)}?operation=${encodeURIComponent(this.pending.operation)}`,
    );
    if (result.status === "SUCCEEDED") this.clear();
    return result;
  }
  private clear() {
    this.storage.remove(SHOP_PENDING_KEY);
    this.pending = null;
  }
  abandonIdentityRecovery() {
    if (!this.identityLost || !this.pending)
      throw new Error("当前仍可使用原请求恢复，不允许直接放弃。");
    this.storage.set(
      `${SHOP_PENDING_KEY}-archive-${this.pending.key}`,
      JSON.stringify({
        ...this.pending,
        abandonedAt: new Date().toISOString(),
        outcome: "UNKNOWN",
      }),
    );
    this.storage.remove(SHOP_SESSION_KEY);
    this.session = null;
    this.clear();
    this.identityLost = false;
  }
}
