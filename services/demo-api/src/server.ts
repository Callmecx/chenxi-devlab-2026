import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { RULE_VERSION } from "../../../packages/shared/src/api.ts";
import {
  addresses,
  campaignRoutes,
  categories,
  couponTemplates,
} from "./catalog.ts";
import {
  DomainError,
  fingerprint,
  newId,
  openDatabase,
  seedState,
} from "./database.ts";
import type { SessionState } from "./database.ts";
import {
  assertCart,
  cartView,
  changeOrder,
  createOrder,
  quote,
  refreshShop,
  skuOf,
} from "./shop.ts";
import { cancelBooking, createBooking, refreshH5 } from "./h5.ts";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const version = z.number().int().min(0).max(1_000_000);
const quantity = z.number().int().min(1).max(5);
const empty = z.object({}).strict();
const cartAdd = z
  .object({ skuId: id, quantity, cartVersion: version })
  .strict();
const cartUpdate = z.object({ quantity, cartVersion: version }).strict();
const cartVersion = z.object({ cartVersion: version }).strict();
const cartSelection = z
  .object({ ids: z.array(id).max(20), cartVersion: version })
  .strict();
const quoteInput = z
  .object({ cartVersion: version, addressId: id, couponId: id.optional() })
  .strict();
const orderInput = z.object({ quoteId: id }).strict();
const bookingInput = z
  .object({
    slotId: id,
    participantCount: z.number().int().min(1).max(4),
    alias: z
      .string()
      .trim()
      .max(16)
      .regex(/^[\p{L}\p{N}\s_-]*$/u)
      .optional(),
    rulesAccepted: z.boolean(),
    rulesVersion: z.string().max(40),
    source: z.enum(["recommendation", "browse"]),
  })
  .strict();
type Domain = SessionState["domain"];
interface Options {
  filename?: string;
  now?: () => number;
  allowedOrigins?: string[];
}
export function createService(options: Options = {}) {
  const clock = options.now || Date.now;
  const db = openDatabase(options.filename || ".local/data/demo.sqlite");
  const app = Fastify({
    routerOptions: { maxParamLength: 128 },
    logger: false,
    bodyLimit: 32768,
    requestTimeout: 10000,
  });
  const origins = new Set(
    options.allowedOrigins || [
      "http://127.0.0.1:4173",
      "http://127.0.0.1:4176",
      "http://127.0.0.1:5176",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
      "http://127.0.0.1:5175",
      "http://localhost:4176",
      "http://localhost:4173",
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
    ],
  );
  const counters = new Map<string, { count: number; until: number }>();
  function limit(key: string, maximum: number, window = 60000) {
    const now = clock();
    const current = counters.get(key);
    if (!current || current.until <= now) {
      if (counters.size > 1000)
        for (const [k, v] of counters) if (v.until <= now) counters.delete(k);
      counters.set(key, { count: 1, until: now + window });
      return;
    }
    if (++current.count > maximum)
      throw new DomainError("RATE_LIMITED", "操作过于频繁，请稍后重试。", 429);
  }
  function data<T>(request: FastifyRequest, value: T) {
    return {
      data: value,
      requestId: request.id,
      serverTime: new Date(clock()).toISOString(),
    };
  }
  function token(request: FastifyRequest, domain: Domain): string {
    if (domain === "shop")
      return (
        /^Bearer ([A-Za-z0-9_-]+)$/.exec(
          request.headers.authorization || "",
        )?.[1] || ""
      );
    return (
      /(?:^|;\s*)chenxi_h5=([A-Za-z0-9_-]+)/.exec(
        request.headers.cookie || "",
      )?.[1] || ""
    );
  }
  function mutateOrigin(request: FastifyRequest, domain: Domain) {
    const origin = request.headers.origin;
    if (origin && !origins.has(origin))
      throw new DomainError("FORBIDDEN", "当前来源不允许写入演示服务。", 403);
    if (!request.headers["content-type"]?.startsWith("application/json"))
      throw new DomainError("VALIDATION_ERROR", "请求必须使用 JSON。", 415);
    if (
      domain === "h5" &&
      (request.headers["x-chenxi-app"] !== "h5" ||
        !origin ||
        !origins.has(origin))
    )
      throw new DomainError("FORBIDDEN", "H5 写入需要同源应用验证。", 403);
  }
  function transact<T>(
    request: FastifyRequest,
    domain: Domain,
    action: (state: SessionState, now: number) => T,
  ) {
    const credential = token(request, domain);
    limit(`${domain}:${credential}`, 300);
    return db.transaction(credential, domain, clock(), (state) => {
      const now = clock();
      if (domain === "shop") refreshShop(state, now);
      else refreshH5(state, now);
      return action(state, now);
    });
  }
  function get(
    domain: Domain,
    path: string,
    handler: (
      state: SessionState,
      request: FastifyRequest,
      now: number,
    ) => unknown,
  ) {
    app.get(`/api/v1/${domain}${path}`, async (request) =>
      data(
        request,
        transact(request, domain, (state, now) => handler(state, request, now)),
      ),
    );
  }
  function post<T>(
    domain: Domain,
    path: string,
    operation: string,
    schema: z.ZodType<T>,
    handler: (
      state: SessionState,
      body: T,
      request: FastifyRequest,
      now: number,
    ) => unknown,
  ) {
    app.post(`/api/v1/${domain}${path}`, async (request) => {
      mutateOrigin(request, domain);
      const body = schema.parse(request.body);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || !/^[a-zA-Z0-9_.:-]{8,128}$/.test(key))
        throw new DomainError("VALIDATION_ERROR", "请求缺少有效幂等键。", 400);
      const signature = fingerprint(`${operation}:${request.url}`, body);
      const result = transact(request, domain, (state, now) => {
        const previous = state.operations.find(
          (o) => o.operation === operation && o.key === key,
        );
        if (previous) {
          if (previous.fingerprint !== signature)
            throw new DomainError(
              "IDEMPOTENCY_CONFLICT",
              "相同操作键不能用于不同请求。",
            );
          return structuredClone(previous.result);
        }
        if (state.operations.length >= 1500)
          throw new DomainError(
            "RATE_LIMITED",
            "本会话操作数已达上限，请重新连接。",
            429,
          );
        const result = handler(state, body, request, now);
        state.operations.push({
          operation,
          key,
          status: "SUCCEEDED",
          fingerprint: signature,
          result: structuredClone(result),
        });
        return result;
      });
      return data(request, result);
    });
  }
  const param = (request: FastifyRequest, name = "id") =>
    id.parse((request.params as Record<string, string>)[name]);
  app.get("/api/v1/health", async (request) =>
    data(request, {
      status: "ok",
      mode: "server-demo",
      persistence: "sqlite",
      ruleVersion: RULE_VERSION,
    }),
  );
  for (const domain of ["shop", "h5"] as const) {
    app.post(
      `/api/v1/${domain}${domain === "shop" ? "/demo/session" : "/demo-sessions"}`,
      async (request, reply) => {
        mutateOrigin(request, domain);
        const input=domain==='h5'?z.object({resumeOnly:z.boolean().optional()}).strict().parse(request.body):empty.parse(request.body);
        const existing = token(request, domain);
        if(domain==='h5'&&'resumeOnly' in input&&input.resumeOnly&&!existing)throw new DomainError('SESSION_EXPIRED','原预约请求的会话身份已丢失，不能在新身份下重放。',401);
        if (domain === "h5" && existing) {
          const resumed = db.resume(existing, domain, clock());
          return data(request, {
            mode: "server-demo",
            ...resumed,
            rulesVersion: RULE_VERSION,
          });
        }
        limit(`create:${request.ip}`, 40, 3600000);
        const created = db.create(domain, clock());
        if (domain === "h5") {
          reply.header(
            "Set-Cookie",
            `chenxi_h5=${created.token}; Path=/api/v1/h5; HttpOnly; SameSite=Lax; Max-Age=86400`,
          );
          return data(request, {
            mode: "server-demo",
            expiresAt: created.expiresAt,
            rulesVersion: RULE_VERSION,
          });
        }
        return data(request, {
          ...created,
          mode: "server-demo",
          ruleVersion: RULE_VERSION,
        });
      },
    );
    get(domain, "/operations/:key", (state, request) => {
      const key = z
          .string()
          .regex(/^[a-zA-Z0-9_.:-]{8,128}$/)
          .parse((request.params as Record<string, string>).key),
        operation = z
          .string()
          .min(1)
          .max(60)
          .parse((request.query as Record<string, string>).operation);
      const result = state.operations.find(
        (o) => o.key === key && o.operation === operation,
      );
      if (!result)
        throw new DomainError(
          "NOT_FOUND",
          "尚未查询到已完成操作；这不代表此前请求一定未执行。",
          404,
        );
      return {
        key: result.key,
        operation: result.operation,
        status: result.status,
        result: result.result,
      };
    });
    post(
      domain,
      "/demo/reset",
      "demo.reset",
      empty,
      (state, _body, _req, now) => {
        Object.assign(state, seedState(domain, now));
        return { reset: true };
      },
    );
  }
  get("shop", "/categories", () => categories);
  get("shop", "/products", (state, request) => {
    const q = z
      .object({
        q: z.string().max(80).optional(),
        category: z.string().max(80).optional(),
      })
      .parse(request.query);
    return state.products.filter(
      (p) =>
        (!q.category || q.category === "all" || p.category === q.category) &&
        (!q.q || `${p.name} ${p.description}`.includes(q.q)),
    );
  });
  get("shop", "/products/:id", (state, req) => {
    const p = state.products.find((p) => p.id === param(req));
    if (!p) throw new DomainError("NOT_FOUND", "商品不存在。", 404);
    return p;
  });
  get("shop", "/cart", (state) => cartView(state));
  post("shop", "/cart/items", "cart.add", cartAdd, (state, body) => {
    assertCart(state, body.cartVersion);
    const { sku, product } = skuOf(state, body.skuId);
    const previous = state.cart.items.find((i) => i.skuId === sku.id);
    const total = (previous?.quantity || 0) + body.quantity;
    if (total > 5 || total > sku.stock - sku.reserved)
      throw new DomainError(
        "OUT_OF_STOCK",
        "超过单规格限购 5 件或当前可用库存。",
      );
    if (previous) {
      previous.quantity = total;
      previous.version++;
    } else {
      if (state.cart.items.length >= 20)
        throw new DomainError(
          "VALIDATION_ERROR",
          "购物车最多包含 20 个规格。",
          400,
        );
      state.cart.items.push({
        id: newId("line"),
        productId: product.id,
        skuId: sku.id,
        name: product.name,
        skuLabel: sku.label,
        price: sku.price,
        quantity: body.quantity,
        selected: true,
        version: 1,
        available: sku.stock - sku.reserved,
      });
    }
    state.cart.version++;
    return cartView(state);
  });
  post(
    "shop",
    "/cart/items/:id/update",
    "cart.update",
    cartUpdate,
    (state, body, req) => {
      assertCart(state, body.cartVersion);
      const line = state.cart.items.find((i) => i.id === param(req));
      if (!line) throw new DomainError("NOT_FOUND", "购物车条目不存在。", 404);
      const { sku } = skuOf(state, line.skuId);
      if (body.quantity > sku.stock - sku.reserved)
        throw new DomainError("OUT_OF_STOCK", "数量超过当前可用库存。");
      line.quantity = body.quantity;
      line.version++;
      state.cart.version++;
      return cartView(state);
    },
  );
  post(
    "shop",
    "/cart/items/:id/remove",
    "cart.remove",
    cartVersion,
    (state, body, req) => {
      assertCart(state, body.cartVersion);
      const index = state.cart.items.findIndex((i) => i.id === param(req));
      if (index < 0)
        throw new DomainError("NOT_FOUND", "购物车条目不存在。", 404);
      state.cart.items.splice(index, 1);
      state.cart.version++;
      return cartView(state);
    },
  );
  post(
    "shop",
    "/cart/selection",
    "cart.selection",
    cartSelection,
    (state, body) => {
      assertCart(state, body.cartVersion);
      if (body.ids.some((id) => !state.cart.items.some((i) => i.id === id)))
        throw new DomainError("NOT_FOUND", "选择中包含不存在的商品。", 404);
      for (const line of state.cart.items)
        line.selected = body.ids.includes(line.id);
      state.cart.version++;
      return cartView(state);
    },
  );
  get("shop", "/coupon-templates", () => couponTemplates);
  get("shop", "/coupons", (state) => state.coupons);
  get("shop", "/demo-addresses", () => addresses);
  post(
    "shop",
    "/coupon-templates/:id/claim",
    "coupons.claim",
    empty,
    (state, _body, req) => {
      const found = state.coupons.find((c) => c.id === param(req));
      if (found) return found;
      const template = couponTemplates.find((c) => c.id === param(req));
      if (!template) throw new DomainError("NOT_FOUND", "优惠券不存在。", 404);
      const coupon = { ...template, status: "AVAILABLE" as const };
      state.coupons.push(coupon);
      return coupon;
    },
  );
  post(
    "shop",
    "/checkout/quotes",
    "checkout.quotes",
    quoteInput,
    (state, body, _req, now) => quote(state, body, now),
  );
  post(
    "shop",
    "/orders",
    "orders.create",
    orderInput,
    (state, body, _req, now) => createOrder(state, body.quoteId, now),
  );
  get("shop", "/orders", (state) => state.orders);
  get("shop", "/orders/:id", (state, req) => {
    const order = state.orders.find((o) => o.id === param(req));
    if (!order)
      throw new DomainError("NOT_FOUND", "当前会话没有这个订单。", 404);
    return order;
  });
  for (const action of ["cancel", "demo-ship", "confirm-receipt"])
    post(
      "shop",
      `/orders/:id/${action}`,
      `orders.${action}`,
      empty,
      (state, _body, req, now) =>
        changeOrder(state, param(req), action, undefined, now),
    );
  post(
    "shop",
    "/orders/:id/demo-payment",
    "orders.demo-payment",
    z.object({ outcome: z.enum(["success", "failure"]) }).strict(),
    (state, body, req, now) =>
      changeOrder(state, param(req), "demo-payment", body.outcome, now),
  );
  get("h5", "/campaigns/:id", (_state, req) => {
    if (param(req) !== "weekend")
      throw new DomainError("NOT_FOUND", "活动不存在。", 404);
    return {
      id: "weekend",
      title: "蓉城周末 Lab",
      description: "三条原创模拟路线，用确定性偏好规则找到适合的周末安排。",
      simulated: true,
      rulesVersion: RULE_VERSION,
    };
  });
  get("h5", "/campaigns/:id/routes", (_state, req) => {
    if (param(req) !== "weekend")
      throw new DomainError("NOT_FOUND", "活动不存在。", 404);
    return campaignRoutes;
  });
  get("h5", "/routes/:id", (_state, req) => {
    const route = campaignRoutes.find((r) => r.id === param(req));
    if (!route) throw new DomainError("NOT_FOUND", "路线不存在。", 404);
    return route;
  });
  get("h5", "/routes/:id/slots", (state, req) => {
    if (!campaignRoutes.some((r) => r.id === param(req)))
      throw new DomainError("NOT_FOUND", "路线不存在。", 404);
    return state.slots.filter((s) => s.routeId === param(req));
  });
  post(
    "h5",
    "/bookings",
    "bookings.create",
    bookingInput,
    (state, body, _req, now) => createBooking(state, body, now),
  );
  get("h5", "/bookings", (state) => state.bookings);
  get("h5", "/bookings/:id", (state, req) => {
    const booking = state.bookings.find((b) => b.id === param(req));
    if (!booking)
      throw new DomainError("NOT_FOUND", "当前会话没有这个预约。", 404);
    return booking;
  });
  post(
    "h5",
    "/bookings/:id/cancel",
    "bookings.cancel",
    empty,
    (state, _body, req) => cancelBooking(state, param(req)),
  );
  post("shop", "/experiments/races", "experiments.races", empty, (state) => {
    if (state.races.length >= 20) state.races.shift();
    const race = { id: newId("race"), stock: 1, winner: null, attempts: [] };
    state.races.push(race);
    return race;
  });
  post(
    "shop",
    "/experiments/races/:id/claim",
    "experiments.claim",
    z.object({ actor: z.enum(["A", "B"]) }).strict(),
    (state, body, req, now) => {
      const race = state.races.find((r) => r.id === param(req));
      if (!race) throw new DomainError("NOT_FOUND", "竞态实验不存在。", 404);
      const success = race.stock === 1;
      if (success) {
        race.stock = 0;
        race.winner = body.actor;
      }
      if (race.attempts.length < 20)
        race.attempts.push({
          actor: body.actor,
          success,
          at: new Date(now).toISOString(),
        });
      return structuredClone(race);
    },
  );
  get("shop", "/experiments/races/:id", (state, req) => {
    const race = state.races.find((r) => r.id === param(req));
    if (!race) throw new DomainError("NOT_FOUND", "竞态实验不存在。", 404);
    return race;
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "API 路径不存在。" },
      requestId: request.id,
      serverTime: new Date(clock()).toISOString(),
    }),
  );
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError)
      return reply.code(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        requestId: request.id,
        serverTime: new Date(clock()).toISOString(),
      });
    if (
      error instanceof z.ZodError ||
      (error instanceof Error &&
        (("code" in error && error.code === "FST_ERR_CTP_INVALID_JSON_BODY") ||
          ("statusCode" in error && error.statusCode === 400)))
    )
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "输入格式或范围不符合规则。",
        },
        requestId: request.id,
        serverTime: new Date(clock()).toISOString(),
      });
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "服务暂时无法完成请求，请查询操作结果后重试。",
      },
      requestId: request.id,
      serverTime: new Date(clock()).toISOString(),
    });
  });
  app.addHook("onClose", async () => db.close());
  return app;
}
