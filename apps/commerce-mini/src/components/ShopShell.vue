<script setup lang="ts">
import LegacyShop from "./ShopApp.vue";
import SelectExperience from "../v2/SelectExperience.vue";
import AppButton from "./AppButton.vue";
import { useSelect } from "../v2/store";
const props = withDefaults(
  defineProps<{
    screen?: "catalog" | "product" | "cart" | "checkout" | "orders" | "order";
    productId?: string;
    orderId?: string;
  }>(),
  { screen: "catalog", productId: "cup", orderId: "" },
);
const server = useSelect();
</script>
<template>
  <view class="select-mode"
    ><view
      ><text class="select-mode-title">巷集 Select</text
      ><text class="select-mode-copy">{{
        server.mode === "local"
          ? "本地演示 · 旧版 ShopPilot 流程，仅当前设备保存"
          : "服务端演示 · 商品、金额、库存与订单由 API 确认"
      }}</text></view
    ><view class="select-mode-actions"
      ><AppButton
        :aria-pressed="server.mode === 'local'"
        :disabled="server.busy || server.pending || server.loading"
        @click="server.setMode('local')"
        >本地演示</AppButton
      ><AppButton
        :aria-pressed="server.mode === 'server'"
        :disabled="server.busy || server.pending || server.loading"
        @click="server.setMode('server')"
        >连接本地服务</AppButton
      ></view
    ></view
  >
  <SelectExperience v-if="server.mode === 'server'" v-bind="props" />
  <LegacyShop
    v-else
    :screen="props.screen === 'order' ? 'orders' : props.screen"
    :product-id="props.productId"
  />
</template>
<style scoped>
.select-mode {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: #e5e8dc;
  border-bottom: 1px solid #c5cbb9;
  padding: 14px 5%;
}
.select-mode-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 5px;
}
.select-mode-copy {
  display: block;
  font-size: 11px;
  line-height: 1.7;
  color: #52604d;
}
.select-mode-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.select-mode-actions .app-button {
  font-size: 12px;
  padding: 10px 14px;
  border: 1px solid #8d9d85;
  background: transparent;
  border-radius: 3px;
}
.select-mode-actions .app-button[aria-pressed="true"] {
  background: #344c3b;
  color: #fff;
}
@media (max-width: 650px) {
  .select-mode {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 20px;
  }
  .select-mode-actions {
    width: 100%;
  }
  .select-mode-actions .app-button {
    flex: 1;
  }
}
</style>
