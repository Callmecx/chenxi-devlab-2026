<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import ShopApp from "../../components/ShopShell.vue";
const id = ref("cup");
onLoad((query) => {
  if (query?.id) id.value = query.id;
});
</script>
<template><ShopApp screen="product" :product-id="id" /></template>
