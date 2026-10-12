<script setup lang="ts">
defineProps<{ kind: string }>();
</script>
<template>
  <div class="project-visual" :class="kind" aria-hidden="true">
    <template v-if="kind === 'shop'"
      ><span class="visual-caption">SHOP PILOT / 日常好物</span>
      <div class="product-scene">
        <div class="bottle">
          <i></i><span>DAILY<br />ESSENTIAL</span>
        </div>
        <div class="product-box">S / P<span>LESS, BUT BETTER.</span></div>
        <div class="product-orbit"></div>
      </div>
      <span class="visual-foot">thoughtful things, everyday.</span></template
    >
    <template v-else-if="kind === 'pulse'"
      ><span class="visual-caption">PULSE / 城市灵感现场</span>
      <div class="pulse-art">
        <span>PULSE</span><i></i><b>一起<br />发生。</b>
      </div>
      <span class="visual-foot">MEET. MAKE. MOVE. ↗</span></template
    >
    <template v-else-if="kind === 'enterprise'"
      ><span class="visual-caption">ENTERPRISE FLOW</span>
      <div class="mini-dashboard">
        <div class="mini-sidebar"><i></i><i></i><i></i><i></i></div>
        <div class="mini-content">
          <b>工作空间</b>
          <div class="mini-stats"><i></i><i></i><i></i></div>
          <div class="mini-table"><span v-for="n in 4" :key="n"></span></div>
        </div>
      </div>
      <span class="visual-foot">BUSINESS / SYSTEMS / DELIVERY</span></template
    >
    <template v-else
      ><span class="visual-caption">{{
        kind === "agent"
          ? "AGENT WORKBENCH"
          : kind === "poker"
            ? "POKER / DATA PIPELINE"
            : kind === "rust"
              ? "RUST / SYSTEM TOOLS"
              : "SOLANA / SIGNAL RADAR"
      }}</span>
      <div class="pipeline-art">
        <div class="pipeline-line"></div>
        <i>01</i
        ><i>{{ kind === "rust" ? "Rs" : kind === "agent" ? "AI" : "↗" }}</i
        ><i>03</i>
      </div>
      <span class="visual-foot">INPUT → PROCESS → INSIGHT</span></template
    >
  </div>
</template>
