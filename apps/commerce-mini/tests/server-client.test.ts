import { describe, expect, it, vi } from "vitest";
import {
  SelectClient,
  SHOP_PENDING_KEY,
  SHOP_SESSION_KEY,
  type Sender,
  type ShopStorage,
} from "../src/v2/client";

function memory(): ShopStorage {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}
const good = (data: unknown) => ({
  status: 200,
  data: { data, requestId: "r", serverTime: "2026-10-12T12:00:00Z" },
});
const bad = (status: number, code: string) => ({
  status,
  data: { error: { code }, requestId: "r", serverTime: "2026-10-12T12:00:00Z" },
});
describe("Select service recovery contract", () => {
  it.each(["UNAUTHORIZED", "SESSION_EXPIRED", "IDEMPOTENCY_CONFLICT"])(
    "preserves uncertain order intent when recovery returns %s",
    async (code) => {
      const storage = memory();
      const send = vi
        .fn<Sender>()
        .mockRejectedValueOnce(new Error("response lost"))
        .mockResolvedValueOnce(
          bad(code === "IDEMPOTENCY_CONFLICT" ? 409 : 401, code),
        );
      const client = new SelectClient(storage, send);
      await expect(
        client.write("orders.create", "/orders", { quoteId: "original" }),
      ).rejects.toThrow();
      const key = client.pending?.key;
      await expect(client.retry()).rejects.toThrow();
      expect(client.pending?.key).toBe(key);
      expect(storage.get(SHOP_PENDING_KEY)).toBeTruthy();
    },
  );
  it("archives unknown intent on explicit abandonment without creating a new session", async () => {
    const storage = memory();
    storage.set(
      SHOP_PENDING_KEY,
      JSON.stringify({
        operation: "orders.create",
        path: "/orders",
        key: "old-intent",
        body: '{"quoteId":"q"}',
      }),
    );
    const send = vi.fn<Sender>();
    const client = new SelectClient(storage, send);
    await expect(client.connect()).rejects.toThrow();
    client.abandonIdentityRecovery();
    expect(client.pending).toBeNull();
    expect(client.session).toBeNull();
    expect(
      String(storage.get(`${SHOP_PENDING_KEY}-archive-old-intent`)),
    ).toContain("UNKNOWN");
    expect(send).not.toHaveBeenCalled();
  });
  it("keeps original quote body and key after a response loss and application restart", async () => {
    const storage = memory();
    const send = vi
      .fn<Sender>()
      .mockImplementationOnce(async () => {
        expect(storage.get(SHOP_PENDING_KEY)).toBeTruthy();
        throw new Error("lost");
      })
      .mockResolvedValueOnce(good({ id: "order-1" }));
    const first = new SelectClient(storage, send);
    await expect(
      first.write("orders.create", "/orders", { quoteId: "quote-1" }),
    ).rejects.toThrow("结果暂不确定");
    const second = new SelectClient(storage, send);
    await expect(second.retry()).resolves.toEqual({ id: "order-1" });
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    expect(storage.get(SHOP_PENDING_KEY)).toBeUndefined();
  });
  it("prevents editing or resetting while an intent is unresolved", async () => {
    const send = vi.fn<Sender>().mockRejectedValue(new Error("offline"));
    const client = new SelectClient(memory(), send);
    await expect(
      client.write("orders.create", "/orders", { quoteId: "original" }),
    ).rejects.toThrow();
    await expect(
      client.write("orders.create", "/orders", { quoteId: "different" }),
    ).rejects.toThrow("先确认");
    await expect(client.write("demo.reset", "/demo/reset", {})).rejects.toThrow(
      "先确认",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not transmit an order without durable pending storage", async () => {
    const storage = memory();
    storage.set = () => {
      throw new Error("disk");
    };
    const send = vi.fn<Sender>();
    await expect(
      new SelectClient(storage, send).write("orders.create", "/orders", {}),
    ).rejects.toThrow("尚未发送");
    expect(send).not.toHaveBeenCalled();
  });
  it("does not treat operation-not-found as permission to change the key", async () => {
    const send = vi
      .fn<Sender>()
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(bad(404, "NOT_FOUND"));
    const client = new SelectClient(memory(), send);
    await expect(
      client.write("orders.create", "/orders", { quoteId: "q" }),
    ).rejects.toThrow();
    const pending = client.pending;
    await expect(client.lookup()).rejects.toThrow();
    expect(client.pending).toEqual(pending);
  });
  it("checks application errors even when transport completes successfully", async () => {
    const client = new SelectClient(
      memory(),
      vi.fn<Sender>().mockResolvedValue(bad(409, "CART_CHANGED")),
    );
    await expect(client.write("cart.add", "/cart/items", {})).rejects.toThrow(
      "购物袋已更新",
    );
    expect(client.pending).toBeNull();
  });
  it("uses the saved bearer token without issuing an extra session creation", async () => {
    const storage = memory();
    storage.set(
      SHOP_SESSION_KEY,
      JSON.stringify({
        token: "demo-token",
        expiresAt: "2099-01-01T00:00:00Z",
        mode: "server-demo",
        ruleVersion: "v2",
      }),
    );
    const send = vi
      .fn<Sender>()
      .mockResolvedValue(good({ version: 0, items: [] }));
    const client = new SelectClient(storage, send);
    await client.connect();
    await client.request("/cart");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2].Authorization).toBe("Bearer demo-token");
  });
  it.each(["missing", "expired"])(
    "cannot silently replace a %s session while an order is unresolved",
    async (identity) => {
      const storage = memory();
      if (identity === "expired")
        storage.set(
          SHOP_SESSION_KEY,
          JSON.stringify({
            token: "expired-session",
            expiresAt: "2000-01-01T00:00:00Z",
            mode: "server-demo",
            ruleVersion: "v2",
          }),
        );
      storage.set(
        SHOP_PENDING_KEY,
        JSON.stringify({
          operation: "orders.create",
          path: "/orders",
          key: "old-intent",
          body: '{"quoteId":"q"}',
        }),
      );
      const send = vi.fn<Sender>();
      await expect(new SelectClient(storage, send).connect()).rejects.toThrow(
        "不会自动换会话",
      );
      expect(send).not.toHaveBeenCalled();
    },
  );
});
