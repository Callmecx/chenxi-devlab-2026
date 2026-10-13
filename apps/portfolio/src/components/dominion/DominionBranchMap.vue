<script setup lang="ts">
import type { BranchResult } from "../../../../../packages/intelligence/src/dominion/types";
const props = defineProps<{ branch: BranchResult }>();
const labels = {
  time: "时效",
  energy: "能耗",
  robust: "稳健",
  balanced: "平衡",
};
function point(id: string) {
  const p = props.branch.snapshot.stations.find((s) => s.id === id)
    ?.position ?? [0, 0, 0];
  return { x: 35 + (p[0] + 20) * 6.4, y: 30 + (p[2] + 13) * 4.8 };
}
function ships(id: string) {
  return props.branch.snapshot.ships.filter((s) =>
    props.branch.trace.some((t) => t.laneId === id && t.shipId === s.id),
  );
}
const colors = { transport: "#91ded0", survey: "#b1bdfb", repair: "#f6bd81" };
</script>
<template>
  <svg
    viewBox="0 0 330 200"
    class="dom-branch-map"
    role="img"
    :aria-label="`${labels[branch.strategy]}策略已计算的真实舰船航迹`"
  >
    <g v-for="lane in branch.snapshot.lanes" :key="lane.id">
      <line
        :x1="point(lane.from).x"
        :y1="point(lane.from).y"
        :x2="point(lane.to).x"
        :y2="point(lane.to).y"
        stroke="#294454"
        stroke-width="1"
      />
      <line
        v-for="(ship, i) in ships(lane.id)"
        :key="ship.id"
        :x1="point(lane.from).x + i * 2"
        :y1="point(lane.from).y + i * 2"
        :x2="point(lane.to).x + i * 2"
        :y2="point(lane.to).y + i * 2"
        :stroke="colors[ship.role]"
        stroke-width="2.5"
        :data-trace-ship="ship.id"
      />
    </g>
    <g v-for="station in branch.snapshot.stations" :key="station.id">
      <circle
        :cx="point(station.id).x"
        :cy="point(station.id).y"
        :r="station.kind === 'port' ? 6 : 3.5"
        fill="#0d2431"
        stroke="#a9c6cd"
      />
      <text
        v-if="['port', 'ice', 'lab', 'relay'].includes(station.id)"
        :x="point(station.id).x"
        :y="point(station.id).y - 10"
        text-anchor="middle"
      >
        {{ station.label }}
      </text>
    </g>
  </svg>
</template>
