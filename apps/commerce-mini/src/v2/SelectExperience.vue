<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import { useSelect } from "./store";
import { useShop } from "../stores/shop";
import AppButton from "../components/AppButton.vue";
import ProductArt from "../components/ProductArt.vue";
import type { OrderStatus } from "../../../../packages/shared/src/api";

type Screen = "catalog" | "product" | "cart" | "checkout" | "orders" | "order";
const props = withDefaults(
  defineProps<{ screen?: Screen; productId?: string; orderId?: string }>(),
  { screen: "catalog", productId: "cup", orderId: "" },
);
const shop = useSelect(),
  legacy = useShop();
const skuId = ref(""),
  quantity = ref(1),
  sort = ref("featured"),
  stockOnly = ref(false),
  now = ref(Date.now()),
  orderFilter = ref("ALL"),
  showLegacy = ref(false);
let clockTimer: ReturnType<typeof setInterval> | undefined,
  searchTimer: ReturnType<typeof setTimeout> | undefined;
const disabled = computed(() => shop.busy || shop.pending);
const money = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 ? (value / 100).toFixed(2) : "—";
const time = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
const sku = computed(
  () =>
    shop.detail?.skus.find((item) => item.id === skuId.value) ||
    shop.detail?.skus[0],
);
const allSelected = computed(
  () =>
    shop.cart.items.length > 0 &&
    shop.cart.items.every((item) => item.selected),
);
const products = computed(() => {
  const list = shop.products.filter(
    (item) =>
      !stockOnly.value || item.skus.some((option) => option.available > 0),
  );
  const price = (item: (typeof list)[number]) =>
    Math.min(...item.skus.map((option) => option.price));
  if (sort.value === "low")
    return [...list].sort((a, b) => price(a) - price(b));
  if (sort.value === "high")
    return [...list].sort((a, b) => price(b) - price(a));
  return list;
});
const selectedSubtotal = computed(() =>
  shop.cart.items
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + item.price * item.quantity, 0),
);
const orderLabels: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "待模拟付款",
  PAID: "已模拟付款 · 待发货",
  SHIPPED: "模拟运输中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  CLOSED: "超时关闭",
};
const visibleOrders = computed(() =>
  props.screen === "order"
    ? shop.orders.filter((item) => item.id === props.orderId)
    : shop.orders.filter(
        (item) =>
          orderFilter.value === "ALL" || item.status === orderFilter.value,
      ),
);
let serverOffset = 0;
watch(
  () => shop.serverTime,
  (value) => {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      now.value = Date.now();
      serverOffset = parsed - now.value;
    }
  },
);
const remainingSeconds = (until: string) =>
  Math.max(0, Math.ceil((Date.parse(until) - now.value - serverOffset) / 1000));
const quoteExpired = computed(
  () => !!shop.quote && remainingSeconds(shop.quote.expiresAt) === 0,
);
function go(screen: Screen, id?: string) {
  const page = screen === "catalog" ? "index" : screen;
  uni.navigateTo({
    url: `/pages/${page}/${page}${id ? `?id=${encodeURIComponent(id)}` : ""}`,
    fail: () => {
      shop.error = "页面暂时无法打开，请返回首页重试。";
    },
  });
}
function home() {
  uni.reLaunch({ url: "/pages/index/index" });
}
function toggleLine(id: string) {
  const ids = shop.cart.items
    .filter((item) => item.selected)
    .map((item) => item.id);
  void shop.select(
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
  );
}
function selectSku(id: string) {
  if (disabled.value) return;
  skuId.value = id;
  quantity.value = 1;
}
async function add() {
  if (!sku.value) return;
  if (
    !Number.isInteger(quantity.value) ||
    quantity.value < 1 ||
    quantity.value > 5
  ) {
    shop.error = "每种规格单次请选择 1–5 件整数数量。";
    return;
  }
  await shop.add(sku.value.id, quantity.value);
  if (!shop.error) await shop.loadProduct(props.productId);
}
async function createOrder() {
  const order = await shop.submit();
  if (order) go("order", order.id);
}
function cancel(id: string) {
  uni.showModal({
    title: "取消这笔模拟订单？",
    content: "仅待付款订单可取消。服务端确认后释放预留库存与优惠券。",
    confirmText: "确认取消",
    cancelText: "保留订单",
    success: (result) => {
      if (result.confirm) void shop.action(id, "cancel");
    },
  });
}
function abandonRecovery() {
  uni.showModal({
    title: "停止原会话恢复？",
    content:
      "原请求可能已经成功。这里只归档本机请求，不会撤销服务器订单，不会自动创建新会话。",
    confirmText: "停止恢复",
    cancelText: "继续保留",
    success: (result) => {
      if (result.confirm) shop.abandonIdentityRecovery();
    },
  });
}
function reset() {
  if (disabled.value) return;
  uni.showModal({
    title: "重置当前演示？",
    content:
      "清理当前服务端会话的购物袋和订单。旧版本地历史和其他访客不会改变。",
    confirmText: "确认重置",
    cancelText: "保留记录",
    success: (result) => {
      if (result.confirm) void shop.reset();
    },
  });
}
async function pageRefresh() {
  if (!shop.connected) return;
  await shop.refresh();
  if (props.screen === "product") await shop.loadProduct(props.productId);
  if (props.screen === "catalog") await shop.search();
}
watch(
  () => [shop.connected, props.productId, props.screen],
  () => {
    if (shop.connected && props.screen === "product") {
      skuId.value = "";
      quantity.value = 1;
      void shop.loadProduct(props.productId);
    }
  },
);
watch(
  () => [shop.query, shop.category],
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (shop.connected) void shop.search();
    }, 250);
  },
);
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
}
onShow(() => {
  startClock();
  void pageRefresh();
});
onHide(() => {
  clearInterval(clockTimer);
});
onMounted(() => {
  startClock();
  if (!shop.connected) void shop.connect();
  else void pageRefresh();
});
onUnmounted(() => {
  clearInterval(clockTimer);
  clearTimeout(searchTimer);
});
</script>

<template>
  <view class="select-v2">
    <view class="xs-header"
      ><AppButton class="xs-logo" @click="home"
        >巷集<text class="xs-logo-latin">SELECT.</text></AppButton
      ><view class="xs-desktop-nav"
        ><AppButton @click="home">发现好物</AppButton
        ><AppButton @click="go('cart')">购物袋 {{ shop.count }}</AppButton
        ><AppButton @click="go('orders')">我的订单</AppButton></view
      ><text class="xs-demo-mark">DEMO / 无真实交易</text></view
    >
    <view class="xs-container">
      <view class="xs-connection"
        ><text>{{
          shop.connected
            ? "● 服务端演示已连接"
            : shop.loading
              ? "○ 正在连接…"
              : "○ 服务尚未连接"
        }}</text
        ><text>每位访客独立库存 · 全部商品与地址均为虚构</text></view
      >
      <view v-if="shop.error" class="xs-alert" role="alert"
        ><text>{{ shop.error }}</text
        ><AppButton
          v-if="!shop.pending"
          :disabled="shop.loading || shop.busy"
          @click="shop.connected ? pageRefresh() : shop.connect()"
          >重试</AppButton
        ></view
      >
      <view v-if="shop.notice" class="xs-notice" role="status">{{
        shop.notice
      }}</view>
      <view v-if="shop.pending" class="xs-pending"
        ><text class="xs-subtitle">先确认上一条操作</text
        ><text v-if="shop.identityLost"
          >原会话身份失效，不能在新会话重放原订单。可保留记录，或明确停止恢复。</text
        ><AppButton
          v-if="shop.identityLost"
          class="xs-secondary"
          :disabled="shop.busy"
          @click="abandonRecovery"
          >停止原会话恢复</AppButton
        ><text>结果可能已成功。原请求已保存，暂时不能编辑或提交新操作。</text
        ><view class="xs-actions"
          ><AppButton
            :disabled="shop.busy"
            class="xs-secondary"
            @click="shop.recover(true)"
            >查询原请求</AppButton
          ><AppButton
            :disabled="shop.busy"
            class="xs-primary"
            @click="shop.recover(false)"
            >使用原请求重试</AppButton
          ></view
        ></view
      >
      <view v-if="!shop.connected" class="xs-empty"
        ><text class="xs-kicker">LOCAL SERVICE / EXPLICIT CONNECTION</text
        ><text class="xs-title" role="heading" aria-level="1">{{
          shop.loading ? "好物正在准备中。" : "连接服务，开始体验。"
        }}</text
        ><text
          >此模式需要已配置的演示
          API。公开静态页面没有服务时不会自动转为本地成功；可手动选择顶部本地演示。</text
        ><AppButton
          class="xs-primary"
          :disabled="shop.loading"
          @click="shop.connect()"
          >{{ shop.loading ? "连接中…" : "重新连接服务" }}</AppButton
        ></view
      >
      <template v-else>
        <view v-if="screen === 'catalog'">
          <view class="xs-hero"
            ><view
              ><text class="xs-kicker"
                >EVERYDAY OBJECTS / CONSIDERED CHOICES</text
              ><view class="xs-hero-title" role="heading" aria-level="1"
                ><text class="xs-hero-line">日常好物，</text
                ><text class="xs-hero-line xs-accent">认真挑选。</text></view
              ><text class="xs-lead"
                >一只杯子，一盏小灯，一段慢下来的时光。<br />把生活里用得到的喜欢，带回日常。</text
              ><view class="xs-hero-tags"
                ><text>原创生活提案</text><text>整数分计价</text
                ><text>服务端库存</text></view
              ></view
            ><view class="xs-hero-art"
              ><ProductArt kind="cup" color="#a6ad90" backdrop="#e0e4d5" /><text
                >THE QUIET COLLECTION / 01</text
              ></view
            ></view
          >
          <view class="xs-section-head"
            ><view
              ><text class="xs-kicker">CURATED FOR YOUR DAY</text
              ><text class="xs-subtitle">用心挑选，慢慢喜欢。</text></view
            ><text>{{ products.length }} 件演示商品</text></view
          >
          <view class="xs-search"
            ><input
              v-model="shop.query"
              aria-label="搜索商品"
              placeholder="搜索一件日常好物"
              :disabled="disabled"
            /><AppButton
              :aria-pressed="stockOnly"
              @click="stockOnly = !stockOnly"
              >{{ stockOnly ? "✓" : "○" }} 只看有货</AppButton
            ><picker
              :range="['编辑推荐', '价格从低到高', '价格从高到低']"
              @change="
                sort = ['featured', 'low', 'high'][Number($event.detail.value)]
              "
              ><view class="xs-sort"
                >{{
                  sort === "low"
                    ? "价格从低到高"
                    : sort === "high"
                      ? "价格从高到低"
                      : "编辑推荐"
                }}
                ▾</view
              ></picker
            ></view
          >
          <view class="xs-categories"
            ><AppButton
              :class="{ active: !shop.category }"
              :disabled="disabled"
              @click="shop.category = ''"
              >全部</AppButton
            ><AppButton
              v-for="group in shop.categories"
              :key="group.id"
              :class="{ active: shop.category === group.id }"
              :disabled="disabled"
              @click="shop.category = group.id"
              >{{ group.name }}</AppButton
            ></view
          >
          <view v-if="!products.length" class="xs-empty"
            ><text class="xs-subtitle">暂时没有找到这件好物。</text
            ><text>换个关键词或类别，再看看。</text
            ><AppButton
              class="xs-secondary"
              @click="
                shop.query = '';
                shop.category = '';
                stockOnly = false;
              "
              >清除筛选</AppButton
            ></view
          >
          <view class="xs-product-grid"
            ><AppButton
              v-for="product in products"
              :key="product.id"
              class="xs-product"
              @click="go('product', product.id)"
              ><view class="xs-product-art"
                ><ProductArt :kind="product.art" /></view
              ><view class="xs-product-info"
                ><text class="xs-kicker">{{
                  shop.categories.find((group) => group.id === product.category)
                    ?.name || product.category
                }}</text
                ><text class="xs-product-name">{{ product.name }}</text
                ><view
                  ><text class="xs-price"
                    >¥{{
                      money(Math.min(...product.skus.map((item) => item.price)))
                    }}
                    <text>起</text></text
                  ><text>{{ product.skus.length }} 种规格 ↗</text></view
                ></view
              ></AppButton
            ></view
          >
        </view>

        <view v-else-if="screen === 'product'" class="xs-section"
          ><AppButton class="xs-back" @click="home">← 返回好物目录</AppButton
          ><view v-if="shop.detailLoading" class="xs-empty" role="status"
            >正在查询商品与实时库存…</view
          ><view v-else-if="!shop.detail" class="xs-empty"
            ><text class="xs-title">没有找到这件商品。</text
            ><text>商品不存在或已不可访问，没有替换成其他商品。</text
            ><AppButton class="xs-primary" @click="home"
              >返回商品目录</AppButton
            ></view
          ><view v-else class="xs-detail"
            ><view class="xs-detail-art"
              ><ProductArt :kind="shop.detail.art" /></view
            ><view class="xs-detail-copy"
              ><text class="xs-kicker">XIANGJI SELECT / DAILY OBJECTS</text
              ><text class="xs-title" role="heading" aria-level="1">{{
                shop.detail.name
              }}</text
              ><text class="xs-lead">{{ shop.detail.description }}</text
              ><text class="xs-detail-price">¥{{ money(sku?.price || 0) }}</text
              ><text class="xs-label">选择规格</text
              ><view class="xs-skus"
                ><AppButton
                  v-for="option in shop.detail.skus"
                  :key="option.id"
                  :class="{ chosen: sku?.id === option.id }"
                  :aria-pressed="sku?.id === option.id"
                  :disabled="disabled || option.available === 0"
                  @click="selectSku(option.id)"
                  >{{ option.label
                  }}<text>{{
                    option.available > 0
                      ? `余 ${option.available} 件`
                      : "已售罄"
                  }}</text></AppButton
                ></view
              ><view class="xs-quantity-line"
                ><text>数量 · 每种规格限购 5 件</text
                ><view class="xs-stepper"
                  ><AppButton
                    aria-label="减少购买数量"
                    :disabled="disabled || quantity <= 1"
                    @click="quantity--"
                    >−</AppButton
                  ><input
                    v-model.number="quantity"
                    type="number"
                    aria-label="购买数量"
                    :disabled="disabled"
                  /><AppButton
                    aria-label="增加购买数量"
                    :disabled="
                      disabled || quantity >= Math.min(5, sku?.available || 0)
                    "
                    @click="quantity++"
                    >+</AppButton
                  ></view
                ></view
              ><AppButton
                class="xs-primary xs-wide"
                :disabled="disabled || !sku?.available"
                @click="add"
                >{{ shop.busy ? "正在加入…" : "加入购物袋" }}</AppButton
              ><AppButton class="xs-text-button" @click="go('cart')"
                >查看购物袋 {{ shop.count }} →</AppButton
              ><text class="xs-footnote"
                >库存为服务端演示数据，加入购物袋不占库存；创建订单时才会预留。无真实商品售卖。</text
              ></view
            ></view
          ></view
        >

        <view v-else-if="screen === 'cart'" class="xs-section"
          ><text class="xs-kicker">YOUR EVERYDAY FINDS</text
          ><text class="xs-title" role="heading" aria-level="1"
            >把喜欢，装进口袋。</text
          ><text class="xs-lead">仅结算勾选商品；修改经过服务器版本检查。</text
          ><view v-if="!shop.cart.items.length" class="xs-empty"
            ><text class="xs-subtitle">购物袋还是空的。</text
            ><AppButton class="xs-primary" @click="home"
              >发现好物</AppButton
            ></view
          ><template v-else
            ><view class="xs-cart-toolbar"
              ><AppButton
                :aria-pressed="allSelected"
                :disabled="disabled"
                @click="
                  shop.select(
                    allSelected ? [] : shop.cart.items.map((item) => item.id),
                  )
                "
                >{{ allSelected ? "✓" : "○" }} 全选</AppButton
              ><AppButton :disabled="disabled" @click="shop.refresh"
                >刷新购物袋</AppButton
              ></view
            ><view class="xs-cart-layout"
              ><view class="xs-cart-lines"
                ><view
                  v-for="line in shop.cart.items"
                  :key="line.id"
                  class="xs-cart-line"
                  ><AppButton
                    class="xs-check"
                    :aria-label="`选择${line.name} ${line.skuLabel}`"
                    :aria-pressed="line.selected"
                    :disabled="disabled"
                    @click="toggleLine(line.id)"
                    >{{ line.selected ? "✓" : "○" }}</AppButton
                  ><view class="xs-cart-line-copy"
                    ><text class="xs-product-name">{{ line.name }}</text
                    ><text
                      >{{ line.skuLabel }} · 可用 {{ line.available }} 件</text
                    ><text class="xs-price">¥{{ money(line.price) }}</text
                    ><view class="xs-stepper"
                      ><AppButton
                        :aria-label="`减少${line.name}数量`"
                        :disabled="disabled || line.quantity <= 1"
                        @click="shop.update(line.id, line.quantity - 1)"
                        >−</AppButton
                      ><text>{{ line.quantity }}</text
                      ><AppButton
                        :aria-label="`增加${line.name}数量`"
                        :disabled="
                          disabled ||
                          line.quantity >= Math.min(5, line.available)
                        "
                        @click="shop.update(line.id, line.quantity + 1)"
                        >+</AppButton
                      ></view
                    ></view
                  ><AppButton
                    class="xs-remove"
                    :disabled="disabled"
                    @click="shop.remove(line.id)"
                    >移除</AppButton
                  ></view
                ></view
              ><view class="xs-summary"
                ><text class="xs-subtitle">购物袋小计</text
                ><view class="xs-money-row"
                  ><text>已选 {{ shop.selectedCount }} 件</text
                  ><text>¥{{ money(selectedSubtotal) }}</text></view
                ><text class="xs-footnote"
                  >此处为商品小计。运费与优惠以结算页服务端报价为准；满 ¥129
                  免模拟运费，否则 ¥6。</text
                ><AppButton
                  class="xs-primary xs-wide"
                  :disabled="disabled || !shop.selectedCount"
                  @click="go('checkout')"
                  >获取结算报价 →</AppButton
                ></view
              ></view
            ></template
          ></view
        >

        <view v-else-if="screen === 'checkout'" class="xs-section"
          ><text class="xs-kicker">CONSIDERED, THEN CONFIRMED</text
          ><text class="xs-title" role="heading" aria-level="1"
            >确认这一份日常。</text
          ><text class="xs-lead"
            >仅使用预设虚构地址。报价有效 120 秒，创建订单后预留库存 15
            分钟。</text
          ><view class="xs-checkout-layout"
            ><view
              ><view class="xs-panel"
                ><text class="xs-subtitle">送到哪里？</text
                ><AppButton
                  v-for="address in shop.addresses"
                  :key="address.id"
                  class="xs-address"
                  :class="{ chosen: shop.addressId === address.id }"
                  :disabled="disabled"
                  :aria-pressed="shop.addressId === address.id"
                  @click="shop.addressId = address.id"
                  ><text
                    >{{ shop.addressId === address.id ? "●" : "○" }}
                    {{ address.title }}</text
                  ><text>{{ address.address }}</text></AppButton
                ></view
              ><view class="xs-panel"
                ><text class="xs-subtitle">当前会话券包</text
                ><view class="xs-coupon-grid"
                  ><view
                    v-for="offer in shop.templates"
                    :key="offer.id"
                    class="xs-coupon"
                    ><text>¥{{ money(offer.discount) }}</text
                    ><text
                      >{{ offer.name }} · 满 ¥{{ money(offer.minimum) }}</text
                    ><AppButton
                      class="xs-secondary"
                      :disabled="
                        disabled ||
                        shop.coupons.some((item) => item.id === offer.id)
                      "
                      @click="shop.claim(offer.id)"
                      >{{
                        shop.coupons.some((item) => item.id === offer.id)
                          ? "已领取"
                          : "领取演示券"
                      }}</AppButton
                    ></view
                  ></view
                ><view class="xs-coupon-options"
                  ><AppButton
                    :class="{ chosen: !shop.couponId }"
                    :disabled="disabled"
                    @click="shop.couponId = ''"
                    >{{ !shop.couponId ? "●" : "○" }} 不使用优惠券</AppButton
                  ><AppButton
                    v-for="coupon in shop.coupons"
                    :key="coupon.id"
                    :class="{ chosen: shop.couponId === coupon.id }"
                    :disabled="disabled || coupon.status !== 'AVAILABLE'"
                    @click="shop.couponId = coupon.id"
                    >{{ shop.couponId === coupon.id ? "●" : "○" }}
                    {{ coupon.name }} ·
                    {{
                      coupon.status === "AVAILABLE"
                        ? "可选择"
                        : coupon.status === "HELD"
                          ? "订单占用中"
                          : "已使用"
                    }}</AppButton
                  ></view
                ></view
              ></view
            ><view class="xs-summary"
              ><text class="xs-subtitle">服务端报价</text
              ><template v-if="shop.quote"
                ><view
                  v-for="line in shop.quote.lines"
                  :key="line.id"
                  class="xs-quote-line"
                  ><text
                    >{{ line.name }} · {{ line.skuLabel }} ×
                    {{ line.quantity }}</text
                  ><text>¥{{ money(line.price * line.quantity) }}</text></view
                ><view class="xs-money-row"
                  ><text>商品金额</text
                  ><text>¥{{ money(shop.quote.subtotal) }}</text></view
                ><view class="xs-money-row"
                  ><text>优惠减免</text
                  ><text>− ¥{{ money(shop.quote.discount) }}</text></view
                ><view class="xs-money-row"
                  ><text>模拟运费</text
                  ><text>¥{{ money(shop.quote.shipping) }}</text></view
                ><view class="xs-money-row xs-total"
                  ><text>模拟应付</text
                  ><text>¥{{ money(shop.quote.total) }}</text></view
                ><text class="xs-footnote"
                  >{{
                    quoteExpired
                      ? "报价已过期，请重新获取。"
                      : `报价剩余 ${remainingSeconds(shop.quote.expiresAt)} 秒`
                  }}
                  · 规则 {{ shop.quote.ruleVersion }}</text
                ><AppButton
                  class="xs-primary xs-wide"
                  :disabled="disabled || quoteExpired"
                  @click="createOrder"
                  >{{ shop.busy ? "正在创建…" : "确认创建模拟订单" }}</AppButton
                ></template
              ><template v-else
                ><text class="xs-footnote"
                  >选择地址与优惠券后获取报价。金额与库存由服务器复核，客户端不能修改实付金额。</text
                ></template
              ><AppButton
                class="xs-secondary xs-wide"
                :disabled="disabled || !shop.selectedCount || !shop.addressId"
                @click="shop.createQuote"
                >{{ shop.quote ? "重新获取报价" : "获取服务端报价" }}</AppButton
              ><text v-if="!shop.selectedCount" class="xs-footnote"
                >没有勾选商品，请返回购物袋。</text
              ><AppButton class="xs-text-button" @click="go('cart')"
                >返回购物袋</AppButton
              ></view
            ></view
          ></view
        >

        <view
          v-else-if="screen === 'orders' || screen === 'order'"
          class="xs-section"
          ><text class="xs-kicker">YOUR EVERYDAY STORIES</text
          ><text class="xs-title" role="heading" aria-level="1"
            >每一份期待，都有记录。</text
          ><text class="xs-lead"
            >模拟付款、发货与收货均由服务端确认，无真实支付与物流。</text
          ><view class="xs-order-tools"
            ><AppButton
              class="xs-secondary"
              :disabled="shop.busy"
              @click="shop.refresh"
              >刷新订单状态</AppButton
            ><AppButton
              v-if="screen === 'order'"
              class="xs-text-button"
              @click="go('orders')"
              >全部订单 →</AppButton
            ></view
          ><view v-if="screen === 'orders'" class="xs-categories"
            ><AppButton
              :class="{ active: orderFilter === 'ALL' }"
              @click="orderFilter = 'ALL'"
              >全部</AppButton
            ><AppButton
              v-for="item in [
                { s: 'PENDING_PAYMENT', t: '待付款' },
                { s: 'PAID', t: '待发货' },
                { s: 'SHIPPED', t: '运输中' },
                { s: 'COMPLETED', t: '已完成' },
                { s: 'CANCELLED', t: '已取消' },
                { s: 'CLOSED', t: '已关闭' },
              ]"
              :key="item.s"
              :class="{ active: orderFilter === item.s }"
              @click="orderFilter = item.s"
              >{{ item.t }}</AppButton
            ></view
          ><view v-if="!visibleOrders.length" class="xs-empty"
            ><text class="xs-subtitle">{{
              screen === "order" ? "没有可访问的订单。" : "这里还没有订单。"
            }}</text
            ><text>仅显示当前会话有权访问的记录。</text
            ><AppButton class="xs-primary" @click="home"
              >发现好物</AppButton
            ></view
          ><view v-for="order in visibleOrders" :key="order.id" class="xs-order"
            ><view class="xs-order-heading"
              ><text class="xs-badge">{{ orderLabels[order.status] }}</text
              ><text>{{ time(order.createdAt) }}</text></view
            ><text class="xs-order-id">{{ order.id }}</text
            ><view
              v-for="line in order.lines"
              :key="line.id"
              class="xs-quote-line"
              ><text
                >{{ line.name }} · {{ line.skuLabel }} ×
                {{ line.quantity }}</text
              ><text>¥{{ money(line.price * line.quantity) }}</text></view
            ><view class="xs-order-total"
              ><text
                >商品 ¥{{ money(order.subtotal) }} − 优惠 ¥{{
                  money(order.discount)
                }}
                + 运费 ¥{{ money(order.shipping) }}</text
              ><text class="xs-price"
                >模拟金额 ¥{{ money(order.total) }}</text
              ></view
            ><text v-if="order.status === 'PENDING_PAYMENT'" class="xs-footnote"
              >{{
                remainingSeconds(order.expiresAt) > 0
                  ? `库存预留还剩 ${remainingSeconds(order.expiresAt)} 秒`
                  : "预留时间已到，请刷新服务器状态。"
              }}
              · 已有 {{ order.paymentAttempts }} 次付款尝试</text
            ><view class="xs-timeline"
              ><view
                v-for="(event, index) in order.timeline"
                :key="`${event.at}-${index}`"
                ><text
                  >●
                  {{
                    orderLabels[event.status as OrderStatus] ||
                    (event.status === "PAYMENT_FAILED"
                      ? "模拟付款失败"
                      : "状态记录")
                  }}</text
                ><text>{{ time(event.at) }}</text></view
              ></view
            ><view class="xs-actions"
              ><template v-if="order.status === 'PENDING_PAYMENT'"
                ><AppButton
                  class="xs-primary"
                  :disabled="disabled"
                  @click="shop.action(order.id, 'demo-payment', 'success')"
                  >模拟付款成功</AppButton
                ><AppButton
                  class="xs-secondary"
                  :disabled="disabled"
                  @click="shop.action(order.id, 'demo-payment', 'failure')"
                  >模拟付款失败</AppButton
                ><AppButton
                  class="xs-text-button"
                  :disabled="disabled"
                  @click="cancel(order.id)"
                  >取消订单</AppButton
                ></template
              ><AppButton
                v-if="order.status === 'PAID'"
                class="xs-primary"
                :disabled="disabled"
                @click="shop.action(order.id, 'demo-ship')"
                >模拟发货</AppButton
              ><AppButton
                v-if="order.status === 'SHIPPED'"
                class="xs-primary"
                :disabled="disabled"
                @click="shop.action(order.id, 'confirm-receipt')"
                >确认模拟收货</AppButton
              ><AppButton
                v-if="screen !== 'order'"
                class="xs-text-button"
                @click="go('order', order.id)"
                >查看订单详情 →</AppButton
              ></view
            ></view
          ><view class="xs-history"
            ><AppButton class="xs-text-button" @click="showLegacy = !showLegacy"
              >旧版本地历史 · {{ legacy.state.orders.length }} 条
              {{ showLegacy ? "收起" : "展开" }}</AppButton
            ><template v-if="showLegacy"
              ><text
                >这些旧版记录从未迁移为服务端订单，不计入服务端库存。旧金额快照与存储保持不变。</text
              ><view v-for="order in legacy.state.orders" :key="order.id"
                ><text
                  >{{ order.id }} · {{ order.status }} · ¥{{
                    money(order.total)
                  }}</text
                ></view
              ></template
            ></view
          ><view class="xs-reset"
            ><text>仅重置当前服务端演示；旧版本地历史保留。</text
            ><AppButton :disabled="disabled" @click="reset"
              >重置本次服务端演示</AppButton
            ></view
          ></view
        >
        <view v-else class="xs-empty"
          ><text class="xs-title">这个页面暂时不在巷集。</text
          ><AppButton class="xs-primary" @click="home"
            >返回首页</AppButton
          ></view
        >
        <view class="xs-footer"
          ><text class="xs-logo">巷集 SELECT.</text
          ><text>原创生活方式电商工程演示 / Chenxi DevLab</text
          ><text
            >商品、库存、优惠券、地址与交易全部模拟 · 非真实商城</text
          ></view
        >
      </template>
    </view>
    <view v-if="shop.connected" class="xs-mobile-nav"
      ><AppButton
        :class="{ active: screen === 'catalog' || screen === 'product' }"
        @click="home"
        >⌂<text>发现</text></AppButton
      ><AppButton
        :class="{ active: screen === 'cart' || screen === 'checkout' }"
        @click="go('cart')"
        >♧ {{ shop.count || "" }}<text>购物袋</text></AppButton
      ><AppButton
        :class="{ active: screen === 'orders' || screen === 'order' }"
        @click="go('orders')"
        >▤<text>订单</text></AppButton
      ></view
    >
  </view>
</template>
<style src="./select.css"></style>
