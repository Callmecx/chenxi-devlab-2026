<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import ShopShell from "../../components/ShopShell.vue";
const id = ref("");
onLoad((query) => {
  id.value = typeof query?.id === "string" ? query.id : "";
});
</script>
<template><ShopShell screen="order" :order-id="id" /></template>
