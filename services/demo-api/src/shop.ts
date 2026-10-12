import type { Cart, Order, Quote } from "../../../packages/shared/src/api.ts";
import { RULE_VERSION } from "../../../packages/shared/src/api.ts";
import { addresses } from "./catalog.ts";
import { DomainError, newId } from "./database.ts";
import type { SessionState } from "./database.ts";
export function skuOf(state: SessionState, id: string) {
  for (const product of state.products) {
    const sku = product.skus.find((s) => s.id === id);
    if (sku) return { product, sku };
  }
  throw new DomainError("NOT_FOUND", "商品规格不存在。", 404);
}
export function refreshShop(state: SessionState, now: number) {
  for (const order of state.orders)
    if (
      order.status === "PENDING_PAYMENT" &&
      Date.parse(order.expiresAt) <= now
    ) {
      release(state, order);
      transition(order, "CLOSED", now);
    }
  for (const product of state.products)
    for (const sku of product.skus) sku.available = sku.stock - sku.reserved;
  state.quotes = state.quotes.filter((q) => Date.parse(q.expiresAt) > now);
}
export function cartView(state: SessionState): Cart {
  return {
    version: state.cart.version,
    items: state.cart.items.map((line) => {
      const { sku, product } = skuOf(state, line.skuId);
      return {
        ...line,
        price: sku.price,
        name: product.name,
        skuLabel: sku.label,
        available: sku.stock - sku.reserved,
      };
    }),
  };
}
export function assertCart(state: SessionState, version: number) {
  if (state.cart.version !== version)
    throw new DomainError("CART_CHANGED", "购物车已变化，请刷新后确认。", 409, {
      version: state.cart.version,
    });
}
export function quote(
  state: SessionState,
  input: { cartVersion: number; addressId: string; couponId?: string },
  now: number,
): Quote {
  assertCart(state, input.cartVersion);
  if (!addresses.some((a) => a.id === input.addressId))
    throw new DomainError("VALIDATION_ERROR", "请选择演示地址。", 400);
  const lines = cartView(state).items.filter((i) => i.selected);
  if (!lines.length)
    throw new DomainError("VALIDATION_ERROR", "请至少选择一件商品。", 400);
  if (lines.some((line) => line.quantity > line.available))
    throw new DomainError("OUT_OF_STOCK", "部分商品库存不足，请调整数量。");
  const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);
  let discount = 0;
  if (input.couponId) {
    const coupon = state.coupons.find((c) => c.id === input.couponId);
    if (!coupon || coupon.status !== "AVAILABLE" || subtotal < coupon.minimum)
      throw new DomainError("COUPON_UNAVAILABLE", "优惠券不可用或未达到门槛。");
    discount = coupon.discount;
  }
  const shipping = subtotal >= 12900 ? 0 : 600;
  const result: Quote = {
    id: newId("quote"),
    cartVersion: input.cartVersion,
    lines,
    subtotal,
    shipping,
    discount,
    total: subtotal + shipping - discount,
    couponId: input.couponId || null,
    addressId: input.addressId,
    expiresAt: new Date(now + 120000).toISOString(),
    ruleVersion: RULE_VERSION,
  };
  if (state.quotes.length >= 30) state.quotes.shift();
  state.quotes.push(result);
  return result;
}
export function createOrder(
  state: SessionState,
  quoteId: string,
  now: number,
): Order {
  const q = state.quotes.find((x) => x.id === quoteId);
  if (!q || Date.parse(q.expiresAt) <= now)
    throw new DomainError("QUOTE_EXPIRED", "报价已过期，请重新获取并确认。");
  assertCart(state, q.cartVersion);
  for (const line of q.lines) {
    const { sku } = skuOf(state, line.skuId);
    if (line.price !== sku.price)
      throw new DomainError("PRICE_CHANGED", "商品价格已变化，请重新报价。");
    if (sku.stock - sku.reserved < line.quantity)
      throw new DomainError("OUT_OF_STOCK", "库存不足，订单未创建。");
  }
  const coupon = q.couponId
    ? state.coupons.find((c) => c.id === q.couponId)
    : undefined;
  if (q.couponId && (!coupon || coupon.status !== "AVAILABLE"))
    throw new DomainError("COUPON_UNAVAILABLE", "优惠券已被使用或占用。");
  if (state.orders.length >= 100)
    throw new DomainError(
      "RATE_LIMITED",
      "当前演示订单已达上限，请重置本会话。",
      429,
    );
  const order: Order = {
    ...structuredClone(q),
    id: newId("order"),
    status: "PENDING_PAYMENT",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 900000).toISOString(),
    paymentAttempts: 0,
    timeline: [{ status: "PENDING_PAYMENT", at: new Date(now).toISOString() }],
  };
  for (const line of q.lines)
    skuOf(state, line.skuId).sku.reserved += line.quantity;
  if (coupon) {
    coupon.status = "HELD";
    coupon.orderId = order.id;
  }
  const selected = new Set(q.lines.map((i) => i.id));
  state.cart.items = state.cart.items.filter((i) => !selected.has(i.id));
  state.cart.version++;
  state.orders.unshift(order);
  return order;
}
function release(state: SessionState, order: Order) {
  for (const line of order.lines)
    skuOf(state, line.skuId).sku.reserved -= line.quantity;
  const coupon = state.coupons.find((c) => c.orderId === order.id);
  if (coupon) {
    coupon.status = "AVAILABLE";
    delete coupon.orderId;
  }
}
function transition(order: Order, status: Order["status"], now: number) {
  order.status = status;
  order.timeline.push({ status, at: new Date(now).toISOString() });
}
export function changeOrder(
  state: SessionState,
  id: string,
  action: string,
  outcome: string | undefined,
  now: number,
): Order {
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new DomainError("NOT_FOUND", "当前会话没有这个订单。", 404);
  if (action === "cancel") {
    if (order.status === "CANCELLED") return order;
    if (order.status !== "PENDING_PAYMENT")
      throw new DomainError("ORDER_STATE", "只有待付款订单可以取消。");
    release(state, order);
    transition(order, "CANCELLED", now);
  } else if (action === "demo-payment") {
    if (order.status === "PAID" && outcome === "success") return order;
    if (order.status !== "PENDING_PAYMENT")
      throw new DomainError("ORDER_STATE", "当前订单不能付款。");
    order.paymentAttempts++;
    if (outcome === "failure") {
      order.timeline.push({
        status: "PAYMENT_FAILED",
        at: new Date(now).toISOString(),
      });
      return order;
    }
    for (const line of order.lines) {
      const { sku } = skuOf(state, line.skuId);
      sku.stock -= line.quantity;
      sku.reserved -= line.quantity;
    }
    const coupon = state.coupons.find((c) => c.orderId === id);
    if (coupon) coupon.status = "USED";
    transition(order, "PAID", now);
  } else if (action === "demo-ship") {
    if (order.status === "SHIPPED") return order;
    if (order.status !== "PAID")
      throw new DomainError("ORDER_STATE", "只有已付款订单可以模拟发货。");
    transition(order, "SHIPPED", now);
  } else {
    if (order.status === "COMPLETED") return order;
    if (order.status !== "SHIPPED")
      throw new DomainError("ORDER_STATE", "只有已发货订单可以确认收货。");
    transition(order, "COMPLETED", now);
  }
  return order;
}
