<script setup lang="ts">
import type { OrbitBranch } from "../../../../../packages/intelligence/src/orbit/types";
const props = defineProps<{ branch: OrbitBranch }>();
function point(id: string) {
  const p = props.branch.snapshot.stations.find((s) => s.id === id)
    ?.position ?? [0, 0, 0];
  return { x: 150 + p[0] * 10, y: 84 + p[2] * 7 };
}
function used(id: string, carrier: string) {
  return props.branch.trace.some(
    (e) => e.laneId === id && e.carrierId === carrier,
  );
}
</script>
<template>
  <svg
    viewBox="0 0 300 175"
    class="orbit-branch-map"
    role="img"
    :aria-label="`${branch.strategy === 'time' ? '时效' : '能耗'}策略的真实执行航路`"
  >
    <g v-for="lane in branch.snapshot.lanes" :key="lane.id">
      <line
        :x1="point(lane.from).x"
        :y1="point(lane.from).y"
        :x2="point(lane.to).x"
        :y2="point(lane.to).y"
        stroke="#355467"
        stroke-width="1"
      />
      <line
        v-for="(carrier, i) in branch.snapshot.carriers.filter((c) =>
          used(lane.id, c.id),
        )"
        :key="carrier.id"
        :x1="point(lane.from).x + i * 3"
        :y1="point(lane.from).y + i * 3"
        :x2="point(lane.to).x + i * 3"
        :y2="point(lane.to).y + i * 3"
        :stroke="carrier.id === 'carrier-a' ? '#a5edce' : '#f5b076'"
        stroke-width="2.5"
      />
    </g>
    <g v-for="station in branch.snapshot.stations" :key="station.id">
      <circle
        :cx="point(station.id).x"
        :cy="point(station.id).y"
        :r="station.id === branch.snapshot.task.targetId ? 7 : 4"
        fill="#152c39"
        stroke="#a4c7cc"
      />
      <text
        :x="point(station.id).x"
        :y="point(station.id).y - 11"
        text-anchor="middle"
        fill="#9fbac7"
        font-size="10"
      >
        {{ station.label.split(" · ")[0] }}
      </text>
    </g>
  </svg>
</template>
