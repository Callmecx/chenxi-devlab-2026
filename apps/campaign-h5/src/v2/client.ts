import type { Envelope, Operation } from "../../../../packages/shared/src/api";

export interface PendingWrite {
  operation: string;
  key: string;
  path: string;
  body: string;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export const PENDING_KEY = "chenxi-weekend-pending-v2";
const messages: Record<string, string> = {
  CONNECTION_UNAVAILABLE:
    "无法连接演示服务。请检查本地 API 是否运行，然后重试；当前没有生成新的预约。",
  VALIDATION_ERROR: "填写内容不符合规则，请检查人数、代号与规则确认。",
  UNAUTHORIZED: "演示会话不可用，请重新连接。",
  SOLD_OUT: "该场次名额不足，请刷新后选择其他场次。",
  BOOKING_EXISTS: "当前会话已有有效预约，请前往我的预约查看。",
  SLOT_CLOSED: "该场次已截止、结束或取消，请重新选择。",
  INVALID_INPUT: "填写内容不符合规则，请检查人数、代号与规则确认。",
  DEMO_SESSION_EXPIRED:
    "演示会话已过期。请明确开始新体验，旧预约不会自动恢复。",
  SESSION_EXPIRED: "演示会话已过期，请重新连接并开始新体验。",
  NOT_FOUND: "未找到当前会话可访问的记录。",
  SLOT_FULL: "该场次名额不足，请刷新后选择其他场次。",
  BOOKING_CLOSED: "该场次已停止预约。",
  ACTIVITY_CANCELLED: "活动已取消。",
  SLOT_CANCELLED: "该场次已取消。",
  ALREADY_BOOKED: "当前演示会话已有有效预约，请前往我的预约查看。",
  RULES_CHANGED: "活动规则已更新，请刷新并重新确认。",
  IDEMPOTENCY_CONFLICT: "相同请求标识对应了不同内容，请恢复原请求。",
  CANCEL_DEADLINE_PASSED: "已过取消期限，请刷新查看当前状态。",
  STATE_CONFLICT: "状态已更新，请刷新后重试。",
  RATE_LIMITED: "操作过于频繁，请稍后使用原请求重试。",
};
export class ServiceError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
  ) {
    super(
      messages[code] ||
        (uncertain
          ? "请求结果暂不确定。原请求已保留，请查询结果或使用原请求重试。"
          : "服务暂时无法完成请求，请重试。"),
    );
  }
}
export class WeekendClient {
  serverTime = "";
  identityLost = false;
  pending: PendingWrite | null = null;
  constructor(
    private storage: StoragePort,
    private send: typeof fetch = (...args) => fetch(...args),
  ) {
    try {
      const raw = storage.getItem(PENDING_KEY);
      if (raw) {
        const value = JSON.parse(raw) as Partial<PendingWrite>;
        if (
          typeof value.key === "string" &&
          typeof value.operation === "string" &&
          typeof value.path === "string" &&
          value.path.startsWith("/") &&
          typeof value.body === "string"
        )
          this.pending = value as PendingWrite;
        else throw new Error("Invalid pending operation");
      }
    } catch {
      throw new Error(
        "待确认请求无法读取。为避免重复预约，请保留当前浏览器数据并检查存储。",
      );
    }
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await this.send(`/api/v1/h5${path}`, {
        ...init,
        credentials: "include",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Chenxi-App": "h5",
          ...init.headers,
        },
      });
      const body = (await response.json()) as Envelope<T> & {
        error?: { code?: string };
      };
      if (!response.ok || body.error)
        throw new ServiceError(
          body.error?.code || "UNAVAILABLE",
          response.status >= 500 || response.status === 429,
        );
      if (!body || !("data" in body) || typeof body.serverTime !== "string")
        throw new ServiceError("INVALID_RESPONSE", true);
      this.serverTime = body.serverTime;
      return body.data;
    } catch (error) {
      if (error instanceof ServiceError) {
        if (
          this.pending &&
          ["UNAUTHORIZED", "SESSION_EXPIRED", "DEMO_SESSION_EXPIRED"].includes(
            error.code,
          )
        )
          this.identityLost = true;
        if (error.uncertain && !this.pending)
          throw new ServiceError("CONNECTION_UNAVAILABLE");
        throw error;
      }
      throw new ServiceError(
        this.pending ? "NETWORK" : "CONNECTION_UNAVAILABLE",
        !!this.pending,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  connect() {
    return this.request<{ expiresAt: string; rulesVersion: string }>(
      "/demo-sessions",
      { method: "POST", body: this.pending ? '{"resumeOnly":true}' : "{}" },
    );
  }
  async write<T>(operation: string, path: string, body: unknown): Promise<T> {
    const serialized = JSON.stringify(body);
    const initial = !this.pending;
    if (
      this.pending &&
      (this.pending.operation !== operation ||
        this.pending.path !== path ||
        this.pending.body !== serialized)
    )
      throw new Error("先确认上一条请求的结果，再开始新操作。");
    if (!this.pending) {
      const next = {
        operation,
        path,
        body: serialized,
        key: crypto.randomUUID(),
      };
      try {
        this.storage.setItem(PENDING_KEY, JSON.stringify(next));
      } catch {
        throw new Error("浏览器无法保存请求，尚未发送预约。请恢复存储后再试。");
      }
      this.pending = next;
    }
    return this.retry<T>(initial);
  }
  async retry<T>(initial = false): Promise<T> {
    const pending = this.pending;
    if (!pending) throw new Error("没有待确认请求。");
    try {
      const data = await this.request<T>(pending.path, {
        method: "POST",
        body: pending.body,
        headers: { "Idempotency-Key": pending.key },
      });
      this.clear();
      return data;
    } catch (error) {
      if (
        initial &&
        error instanceof ServiceError &&
        !error.uncertain &&
        ![
          "UNAUTHORIZED",
          "SESSION_EXPIRED",
          "DEMO_SESSION_EXPIRED",
          "IDEMPOTENCY_CONFLICT",
        ].includes(error.code)
      )
        this.clear();
      throw error;
    }
  }
  async lookup(): Promise<Operation> {
    if (!this.pending) throw new Error("没有待确认请求。");
    const result = await this.request<Operation>(
      `/operations/${encodeURIComponent(this.pending.key)}?operation=${encodeURIComponent(this.pending.operation)}`,
    );
    if (result.status === "SUCCEEDED") this.clear();
    return result;
  }
  private clear() {
    // If clearing fails, retaining the same idempotency key is safer than generating a second intent.
    this.storage.removeItem(PENDING_KEY);
    this.pending = null;
  }
  abandonIdentityRecovery() {
    if (!this.identityLost || !this.pending)
      throw new Error("当前仍可用原请求恢复，不允许直接放弃。");
    this.storage.setItem(
      `${PENDING_KEY}-archive-${this.pending.key}`,
      JSON.stringify({
        ...this.pending,
        abandonedAt: new Date().toISOString(),
        outcome: "UNKNOWN",
      }),
    );
    this.clear();
    this.identityLost = false;
  }
}
