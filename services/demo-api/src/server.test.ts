import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createService } from "./server.ts";
import { seedState } from "./database.ts";
import { quote } from "./shop.ts";
import { RULE_VERSION } from "../../../packages/shared/src/api.ts";
import type {
  Booking,
  Cart,
  Order,
  Quote,
} from "../../../packages/shared/src/api.ts";
let now: number, app: ReturnType<typeof createService>;
const origin = "http://127.0.0.1:4176";
type Domain = "shop" | "h5";
interface Result<T> {
  status: number;
  data: T;
  error?: { code: string; message: string };
  headers: Record<string, unknown>;
}
async function call<T>(
  domain: Domain,
  path: string,
  credential: string,
  body?: unknown,
  key: string = randomUUID(),
  extra: Record<string, string> = {},
): Promise<Result<T>> {
  const response = await app.inject({
    method: body === undefined ? "GET" : "POST",
    url: `/api/v1/${domain}${path}`,
    headers: {
      origin,
      "content-type": "application/json",
      "x-chenxi-app": "h5",
      "idempotency-key": key,
      ...(domain === "shop"
        ? { authorization: `Bearer ${credential}` }
        : { cookie: credential }),
      ...extra,
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = response.json();
  return {
    status: response.statusCode,
    data: json.data,
    error: json.error,
    headers: response.headers,
  };
}
async function session(domain: Domain) {
  const result = await call<{ token: string }>(
    domain,
    domain === "shop" ? "/demo/session" : "/demo-sessions",
    "",
    {},
  );
  expect(result.status).toBe(200);
  return domain === "shop"
    ? result.data.token
    : String(result.headers["set-cookie"]).split(";")[0]!;
}
async function add(
  token: string,
  skuId = "book-clay",
  quantity = 2,
  cartVersion = 0,
) {
  const result = await call<Cart>("shop", "/cart/items", token, {
    skuId,
    quantity,
    cartVersion,
  });
  expect(result.status).toBe(200);
  return result.data;
}
async function checkout(token: string, couponId?: string) {
  const cart = (await call<Cart>("shop", "/cart", token)).data;
  const result = await call<Quote>("shop", "/checkout/quotes", token, {
    cartVersion: cart.version,
    addressId: "studio",
    ...(couponId ? { couponId } : {}),
  });
  expect(result.status).toBe(200);
  return result.data;
}
async function order(token: string, skuId = "book-clay", quantity = 2) {
  await add(token, skuId, quantity);
  const q = await checkout(token);
  const result = await call<Order>("shop", "/orders", token, { quoteId: q.id });
  expect(result.status).toBe(200);
  return result.data;
}
const booking = (slotId = "slow-1", participantCount = 2) => ({
  slotId,
  participantCount,
  alias: "访客",
  rulesAccepted: true,
  rulesVersion: RULE_VERSION,
  source: "browse",
});
beforeEach(() => {
  now = Date.UTC(2026, 9, 12, 12);
  app = createService({ filename: ":memory:", now: () => now });
});
afterEach(async () => {
  await app.close();
});
describe("shop service: authoritative inventory, money and states", () => {
  it("offers 12 SPU, ≥24 SKU and four categories including zero/one stock", async () => {
    const token = await session("shop");
    const result = await call<Array<{ skus: Array<{ stock: number }> }>>(
      "shop",
      "/products",
      token,
    );
    expect(result.data).toHaveLength(12);
    expect(result.data.flatMap((p) => p.skus).length).toBeGreaterThanOrEqual(
      24,
    );
    expect(result.data.flatMap((p) => p.skus).map((s) => s.stock)).toEqual(
      expect.arrayContaining([0, 1, 5, 20]),
    );
    expect(
      (await call<unknown[]>("shop", "/categories", token)).data,
    ).toHaveLength(4);
  });
  it("computes 5900×2 +600 −1000 =11400 and preserves rule version", async () => {
    const token = await session("shop");
    await add(token);
    await call("shop", "/coupon-templates/C10/claim", token, {});
    const q = await checkout(token, "C10");
    expect(q).toMatchObject({
      subtotal: 11800,
      shipping: 600,
      discount: 1000,
      total: 11400,
      ruleVersion: RULE_VERSION,
    });
    expect(q.lines[0]?.price).toBe(5900);
  });
  it.each([
    [9999, false, 600],
    [10000, true, 600],
    [10001, true, 600],
    [12899, true, 600],
    [12900, true, 0],
    [12901, true, 0],
  ])("checks integer boundary %i cents", async (price, eligible, shipping) => {
    const state = seedState("shop", now);
    state.products[0]!.skus[0]!.price = price;
    state.cart = {
      version: 1,
      items: [
        {
          id: "line",
          skuId: "cup-sand",
          productId: "cup",
          name: "test",
          skuLabel: "test",
          quantity: 1,
          selected: true,
          price,
          version: 1,
          available: 8,
        },
      ],
    };
    state.coupons = [
      {
        id: "C10",
        name: "test",
        minimum: 10000,
        discount: 1000,
        status: "AVAILABLE",
      },
    ];
    if (!eligible)
      expect(() =>
        quote(
          state,
          { cartVersion: 1, addressId: "studio", couponId: "C10" },
          now,
        ),
      ).toThrow("门槛");
    else
      expect(
        quote(
          state,
          { cartVersion: 1, addressId: "studio", couponId: "C10" },
          now,
        ),
      ).toMatchObject({
        subtotal: price,
        shipping,
        discount: 1000,
        total: price + shipping - 1000,
      });
  });
  it.each([0, -1, 1.2, 6, 21, Number.MAX_SAFE_INTEGER])(
    "rejects malformed quantity %s at runtime",
    async (quantity) => {
      const token = await session("shop");
      const result = await call("shop", "/cart/items", token, {
        skuId: "book-clay",
        quantity,
        cartVersion: 0,
      });
      expect(result.status).toBe(400);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    },
  );
  it("rejects supplied client price and unavailable SKU", async () => {
    const token = await session("shop");
    expect(
      (
        await call("shop", "/cart/items", token, {
          skuId: "book-clay",
          quantity: 1,
          cartVersion: 0,
          price: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("shop", "/cart/items", token, {
          skuId: "cup-clay",
          quantity: 1,
          cartVersion: 0,
        })
      ).error?.code,
    ).toBe("OUT_OF_STOCK");
    expect((await call<Cart>("shop", "/cart", token)).data.items).toHaveLength(
      0,
    );
  });
  it("rejects stale cart updates without losing latest state", async () => {
    const token = await session("shop"),
      cart = await add(token);
    const result = await call(
      "shop",
      `/cart/items/${cart.items[0]!.id}/update`,
      token,
      { quantity: 3, cartVersion: 0 },
    );
    expect(result.error?.code).toBe("CART_CHANGED");
    expect(
      (await call<Cart>("shop", "/cart", token)).data.items[0]?.quantity,
    ).toBe(2);
  });
  it("quote does not reserve stock; expired quote creates no order", async () => {
    const token = await session("shop");
    await add(token, "cup-mini-white", 1);
    const q = await checkout(token);
    expect(
      (
        await call<{ skus: Array<{ reserved: number }> }>(
          "shop",
          "/products/cup-mini",
          token,
        )
      ).data.skus[0]?.reserved,
    ).toBe(0);
    now += 120000;
    expect(
      (await call("shop", "/orders", token, { quoteId: q.id })).error?.code,
    ).toBe("QUOTE_EXPIRED");
    expect((await call<unknown[]>("shop", "/orders", token)).data).toHaveLength(
      0,
    );
  });
  it("competing order requests create one hold and one order", async () => {
    const token = await session("shop");
    await add(token, "cup-mini-white", 1);
    const a = await checkout(token),
      b = await checkout(token);
    const results = await Promise.all([
      call<Order>("shop", "/orders", token, { quoteId: a.id }),
      call<Order>("shop", "/orders", token, { quoteId: b.id }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await call<Order[]>("shop", "/orders", token)).data).toHaveLength(
      1,
    );
    expect(
      (
        await call<{
          skus: Array<{ stock: number; reserved: number; available: number }>;
        }>("shop", "/products/cup-mini", token)
      ).data.skus[0],
    ).toMatchObject({ stock: 1, reserved: 1, available: 0 });
  });
  it("same order key replays exact result, different payload conflicts", async () => {
    const token = await session("shop");
    await add(token);
    const q = await checkout(token),
      key = randomUUID();
    const a = await call<Order>(
      "shop",
      "/orders",
      token,
      { quoteId: q.id },
      key,
    );
    const b = await call<Order>(
      "shop",
      "/orders",
      token,
      { quoteId: q.id },
      key,
    );
    expect(a.data).toEqual(b.data);
    expect(
      (await call("shop", "/orders", token, { quoteId: "different" }, key))
        .error?.code,
    ).toBe("IDEMPOTENCY_CONFLICT");
    expect((await call<Order[]>("shop", "/orders", token)).data).toHaveLength(
      1,
    );
    expect(
      (
        await call<{ result: Order }>(
          "shop",
          `/operations/${key}?operation=orders.create`,
          token,
        )
      ).data.result.id,
    ).toBe(a.data.id);
  });
  it("selected lines clear atomically and unselected lines remain", async () => {
    const token = await session("shop");
    await add(token);
    const cart = await add(token, "bag-natural", 1, 1);
    await call("shop", "/cart/selection", token, {
      ids: [cart.items[0]!.id],
      cartVersion: 2,
    });
    const q = await checkout(token);
    await call("shop", "/orders", token, { quoteId: q.id });
    const after = (await call<Cart>("shop", "/cart", token)).data;
    expect(after.items).toHaveLength(1);
    expect(after.items[0]?.skuId).toBe("bag-natural");
  });
  it("failed payment keeps pending hold; success deducts once; shipping and receipt constrained", async () => {
    const token = await session("shop"),
      o = await order(token);
    expect(
      (await call("shop", `/orders/${o.id}/demo-ship`, token, {})).error?.code,
    ).toBe("ORDER_STATE");
    const failed = await call<Order>(
      "shop",
      `/orders/${o.id}/demo-payment`,
      token,
      { outcome: "failure" },
    );
    expect(failed.data).toMatchObject({
      status: "PENDING_PAYMENT",
      paymentAttempts: 1,
    });
    const key = randomUUID();
    await call(
      "shop",
      `/orders/${o.id}/demo-payment`,
      token,
      { outcome: "success" },
      key,
    );
    await call(
      "shop",
      `/orders/${o.id}/demo-payment`,
      token,
      { outcome: "success" },
      key,
    );
    expect(
      (
        await call<{ skus: Array<{ stock: number; reserved: number }> }>(
          "shop",
          "/products/book",
          token,
        )
      ).data.skus[0],
    ).toMatchObject({ stock: 18, reserved: 0 });
    expect(
      (await call("shop", `/orders/${o.id}/confirm-receipt`, token, {})).error
        ?.code,
    ).toBe("ORDER_STATE");
    await call("shop", `/orders/${o.id}/demo-ship`, token, {});
    expect(
      (await call<Order>("shop", `/orders/${o.id}/confirm-receipt`, token, {}))
        .data.status,
    ).toBe("COMPLETED");
  });
  it("cancel twice releases stock and coupon exactly once", async () => {
    const token = await session("shop");
    await add(token);
    await call("shop", "/coupon-templates/C10/claim", token, {});
    const q = await checkout(token, "C10");
    const o = (await call<Order>("shop", "/orders", token, { quoteId: q.id }))
      .data;
    await call("shop", `/orders/${o.id}/cancel`, token, {});
    await call("shop", `/orders/${o.id}/cancel`, token, {});
    expect(
      (
        await call<{ skus: Array<{ stock: number; reserved: number }> }>(
          "shop",
          "/products/book",
          token,
        )
      ).data.skus[0],
    ).toMatchObject({ stock: 20, reserved: 0 });
    expect(
      (await call<Array<{ status: string }>>("shop", "/coupons", token)).data[0]
        ?.status,
    ).toBe("AVAILABLE");
  });
  it("order TTL closes at exact boundary and releases once", async () => {
    const token = await session("shop"),
      o = await order(token);
    now += 900000;
    expect(
      (
        await call("shop", `/orders/${o.id}/demo-payment`, token, {
          outcome: "success",
        })
      ).error?.code,
    ).toBe("ORDER_STATE");
    expect(
      (await call<Order>("shop", `/orders/${o.id}`, token)).data.status,
    ).toBe("CLOSED");
    expect(
      (
        await call<{ skus: Array<{ reserved: number }> }>(
          "shop",
          "/products/book",
          token,
        )
      ).data.skus[0]?.reserved,
    ).toBe(0);
  });
  it("idempotent result is immutable after order later changes status", async () => {
    const token = await session("shop");
    await add(token);
    const q = await checkout(token),
      key = randomUUID();
    const o = (
      await call<Order>("shop", "/orders", token, { quoteId: q.id }, key)
    ).data;
    await call("shop", `/orders/${o.id}/cancel`, token, {});
    const replay = (
      await call<Order>("shop", "/orders", token, { quoteId: q.id }, key)
    ).data;
    expect(replay.status).toBe("PENDING_PAYMENT");
    expect(
      (await call<Order>("shop", `/orders/${o.id}`, token)).data.status,
    ).toBe("CANCELLED");
  });
});
describe("H5 server capacity, rules and session boundaries", () => {
  it("returns three routes with three slots including unavailable states", async () => {
    const cookie = await session("h5");
    expect(
      (await call<unknown[]>("h5", "/campaigns/weekend/routes", cookie)).data,
    ).toHaveLength(3);
    for (const route of ["slow", "maker", "explore"])
      expect(
        (await call<unknown[]>("h5", `/routes/${route}/slots`, cookie)).data,
      ).toHaveLength(3);
  });
  it("creates, retrieves and cancels persisted booking with exact-once seat release", async () => {
    const cookie = await session("h5"),
      key = randomUUID();
    const a = await call<Booking>("h5", "/bookings", cookie, booking(), key),
      b = await call<Booking>("h5", "/bookings", cookie, booking(), key);
    expect(a.status).toBe(200);
    expect(a.data.id).toBe(b.data.id);
    await call("h5", `/bookings/${a.data.id}/cancel`, cookie, {});
    await call("h5", `/bookings/${a.data.id}/cancel`, cookie, {});
    expect(
      (
        await call<Array<{ reserved: number }>>(
          "h5",
          "/routes/slow/slots",
          cookie,
        )
      ).data[0]?.reserved,
    ).toBe(0);
    expect(
      (await call<Booking[]>("h5", "/bookings", cookie)).data,
    ).toHaveLength(1);
  });
  it("competing last-seat requests cannot oversell", async () => {
    const cookie = await session("h5");
    const results = await Promise.all([
      call("h5", "/bookings", cookie, booking("explore-2", 1)),
      call("h5", "/bookings", cookie, booking("explore-2", 1)),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      (
        await call<Array<{ available: number }>>(
          "h5",
          "/routes/explore/slots",
          cookie,
        )
      ).data[1]?.available,
    ).toBe(0);
  });
  it("one active booking per campaign enforced server-side", async () => {
    const cookie = await session("h5");
    await call("h5", "/bookings", cookie, booking());
    expect(
      (await call("h5", "/bookings", cookie, booking("maker-1", 1))).error
        ?.code,
    ).toBe("BOOKING_EXISTS");
  });
  it.each(["slow-3", "maker-3", "explore-3"])(
    "rejects closed/cancelled/ended slot %s",
    async (slotId) => {
      const cookie = await session("h5");
      expect(
        (await call("h5", "/bookings", cookie, booking(slotId, 1))).error?.code,
      ).toBe("SLOT_CLOSED");
    },
  );
  it("rejects full slot and insufficient last seat", async () => {
    const cookie = await session("h5");
    expect(
      (await call("h5", "/bookings", cookie, booking("maker-2", 1))).error
        ?.code,
    ).toBe("SOLD_OUT");
    expect(
      (await call("h5", "/bookings", cookie, booking("explore-2", 2))).error
        ?.code,
    ).toBe("SOLD_OUT");
  });
  it.each([0, 5, 1.2])("rejects participant count %s", async (count) => {
    const cookie = await session("h5");
    expect(
      (await call("h5", "/bookings", cookie, booking("slow-1", count))).status,
    ).toBe(400);
  });
  it("requires rules acceptance/version, rejects PII-shaped alias", async () => {
    const cookie = await session("h5");
    expect(
      (
        await call("h5", "/bookings", cookie, {
          ...booking(),
          rulesAccepted: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("h5", "/bookings", cookie, {
          ...booking(),
          rulesVersion: "old",
        })
      ).error?.code,
    ).toBe("RULES_CHANGED");
    expect(
      (
        await call("h5", "/bookings", cookie, {
          ...booking(),
          alias: "x@example.com",
        })
      ).status,
    ).toBe(400);
  });
  it("server time closes slot exactly at deadline", async () => {
    const cookie = await session("h5");
    const slots = (
      await call<Array<{ deadline: string }>>(
        "h5",
        "/routes/slow/slots",
        cookie,
      )
    ).data;
    now = Date.parse(slots[0]!.deadline);
    expect((await call("h5", "/bookings", cookie, booking())).error?.code).toBe(
      "SLOT_CLOSED",
    );
  });
  it("expiry preserves historical capacity and permits another active booking", async () => {
    const cookie = await session("h5");
    await call("h5", "/bookings", cookie, booking("slow-1", 2));
    const slots = (
      await call<Array<{ endsAt: string }>>("h5", "/routes/slow/slots", cookie)
    ).data;
    now = Date.parse(slots[0]!.endsAt);
    expect(
      (await call<Booking[]>("h5", "/bookings", cookie)).data[0]?.status,
    ).toBe("EXPIRED");
    expect(
      (
        await call<Array<{ reserved: number }>>(
          "h5",
          "/routes/slow/slots",
          cookie,
        )
      ).data[0]?.reserved,
    ).toBe(2);
    expect(
      (await call("h5", "/bookings", cookie, booking("slow-2", 1))).status,
    ).toBe(200);
  });
});
describe("authorization, persistence and isolated experiments", () => {
  it("operation lookup accepts the same colon/dot/128-character key contract as writes", async () => {
    const token = await session("shop");
    for (const key of ["audit:cart.v2", "x".repeat(128)]) {
      const cart = (await call<Cart>("shop", "/cart", token)).data;
      const added = await call<Cart>(
        "shop",
        "/cart/items",
        token,
        { skuId: "book-clay", quantity: 1, cartVersion: cart.version },
        key,
      );
      expect(added.status).toBe(200);
      const lookup = await call<{ result: Cart }>(
        "shop",
        `/operations/${encodeURIComponent(key)}?operation=cart.add`,
        token,
      );
      expect(lookup.status).toBe(200);
      expect(lookup.data.result).toEqual(added.data);
    }
  });
  it("rejects cross-domain token/cookie, cross-session IDs and expired sessions", async () => {
    const a = await session("shop"),
      b = await session("shop"),
      cookie = await session("h5");
    const o = await order(a);
    expect((await call("shop", `/orders/${o.id}`, b)).status).toBe(404);
    expect(
      (await call("shop", "/orders", cookie.replace("chenxi_h5=", ""))).status,
    ).toBe(401);
    expect((await call("h5", "/bookings", `chenxi_h5=${a}`)).status).toBe(401);
    now += 86400000;
    expect((await call("shop", "/cart", a)).error?.code).toBe(
      "SESSION_EXPIRED",
    );
  });
  it("rejects malicious Origin and H5 missing app header before mutations", async () => {
    const cookie = await session("h5");
    expect(
      (
        await call("h5", "/bookings", cookie, booking(), randomUUID(), {
          origin: "https://evil.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call("h5", "/bookings", cookie, booking(), randomUUID(), {
          "x-chenxi-app": "",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call<Booking[]>("h5", "/bookings", cookie)).data,
    ).toHaveLength(0);
  });
  it("uses HttpOnly SameSite cookie scoped to H5", async () => {
    const result = await call("h5", "/demo-sessions", "", {});
    expect(String(result.headers["set-cookie"])).toMatch(
      /Path=\/api\/v1\/h5; HttpOnly; SameSite=Lax/,
    );
  });
  it("H5 reconnect resumes existing session without losing bookings or replacing cookie", async () => {
    const cookie = await session("h5");
    const b = (await call<Booking>("h5", "/bookings", cookie, booking())).data;
    const reconnect = await call("h5", "/demo-sessions", cookie, {});
    expect(reconnect.status).toBe(200);
    expect(reconnect.headers["set-cookie"]).toBeUndefined();
    expect((await call<Booking[]>("h5", "/bookings", cookie)).data[0]?.id).toBe(
      b.id,
    );
  });
  it('resume-only refuses missing identity and never assigns a replacement cookie',async()=>{
    const cookie=await session('h5');const key=randomUUID();await call('h5','/bookings',cookie,booking(),key);
    const missing=await call('h5','/demo-sessions','',{resumeOnly:true});expect(missing.status).toBe(401);expect(missing.error?.code).toBe('SESSION_EXPIRED');expect(missing.headers['set-cookie']).toBeUndefined();
    const resumed=await call('h5','/demo-sessions',cookie,{resumeOnly:true});expect(resumed.status).toBe(200);expect(resumed.headers['set-cookie']).toBeUndefined();expect((await call<Booking[]>('h5','/bookings',cookie)).data).toHaveLength(1);
    now+=86400000;expect((await call('h5','/demo-sessions',cookie,{resumeOnly:true})).status).toBe(401);
  });
  it("reset affects only current visitor and reset key can replay", async () => {
    const a = await session("shop"),
      b = await session("shop");
    await order(a);
    await order(b);
    const key = randomUUID();
    await call("shop", "/demo/reset", a, {}, key);
    await call("shop", "/demo/reset", a, {}, key);
    expect((await call<Order[]>("shop", "/orders", a)).data).toHaveLength(0);
    expect((await call<Order[]>("shop", "/orders", b)).data).toHaveLength(1);
  });
  it("last-stock experiment runs two actual requests within one isolated inventory pool", async () => {
    const token = await session("shop");
    const race = (
      await call<{ id: string }>("shop", "/experiments/races", token, {})
    ).data;
    await Promise.all(
      ["A", "B"].map((actor) =>
        call("shop", `/experiments/races/${race.id}/claim`, token, { actor }),
      ),
    );
    const result = (
      await call<{ stock: number; attempts: Array<{ success: boolean }> }>(
        "shop",
        `/experiments/races/${race.id}`,
        token,
      )
    ).data;
    expect(result.stock).toBe(0);
    expect(result.attempts.filter((a) => a.success)).toHaveLength(1);
    expect(result.attempts).toHaveLength(2);
  });
  it("invalid JSON and missing API paths return JSON without stacks or HTML", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/shop/demo/session",
      headers: { "content-type": "application/json" },
      payload: "{bad",
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain("stack");
    const missing = await app.inject("/api/v1/no-such-path");
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/json");
  });
  it("retains order, booking and idempotency through SQLite close/open and actual HTTP restart", async () => {
    await app.close();
    const parent = resolve(".local/api-tests");
    mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(resolve(parent, "restart-"));
    const filename = resolve(directory, "state.sqlite");
    app = createService({ filename, now: () => now });
    const token = await session("shop"),
      cookie = await session("h5");
    await order(token);
    const key = randomUUID();
    const booked = (
      await call<Booking>("h5", "/bookings", cookie, booking(), key)
    ).data;
    await app.listen({ port: 0, host: "127.0.0.1" });
    await app.close();
    app = createService({ filename, now: () => now });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const response = await fetch(`${address}/api/v1/shop/orders`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as { data: Order[] };
    expect(body.data).toHaveLength(1);
    expect(
      (await call<Booking>("h5", "/bookings", cookie, booking(), key)).data.id,
    ).toBe(booked.id);
    expect(
      (await call<Booking[]>("h5", "/bookings", cookie)).data,
    ).toHaveLength(1);
  });
});
