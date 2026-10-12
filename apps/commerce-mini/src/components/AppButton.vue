<script setup lang="ts">
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ click: [] }>();
</script>
<template>
  <button
    class="app-button"
    role="button"
    :disabled="disabled"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @click="!disabled && emit('click')"
    @keydown.enter.prevent="!disabled && emit('click')"
    @keydown.space.prevent="!disabled && emit('click')"
  >
    <slot />
  </button>
</template>
