import { describe, expect, it, vi } from "vitest";
import { PENDING_KEY, WeekendClient, type StoragePort } from "./client";

function memory(): StoragePort {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
const good = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      requestId: "r",
      serverTime: "2026-10-12T12:00:00Z",
    }),
    { status: 200 },
  );
const bad = (status: number, code: string) =>
  new Response(
    JSON.stringify({
      error: { code },
      requestId: "r",
      serverTime: "2026-10-12T12:00:00Z",
    }),
    { status },
  );
describe("weekend pending request recovery", () => {
  it("requests resume-only when identity may be lost and retains the pending intent on 401", async () => {
    const storage = memory();
    storage.setItem(
      PENDING_KEY,
      JSON.stringify({
        operation: "bookings.create",
        key: "prior-request",
        path: "/bookings",
        body: '{"slotId":"slow-1"}',
      }),
    );
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => bad(401, "SESSION_EXPIRED"));
    const client = new WeekendClient(storage, send);
    await expect(client.connect()).rejects.toThrow("过期");
    expect(send.mock.calls[0][1]?.body).toBe('{"resumeOnly":true}');
    expect(client.pending?.key).toBe("prior-request");
    expect(storage.getItem(PENDING_KEY)).not.toBeNull();
    await expect(client.retry()).rejects.toThrow("过期");
    expect(client.pending?.key).toBe("prior-request");
    client.abandonIdentityRecovery();
    expect(client.pending).toBeNull();
    expect(storage.getItem(`${PENDING_KEY}-archive-prior-request`)).toContain(
      "UNKNOWN",
    );
  });
  it("persists intent before I/O and reuses exact body/key across a refresh after lost response", async () => {
    const storage = memory();
    const send = vi.fn<typeof fetch>();
    send
      .mockImplementationOnce(async () => {
        expect(storage.getItem(PENDING_KEY)).not.toBeNull();
        throw new Error("response lost");
      })
      .mockResolvedValueOnce(good({ id: "booking-1" }));
    const first = new WeekendClient(storage, send);
    await expect(
      first.write("bookings.create", "/bookings", {
        slotId: "slow-1",
        participantCount: 2,
      }),
    ).rejects.toThrow("结果暂不确定");
    const second = new WeekendClient(storage, send);
    expect(second.pending).toEqual(first.pending);
    await expect(second.retry()).resolves.toEqual({ id: "booking-1" });
    expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body);
    expect(send.mock.calls[0][1]?.headers).toEqual(
      send.mock.calls[1][1]?.headers,
    );
    expect(storage.getItem(PENDING_KEY)).toBeNull();
  });
  it("blocks a changed intent while the previous operation remains uncertain", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const client = new WeekendClient(memory(), send);
    await expect(
      client.write("bookings.create", "/bookings", { slotId: "slow-1" }),
    ).rejects.toThrow();
    await expect(
      client.write("bookings.create", "/bookings", { slotId: "maker-1" }),
    ).rejects.toThrow("先确认");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not send when the durable intent cannot be saved", async () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error("quota");
    };
    const send = vi.fn<typeof fetch>();
    const client = new WeekendClient(storage, send);
    await expect(
      client.write("bookings.create", "/bookings", {}),
    ).rejects.toThrow("尚未发送");
    expect(send).not.toHaveBeenCalled();
  });
  it("retains the original intent after a lookup 404", async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("lost"))
      .mockResolvedValueOnce(bad(404, "NOT_FOUND"));
    const client = new WeekendClient(memory(), send);
    await expect(
      client.write("bookings.cancel", "/bookings/booking-1/cancel", {}),
    ).rejects.toThrow();
    const key = client.pending?.key;
    await expect(client.lookup()).rejects.toThrow();
    expect(client.pending?.key).toBe(key);
  });
  it("clears only a definitive business rejection and keeps 503 uncertain", async () => {
    const client = new WeekendClient(
      memory(),
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(bad(409, "SOLD_OUT"))
        .mockResolvedValueOnce(bad(503, "UNAVAILABLE")),
    );
    await expect(
      client.write("bookings.create", "/bookings", {}),
    ).rejects.toThrow("名额不足");
    expect(client.pending).toBeNull();
    await expect(
      client.write("bookings.create", "/bookings", {}),
    ).rejects.toThrow();
    expect(client.pending).not.toBeNull();
  });
  it("rejects malformed successful transport instead of inventing business success", async () => {
    const client = new WeekendClient(
      memory(),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("<html>static host</html>", { status: 200 }),
        ),
    );
    await expect(
      client.write("bookings.create", "/bookings", {}),
    ).rejects.toThrow("结果暂不确定");
    expect(client.pending).not.toBeNull();
  });
});
