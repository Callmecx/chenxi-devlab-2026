<script setup lang="ts">
import type {
  OrbitCarrier,
  OrbitSelection,
  OrbitSnapshot,
} from "../../../../../packages/intelligence/src/orbit/types";
const props = defineProps<{
  snapshot: OrbitSnapshot;
  selected: OrbitSelection | null;
}>();
const emit = defineEmits<{ select: [value: OrbitSelection] }>();
function point(id: string) {
  const p = props.snapshot.stations.find((s) => s.id === id)?.position ?? [
    0, 0, 0,
  ];
  return { x: 440 + p[0] * 24 + p[2] * 7, y: 320 + p[2] * 20 - p[1] * 12 };
}
function ship(c: OrbitCarrier) {
  const from = point(c.transit?.from ?? c.nodeId);
  const to = point(c.transit?.to ?? c.nodeId);
  const t = c.transit ? c.transit.elapsed / c.transit.duration : 0;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
</script>
<template>
  <svg
    class="orbit-map"
    viewBox="0 0 900 660"
    role="group"
    aria-label="可交互航道星图，使用站点和航道按钮改变世界"
    data-testid="orbit-map"
  >
    <defs>
      <radialGradient id="orbit-map-glow">
        <stop stop-color="#38c7c0" stop-opacity=".25" />
        <stop offset="1" stop-color="#38c7c0" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="orbit-map-metal" x2="1" y2="1">
        <stop stop-color="#b4c8d5" />
        <stop offset=".45" stop-color="#344952" />
        <stop offset="1" stop-color="#132935" />
      </linearGradient>
    </defs>
    <circle cx="570" cy="295" r="270" fill="url(#orbit-map-glow)" />
    <g fill="none" stroke="#7b9dab" opacity=".13">
      <ellipse cx="465" cy="340" rx="340" ry="230" />
      <ellipse cx="465" cy="340" rx="280" ry="175" />
      <path d="M80 340H850M465 90V600" />
    </g>
    <g
      v-for="lane in snapshot.lanes"
      :key="lane.id"
      tabindex="0"
      role="button"
      :aria-label="`航道 ${lane.id} ${lane.open ? '畅通' : '关闭'}`"
      @click="emit('select', { kind: 'lane', id: lane.id })"
      @keydown.enter="emit('select', { kind: 'lane', id: lane.id })"
      @keydown.space.prevent="emit('select', { kind: 'lane', id: lane.id })"
    >
      <line
        :x1="point(lane.from).x"
        :y1="point(lane.from).y"
        :x2="point(lane.to).x"
        :y2="point(lane.to).y"
        stroke="transparent"
        stroke-width="24"
      />
      <line
        :x1="point(lane.from).x"
        :y1="point(lane.from).y"
        :x2="point(lane.to).x"
        :y2="point(lane.to).y"
        :stroke="lane.open ? '#68cec6' : '#ff8b78'"
        :stroke-width="selected?.id === lane.id ? 5 : 2"
        :stroke-dasharray="lane.open ? undefined : '5 8'"
        :opacity="lane.open ? 0.5 : 0.9"
      />
    </g>
    <g
      v-for="station in snapshot.stations"
      :key="station.id"
      :transform="`translate(${point(station.id).x} ${point(station.id).y})`"
      tabindex="0"
      role="button"
      :aria-label="`站点 ${station.label} 库存 ${station.stock}`"
      @click="emit('select', { kind: 'station', id: station.id })"
      @keydown.enter="emit('select', { kind: 'station', id: station.id })"
      @keydown.space.prevent="
        emit('select', { kind: 'station', id: station.id })
      "
    >
      <circle
        :r="station.kind === 'target' ? 57 : 27"
        fill="#0b1b28"
        stroke="url(#orbit-map-metal)"
        :stroke-width="station.kind === 'target' ? 15 : 7"
      />
      <circle
        :r="station.kind === 'target' ? 39 : 17"
        fill="none"
        :stroke="selected?.id === station.id ? '#ffa577' : '#58c5c3'"
        stroke-width="2"
        stroke-dasharray="5 8"
      />
      <path d="M-10 0H10M0 -10V10" stroke="#c9e8ee" />
      <text
        text-anchor="middle"
        :y="station.kind === 'target' ? 83 : 49"
        fill="#d4e7e9"
        font-size="13"
      >
        {{ station.label }}
      </text>
      <text
        v-if="station.kind === 'resource'"
        text-anchor="middle"
        y="66"
        fill="#77cfc6"
        font-size="10"
      >
        能源 {{ station.stock }} · 预留 {{ station.reserved }}
      </text>
    </g>
    <g
      v-for="(carrier, i) in snapshot.carriers"
      :key="carrier.id"
      :transform="`translate(${ship(carrier).x + i * 13} ${ship(carrier).y - 20})`"
      tabindex="0"
      role="button"
      :aria-label="`载体 ${carrier.label} 货物 ${carrier.cargo}`"
      @click="emit('select', { kind: 'carrier', id: carrier.id })"
      @keydown.enter="emit('select', { kind: 'carrier', id: carrier.id })"
      @keydown.space.prevent="
        emit('select', { kind: 'carrier', id: carrier.id })
      "
    >
      <path
        d="M0 -14L10 9L0 5L-10 9Z"
        :fill="i ? '#ffb57b' : '#88efe3'"
        stroke="#efffff"
      />
      <text x="16" y="0" fill="#e1f3f5" font-size="11">
        {{ carrier.label }}
      </text>
    </g>
    <text x="42" y="620" fill="#7f9cab" font-size="10" letter-spacing="3">
      LIVE TOPOLOGY / WORLD
      {{ snapshot.worldVersion.toString().padStart(3, "0") }}
    </text>
  </svg>
</template>
