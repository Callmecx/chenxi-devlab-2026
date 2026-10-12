<script setup lang="ts">
defineProps<{ kind: 'print' | 'walk' | 'talk' | 'sound'; large?: boolean }>();
</script>

<template>
  <div class="artwork" :class="[kind, { large }]" role="img" aria-hidden="true">
    <template v-if="kind === 'print'"
      ><i v-for="n in 4" :key="n" class="print-ring" :style="{ '--i': n }"></i
      ><span class="art-label">MAKE<br />YOUR<br />MARK.</span></template
    >
    <template v-else-if="kind === 'walk'"
      ><div class="walk-grid"></div>
      <div class="walk-line"></div>
      <span class="walk-dot"></span><span class="art-label">LOOK<br />AGAIN.</span></template
    >
    <template v-else-if="kind === 'talk'"
      ><i class="talk-orbit"></i><i class="talk-orbit second"></i
      ><span class="art-label">GOOD<br />IDEAS<br />TRAVEL.</span></template
    >
    <template v-else
      ><div class="sound-bars">
        <i
          v-for="n in 11"
          :key="n"
          :style="{ height: `${24 + Math.abs(Math.sin(n * 0.9)) * 70}%` }"
        ></i>
      </div>
      <span class="art-label">TUNE<br />IN.</span></template
    >
    <span class="art-corner">P / 26</span>
  </div>
</template>
