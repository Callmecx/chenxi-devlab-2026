import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import type {
  Cart,
  Category,
  Coupon,
  CouponTemplate,
  DemoAddress,
  Order,
  Product,
  Quote,
} from "../../../../packages/shared/src/api";
import { SelectClient, uniStorage } from "./client";

export const useSelect = defineStore("select-v2", () => {
  const mode = ref<"local" | "server">("local"),
    connected = ref(false),
    loading = ref(false),
    busy = ref(false),
    pending = ref(false);
  const error = ref(""),
    notice = ref(""),
    serverTime = ref("");
  const products = ref<Product[]>([]),
    categories = ref<Category[]>([]),
    cart = ref<Cart>({ version: 0, items: [] }),
    coupons = ref<Coupon[]>([]),
    templates = ref<CouponTemplate[]>([]),
    addresses = ref<DemoAddress[]>([]),
    orders = ref<Order[]>([]);
  const addressId = ref(""),
    couponId = ref(""),
    quote = ref<Quote | null>(null),
    query = ref(""),
    category = ref("");
  const detail = ref<Product | null>(null),
    detailLoading = ref(false);
  const identityLost = ref(false);
  let detailGeneration = 0;
  let refreshGeneration = 0;
  let client: SelectClient | undefined,
    generation = 0,
    searchGeneration = 0;
  try {
    if (uniStorage.get("chenxi-select-mode-v2") === "server")
      mode.value = "server";
  } catch {
    /* Explicit local mode. */
  }
  const api = () => (client ??= new SelectClient());
  function sync() {
    pending.value = !!client?.pending;
    identityLost.value = !!client?.identityLost;
    serverTime.value = client?.serverTime || "";
  }
  function fail(reason: unknown) {
    error.value =
      reason instanceof Error ? reason.message : "请求失败，请重试。";
    sync();
  }
  watch([addressId, couponId], () => {
    quote.value = null;
  });
  async function setMode(value: "local" | "server") {
    if (loading.value) {
      notice.value = "正在连接服务，请等待连接结果后再切换模式。";
      return;
    }
    if (pending.value || busy.value) {
      error.value = "请先确认在途请求结果。";
      return;
    }
    mode.value = value;
    generation++;
    connected.value = false;
    error.value = "";
    try {
      uniStorage.set("chenxi-select-mode-v2", value);
    } catch {
      notice.value = "模式选择无法保存。";
    }
    if (value === "server") await connect();
  }
  async function connect() {
    if (loading.value || busy.value) return;
    loading.value = true;
    error.value = "";
    const current = ++generation;
    try {
      await api().connect();
      const [list, groups, bag, wallet, offers, locations, history] =
        await Promise.all([
          api().request<Product[]>("/products"),
          api().request<Category[]>("/categories"),
          api().request<Cart>("/cart"),
          api().request<Coupon[]>("/coupons"),
          api().request<CouponTemplate[]>("/coupon-templates"),
          api().request<DemoAddress[]>("/demo-addresses"),
          api().request<Order[]>("/orders"),
        ]);
      if (current !== generation) return;
      products.value = list;
      categories.value = groups;
      cart.value = bag;
      coupons.value = wallet;
      templates.value = offers;
      addresses.value = locations;
      orders.value = history;
      addressId.value = locations[0]?.id || "";
      connected.value = true;
    } catch (reason) {
      if (current === generation) {
        connected.value = false;
        fail(reason);
      }
    } finally {
      if (current === generation) {
        loading.value = false;
        sync();
      }
    }
  }
  async function search() {
    const current = ++searchGeneration,
      scope = generation;
    try {
      const list = await api().request<Product[]>(
        `/products?q=${encodeURIComponent(query.value)}&category=${encodeURIComponent(category.value)}`,
      );
      if (current === searchGeneration && scope === generation)
        products.value = list;
    } catch (reason) {
      if (current === searchGeneration && scope === generation) fail(reason);
    } finally {
      sync();
    }
  }
  async function loadProduct(id: string) {
    const current = ++detailGeneration,
      scope = generation;
    detail.value = null;
    detailLoading.value = true;
    try {
      const result = await api().request<Product>(
        `/products/${encodeURIComponent(id)}`,
      );
      if (current === detailGeneration && scope === generation)
        detail.value = result;
    } catch (reason) {
      if (current === detailGeneration && scope === generation) fail(reason);
    } finally {
      if (current === detailGeneration && scope === generation)
        detailLoading.value = false;
    }
  }
  async function refresh() {
    const scope = generation;
    const current = ++refreshGeneration;
    try {
      const [bag, wallet, history] = await Promise.all([
        api().request<Cart>("/cart"),
        api().request<Coupon[]>("/coupons"),
        api().request<Order[]>("/orders"),
      ]);
      if (scope === generation && current === refreshGeneration) {
        if (bag.version !== cart.value.version) quote.value = null;
        cart.value = bag;
        coupons.value = wallet;
        orders.value = history;
      }
    } catch (reason) {
      if (scope === generation && current === refreshGeneration) fail(reason);
    } finally {
      sync();
    }
  }
  async function mutate<T>(
    operation: string,
    path: string,
    body: unknown,
  ): Promise<T | undefined> {
    if (busy.value) return;
    refreshGeneration++;
    busy.value = true;
    error.value = "";
    notice.value = "";
    try {
      return await api().write<T>(operation, path, body);
    } catch (reason) {
      fail(reason);
    } finally {
      busy.value = false;
      sync();
    }
  }
  async function add(skuId: string, quantity: number) {
    const result = await mutate<Cart>("cart.add", "/cart/items", {
      skuId,
      quantity,
      cartVersion: cart.value.version,
    });
    if (result) {
      cart.value = result;
      quote.value = null;
      notice.value = "已加入服务端购物袋。";
    } else if (!pending.value) await refresh();
  }
  async function update(id: string, quantity: number) {
    const result = await mutate<Cart>(
      "cart.update",
      `/cart/items/${encodeURIComponent(id)}/update`,
      { quantity, cartVersion: cart.value.version },
    );
    if (result) {
      cart.value = result;
      quote.value = null;
    } else if (!pending.value) await refresh();
  }
  async function remove(id: string) {
    const result = await mutate<Cart>(
      "cart.remove",
      `/cart/items/${encodeURIComponent(id)}/remove`,
      { cartVersion: cart.value.version },
    );
    if (result) {
      cart.value = result;
      quote.value = null;
    } else if (!pending.value) await refresh();
  }
  async function select(ids: string[]) {
    const result = await mutate<Cart>("cart.selection", "/cart/selection", {
      ids,
      cartVersion: cart.value.version,
    });
    if (result) {
      cart.value = result;
      quote.value = null;
    } else if (!pending.value) await refresh();
  }
  async function claim(id: string) {
    const result = await mutate<Coupon>(
      "coupons.claim",
      `/coupon-templates/${encodeURIComponent(id)}/claim`,
      {},
    );
    if (result) {
      await refresh();
      notice.value = "优惠券已放入当前会话券包。";
    }
  }
  async function createQuote() {
    const result = await mutate<Quote>("checkout.quotes", "/checkout/quotes", {
      cartVersion: cart.value.version,
      addressId: addressId.value,
      ...(couponId.value ? { couponId: couponId.value } : {}),
    });
    if (result) quote.value = result;
    else if (!pending.value) await refresh();
  }
  async function submit(): Promise<Order | undefined> {
    if (!quote.value) {
      error.value = "请先获取服务端报价。";
      return;
    }
    const result = await mutate<Order>("orders.create", "/orders", {
      quoteId: quote.value.id,
    });
    if (result) {
      quote.value = null;
      await refresh();
      notice.value =
        "模拟订单已创建，库存暂时预留。请在 15 分钟内模拟付款或取消。";
    }
    return result;
  }
  async function action(
    id: string,
    action: "cancel" | "demo-payment" | "demo-ship" | "confirm-receipt",
    outcome?: "success" | "failure",
  ) {
    const result = await mutate<Order>(
      `orders.${action}`,
      `/orders/${encodeURIComponent(id)}/${action}`,
      action === "demo-payment" ? { outcome } : {},
    );
    if (result) {
      await refresh();
      notice.value =
        action === "demo-payment" && outcome === "failure"
          ? "模拟付款失败已记录，订单仍待付款，库存预留继续有效。"
          : "订单状态已由服务端确认。";
    } else if (!pending.value) await refresh();
  }
  async function recover(lookup: boolean) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      if (lookup) await api().lookup();
      else await api().retry();
      quote.value = null;
      await refresh();
      notice.value = "原操作已确认，请查看最新购物袋或订单。";
    } catch (reason) {
      fail(reason);
      if (lookup && client?.pending)
        error.value += " 查询未成功不等于请求未执行，请用原请求重试。";
    } finally {
      busy.value = false;
      sync();
    }
  }
  async function reset() {
    const result = await mutate<{ reset: true }>(
      "demo.reset",
      "/demo/reset",
      {},
    );
    if (result) {
      quote.value = null;
      couponId.value = "";
      await refresh();
      await search();
      notice.value = "已重置当前服务端演示会话，不影响旧版本地记录或其他访客。";
    }
  }
  const count = computed(() =>
    cart.value.items.reduce((sum, line) => sum + line.quantity, 0),
  );
  function abandonIdentityRecovery() {
    try {
      api().abandonIdentityRecovery();
      connected.value = false;
      quote.value = null;
      error.value = "";
      notice.value =
        "已停止原会话恢复，未知结果的原请求已归档。不会撤销服务端订单；请手动选择下一次体验。";
    } catch (reason) {
      fail(reason);
    } finally {
      sync();
    }
  }
  const selectedCount = computed(() =>
    cart.value.items
      .filter((line) => line.selected)
      .reduce((sum, line) => sum + line.quantity, 0),
  );
  return {
    mode,
    connected,
    loading,
    busy,
    pending,
    identityLost,
    abandonIdentityRecovery,
    error,
    notice,
    serverTime,
    products,
    categories,
    cart,
    coupons,
    templates,
    addresses,
    orders,
    addressId,
    couponId,
    quote,
    query,
    category,
    count,
    selectedCount,
    detail,
    detailLoading,
    loadProduct,
    setMode,
    connect,
    search,
    refresh,
    add,
    update,
    remove,
    select,
    claim,
    createQuote,
    submit,
    action,
    recover,
    reset,
  };
});
