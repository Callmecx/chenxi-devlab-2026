<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  DominionSnapshot,
  Selection,
  Ship,
  RegionId,
} from "../../../../../packages/intelligence/src/dominion/types";
const props = defineProps<{
  snapshot: DominionSnapshot;
  selected: Selection | null;
}>();
const emit = defineEmits<{ select: [value: Selection] }>();
const region = ref<RegionId | "all">("all");
const regions = [
  { id: "all", label: "全域" },
  { id: "dawn", label: "曙光" },
  { id: "frost", label: "霜环" },
  { id: "ember", label: "赤砂" },
] as const;
const roleLabel = { transport: "运输舰", survey: "勘测舰", repair: "维修舰" };
const bounds = computed(() => {
  const points = props.snapshot.stations
    .filter((s) => region.value === "all" || s.regionId === region.value)
    .map((s) => s.position);
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[2]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
});
function point(id: string) {
  const s = props.snapshot.stations.find((s) => s.id === id);
  const p = s?.position ?? [0, 0, 0];
  const b = bounds.value;
  return {
    x: 90 + ((p[0]! - b.minX) / Math.max(1, b.maxX - b.minX)) * 780,
    y: 95 + ((p[2]! - b.minZ) / Math.max(1, b.maxZ - b.minZ)) * 385,
  };
}
function position(s: Ship) {
  const a = point(s.transit?.from ?? s.nodeId),
    b = point(s.transit?.to ?? s.nodeId);
  const t = s.transit ? s.transit.elapsed / Math.max(1, s.transit.duration) : 0;
  const i = props.snapshot.ships
    .filter((other) => other.nodeId === s.nodeId && !other.transit)
    .findIndex((other) => other.id === s.id);
  return {
    x: a.x + (b.x - a.x) * t + (s.transit ? 0 : Math.max(0, i) * 18 - 18),
    y: a.y + (b.y - a.y) * t - 28,
  };
}
function visible(id: string) {
  return (
    region.value === "all" ||
    props.snapshot.stations.some(
      (s) => s.id === id && s.regionId === region.value,
    )
  );
}
const visibleShips = computed(() =>
  props.snapshot.ships.filter(
    (s) =>
      visible(s.transit?.from ?? s.nodeId) ||
      visible(s.transit?.to ?? s.nodeId),
  ),
);
function choose(kind: Selection["kind"], id: string) {
  emit("select", { kind, id });
}
</script>

<template>
  <div class="dom-map-wrap" data-testid="dominion-map">
    <div class="dom-map-regions" aria-label="星图区域">
      <button
        v-for="r in regions"
        :key="r.id"
        :aria-pressed="region === r.id"
        @click="region = r.id"
      >
        {{ r.label }}
      </button>
    </div>
    <svg
      viewBox="0 0 960 600"
      class="dom-map"
      role="group"
      aria-label="共享世界全息星图，站点、航道与舰船均可用键盘选择"
    >
      <g class="dom-map-grid" aria-hidden="true">
        <path
          v-for="n in 10"
          :key="n"
          :d="`M${n * 90} 45V545 M45 ${n * 50}H920`"
        />
      </g>
      <g
        v-for="lane in snapshot.lanes.filter(
          (l) => visible(l.from) && visible(l.to),
        )"
        :key="lane.id"
        role="button"
        tabindex="0"
        :aria-label="`航道 ${lane.id} ${!lane.open ? '用户禁行' : lane.damaged ? '设施受损' : '可通行'}`"
        :data-lane-id="lane.id"
        :data-open="lane.open"
        :data-damaged="lane.damaged"
        @click="choose('lane', lane.id)"
        @keydown.enter.prevent="choose('lane', lane.id)"
        @keydown.space.prevent="choose('lane', lane.id)"
      >
        <line
          :x1="point(lane.from).x"
          :y1="point(lane.from).y"
          :x2="point(lane.to).x"
          :y2="point(lane.to).y"
          stroke="transparent"
          stroke-width="32"
        />
        <line
          :x1="point(lane.from).x"
          :y1="point(lane.from).y"
          :x2="point(lane.to).x"
          :y2="point(lane.to).y"
          :class="[
            'dom-map-lane',
            {
              closed: !lane.open,
              damaged: lane.damaged,
              selected: selected?.kind === 'lane' && selected.id === lane.id,
            },
          ]"
        />
        <text
          v-if="!lane.open || lane.damaged"
          :x="(point(lane.from).x + point(lane.to).x) / 2"
          :y="(point(lane.from).y + point(lane.to).y) / 2 - 8"
          class="dom-map-warning"
        >
          {{ !lane.open ? "禁行" : "受损" }}
        </text>
      </g>
      <g
        v-for="station in snapshot.stations.filter((s) => visible(s.id))"
        :key="station.id"
        role="button"
        tabindex="0"
        :aria-label="`站点 ${station.label} 泊位 ${station.dockCapacity - station.blockedBerths}`"
        :transform="`translate(${point(station.id).x} ${point(station.id).y})`"
        :class="[
          'dom-map-station',
          {
            selected:
              selected?.kind === 'station' && selected.id === station.id,
          },
        ]"
        @click="choose('station', station.id)"
        @keydown.enter.prevent="choose('station', station.id)"
        @keydown.space.prevent="choose('station', station.id)"
      >
        <circle r="28" fill="transparent" />
        <circle :r="station.kind === 'port' ? 16 : 10" />
        <path v-if="station.kind === 'port'" d="M-24 0H24M0 -24V24" />
        <text y="40" text-anchor="middle">{{ station.label }}</text>
        <text
          v-if="station.blockedBerths || station.damaged"
          y="58"
          text-anchor="middle"
          class="dom-map-warning"
        >
          {{
            station.damaged ? "设施受损" : `泊位占用 ${station.blockedBerths}`
          }}
        </text>
      </g>
      <g
        v-for="ship in visibleShips"
        :key="ship.id"
        role="button"
        tabindex="0"
        :aria-label="`${roleLabel[ship.role]} ${ship.label} 能量 ${ship.energy}`"
        :data-ship-id="ship.id"
        :transform="`translate(${position(ship).x} ${position(ship).y})`"
        :class="[
          'dom-map-ship',
          ship.role,
          { selected: selected?.kind === 'ship' && selected.id === ship.id },
        ]"
        @click="choose('ship', ship.id)"
        @keydown.enter.prevent="choose('ship', ship.id)"
        @keydown.space.prevent="choose('ship', ship.id)"
      >
        <circle r="24" fill="transparent" stroke="none" />
        <path
          :d="
            ship.role === 'transport'
              ? 'M-11 10V-7L0 -17L11 -7V10L0 6Z'
              : ship.role === 'survey'
                ? 'M0 -18L17 9L0 3L-17 9Z'
                : 'M-12 -9H-5V-16H5V-9H12V9H5V15H-5V9H-12Z'
          "
        />
        <title>{{ ship.label }} · {{ ship.status }}</title>
      </g>
      <text x="45" y="572" class="dom-map-meta">
        WORLD {{ snapshot.worldVersion }} / TICK {{ snapshot.tick }} ·
        压缩尺度拓扑，非真实轨道
      </text>
    </svg>
    <div class="dom-map-legend">
      <span>△ 勘测</span><span>⬟ 运输</span><span>＋ 维修</span
      ><span>虚线＝禁行 / 受损</span>
    </div>
  </div>
</template>
