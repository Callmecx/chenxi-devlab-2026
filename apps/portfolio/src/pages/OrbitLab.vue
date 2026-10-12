<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import {
  ArrowUpRight,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  X,
  SlidersHorizontal,
  Scan,
  Orbit,
  GitFork,
  Code2,
  Volume2,
  VolumeX,
  Download,
  Radio,
  ChevronRight,
  Square,
} from "lucide-vue-next";
import {
  createOrbitRuntime,
  MAX_ORBIT_BYTES,
  sourceKey,
  validateOrbitRecording,
  replayOrbit,
} from "../../../../packages/intelligence/src/orbit";
import type {
  OrbitCamera,
  OrbitComparison,
  OrbitMetrics,
  OrbitRecording,
  OrbitScenario,
  OrbitSelection,
  OrbitStrategy,
} from "../../../../packages/intelligence/src/orbit/types";
import OrbitMap from "../components/orbit/OrbitMap.vue";
import OrbitBranchMap from "../components/orbit/OrbitBranchMap.vue";
import "../orbit.css";

const OrbitScene = defineAsyncComponent({
  loader: () => import("../components/orbit/OrbitScene.vue"),
  onError: (_error, _retry, fail) => {
    view.value = "map";
    notice.value = "图形资源未加载，已切换可操作星图。";
    fail();
  },
});
let runtime = createOrbitRuntime({ seed: 4217 });
const snapshot = shallowRef(runtime.snapshot);
const events = shallowRef(runtime.events);
const mode = ref<"local-simulation" | "history-replay">("local-simulation");
const camera = ref<OrbitCamera>("overview");
const cameraRequest = ref(0);
const selected = ref<OrbitSelection | null>(null);
const drawer = ref<
  "settings" | "objects" | "engineering" | "comparison" | "library" | null
>(null);
const view = ref<"3d" | "map">("3d");
const quality = ref<"standard" | "high">("standard");
const reduced = ref(false);
const sound = ref(false);
const speed = ref(1);
const scenario = ref<OrbitScenario>("normal");
const notice = ref("");
const comparison = shallowRef<OrbitComparison | null>(null);
const comparing = ref(false);
const metrics = shallowRef<OrbitMetrics | null>(null);
const recording = shallowRef<OrbitRecording | null>(null);
const replayIndex = ref(-1);
const replayPlaying = ref(false);
const selectedTool = ref("");
let interval: ReturnType<typeof setInterval> | undefined;
let elapsed = 0;
let worker: Worker | undefined;
let workerTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let importEpoch = 0;
let audio: AudioContext | undefined;
let motionQuery: MediaQueryList | undefined;
let slowWindows = 0;
watch(drawer, (value) => {
  if (!value) return;
  const stage = document.querySelector<HTMLElement>(".orbit-stage");
  if (stage && stage.getBoundingClientRect().top < -80)
    stage.scrollIntoView({ behavior: "instant", block: "start" });
});
const labels = {
  ready: "等待出港",
  running: "任务执行中",
  paused: "任务已暂停",
  completed: "补给完成",
  failed: "任务受阻",
  cancelled: "已取消任务",
};
const readonly = computed(() => mode.value === "history-replay");
const visibleEvents = computed(() =>
  readonly.value && recording.value
    ? recording.value.events.slice(0, replayIndex.value + 1)
    : events.value,
);
const latest = computed(() => visibleEvents.value.slice(-8).reverse());
const energyUsed = computed(() =>
  snapshot.value.carriers.reduce((n, c) => n + c.initialEnergy - c.energy, 0),
);
const entity = computed(() =>
  selected.value
    ? (selected.value.kind === "station"
        ? snapshot.value.stations
        : selected.value.kind === "carrier"
          ? snapshot.value.carriers
          : snapshot.value.lanes
      ).find((o) => o.id === selected.value?.id)
    : undefined,
);
const lane = computed(() =>
  selected.value?.kind === "lane"
    ? snapshot.value.lanes.find((l) => l.id === selected.value?.id)
    : undefined,
);
const tool = computed(
  () =>
    snapshot.value.tools.find((t) => t.id === selectedTool.value) ??
    snapshot.value.tools.at(-1),
);
const canAdopt = computed(
  () =>
    !readonly.value &&
    snapshot.value.status === "paused" &&
    comparison.value?.sourceKey === sourceKey(snapshot.value),
);
const sourceRoot = "https://github.com/Callmecx/chenxi-devlab-2026/tree/main/";
const carrierLabels = {
  idle: "等待指令",
  moving: "航行中",
  loading: "装载中",
  delivering: "交付中",
  waiting: "预约让行",
  done: "本次交付完成",
  failed: "受阻待恢复",
};
function stationLabel(id: string) {
  return snapshot.value.stations.find((s) => s.id === id)?.label ?? id;
}
const entityFacts = computed(() => {
  const value = entity.value;
  if (!value) return [];
  if ("stock" in value)
    return [
      ["可用库存", value.stock - value.reserved],
      ["已预留", value.reserved],
      ["泊位容量", value.dockCapacity],
    ];
  if ("transit" in value)
    return [
      ["状态", carrierLabels[value.status]],
      [
        "位置",
        value.transit
          ? `${stationLabel(value.transit.from)} → ${stationLabel(value.transit.to)}`
          : stationLabel(value.nodeId),
      ],
      ["装载", `${value.cargo} / ${value.capacity}`],
      ["剩余能量", `${value.energy} EU`],
      ["已交付", value.delivered],
    ];
  return [
    ["连接", `${stationLabel(value.from)} → ${stationLabel(value.to)}`],
    ["状态", value.open ? "畅通" : "已关闭"],
    ["航行时间", `${value.ticks} 模拟步`],
    ["能量消耗", `${value.energy} EU`],
    ["通行容量", value.capacity],
  ];
});

function tone(freq = 460) {
  if (!sound.value) return;
  audio ??= new AudioContext();
  void audio.resume();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.025, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.13);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.14);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}
function sync() {
  snapshot.value = runtime.snapshot;
  events.value = runtime.events;
}
function abortComparison() {
  generation++;
  worker?.terminate();
  worker = undefined;
  clearTimeout(workerTimer);
  comparing.value = false;
}
function act(fn: () => unknown, invalidate = true) {
  if (readonly.value) return;
  if (invalidate) {
    abortComparison();
    importEpoch++;
  }
  try {
    fn();
    sync();
    notice.value = "";
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "操作未完成";
  }
}
function start() {
  act(() => runtime.start());
  tone(660);
}
function step() {
  act(() => {
    if (snapshot.value.status === "ready") runtime.start();
    else if (snapshot.value.status === "paused") runtime.resume();
    runtime.step();
    if (runtime.snapshot.status === "running") runtime.pause();
  });
}
function togglePause() {
  act(() =>
    snapshot.value.status === "running" ? runtime.pause() : runtime.resume(),
  );
}
function select(value: OrbitSelection) {
  selected.value = value;
  drawer.value = "objects";
  tone();
}
function setCamera(value: OrbitCamera) {
  cameraRequest.value++;
  camera.value = value;
  if (value === "focused-object" && !selected.value)
    selected.value = { kind: "carrier", id: snapshot.value.carriers[0]!.id };
  if (value === "engineering") drawer.value = "engineering";
}
function setLane(id: string, open: boolean) {
  act(() => runtime.setLane(id, open));
  tone(open ? 640 : 260);
}
function allLanes(open: boolean) {
  act(() => {
    for (const item of runtime.snapshot.lanes)
      if (item.open !== open) runtime.setLane(item.id, open);
  });
}
function reset() {
  importEpoch++;
  abortComparison();
  replayPlaying.value = false;
  mode.value = "local-simulation";
  runtime.reset(scenario.value, 4217);
  sync();
  comparison.value = null;
  selected.value = null;
  setCamera("overview");
  notice.value = "";
  elapsed = 0;
}
function compare() {
  if (readonly.value) return;
  if (snapshot.value.status === "running") act(() => runtime.pause());
  if (snapshot.value.status !== "paused") {
    notice.value = "请启动任务并暂停，再从这个真实快照比较。";
    return;
  }
  abortComparison();
  comparing.value = true;
  drawer.value = "comparison";
  setCamera("comparison");
  const ticket = generation;
  const key = sourceKey(snapshot.value);
  worker = new Worker(new URL("../workers/orbit.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (
    event: MessageEvent<{ result?: OrbitComparison; error?: string }>,
  ) => {
    if (ticket !== generation || sourceKey(runtime.snapshot) !== key) return;
    if (event.data.result) comparison.value = event.data.result;
    if (event.data.error) notice.value = event.data.error;
    abortComparison();
  };
  worker.onerror = () => {
    notice.value = "分支计算异常，当前任务保持原样，可重试。";
    abortComparison();
  };
  workerTimer = setTimeout(() => {
    notice.value = "分支计算超时，已终止计算，可重试。";
    abortComparison();
  }, 5000);
  worker.postMessage({
    snapshot: structuredClone(snapshot.value),
    seq: events.value.at(-1)?.seq ?? 0,
  });
}
function adopt(strategy: OrbitStrategy) {
  if (!canAdopt.value) {
    notice.value = "世界已变化，请重新计算分支。";
    return;
  }
  act(() => runtime.setStrategy(strategy));
  notice.value = "策略已应用到原暂停快照；预测中的动作尚未执行。";
  drawer.value = null;
}
function beginReplay() {
  importEpoch++;
  if (runtime.snapshot.status === "running") runtime.pause();
  abortComparison();
  sync();
  try {
    recording.value = runtime.exportRecording();
  } catch (error) {
    notice.value = `记录暂不可回放：${error instanceof Error ? error.message : "验证失败"}`;
    return;
  }
  if (!recording.value.events.length) {
    notice.value = "先运行任务，才有真实事件可以回放。";
    return;
  }
  mode.value = "history-replay";
  replayIndex.value = -1;
  replayPlaying.value = false;
  seekReplay();
  drawer.value = null;
}
function seekReplay() {
  if (recording.value)
    snapshot.value = replayOrbit(recording.value, replayIndex.value);
}
function replayStep() {
  if (!recording.value) return;
  if (replayIndex.value < recording.value.events.length - 1) {
    replayIndex.value++;
    seekReplay();
  } else replayPlaying.value = false;
}
function returnLive() {
  importEpoch++;
  mode.value = "local-simulation";
  replayPlaying.value = false;
  sync();
}
function exportJSON() {
  let data: OrbitRecording;
  try {
    data =
      readonly.value && recording.value
        ? recording.value
        : runtime.exportRecording();
  } catch (error) {
    notice.value = `导出失败：${error instanceof Error ? error.message : "记录验证失败"}`;
    return;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `orbit-${data.initial.runId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importJSON(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const ticket = ++importEpoch;
  try {
    if (file.size > MAX_ORBIT_BYTES) throw new Error("记录不能超过 8 MiB");
    const content = await file.text();
    if (ticket !== importEpoch) return;
    const valid = validateOrbitRecording(JSON.parse(content));
    if (ticket !== importEpoch) return;
    if (runtime.snapshot.status === "running") runtime.pause();
    abortComparison();
    recording.value = valid;
    mode.value = "history-replay";
    replayIndex.value = -1;
    replayPlaying.value = false;
    seekReplay();
    notice.value = "已验证记录，回放不会调用业务工具。";
  } catch (error) {
    if (ticket !== importEpoch) return;
    notice.value = `导入失败：${error instanceof Error ? error.message : "记录格式无效"}`;
  }
  input.value = "";
}
function hidden() {
  if (document.hidden) {
    if (runtime.snapshot.status === "running") {
      runtime.pause();
      if (!readonly.value) sync();
      notice.value = "页面进入后台，任务已暂停。";
    }
    replayPlaying.value = false;
    elapsed = 0;
  }
}
function motion() {
  reduced.value = motionQuery?.matches ?? false;
  if (reduced.value) view.value = "map";
}
function contextLost() {
  view.value = "map";
  notice.value = "图形上下文不可用，已切换星图，任务状态仍然保留。";
}
function onMetrics(value: OrbitMetrics) {
  metrics.value = value;
  if (value.frames < 120 || document.hidden) return;
  slowWindows = value.p95 > 70 ? slowWindows + 1 : 0;
  if (slowWindows >= 3) {
    slowWindows = 0;
    if (quality.value === "high") {
      quality.value = "standard";
      notice.value = "持续检测到较慢帧率，已降低绘制质量。";
    } else {
      view.value = "map";
      notice.value = "持续检测到较慢帧率，已切换轻量星图，任务状态保持。";
    }
  }
}
function print() {
  window.print();
}
onMounted(() => {
  motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  motion();
  motionQuery.addEventListener("change", motion);
  document.addEventListener("visibilitychange", hidden);
  interval = setInterval(() => {
    if (document.hidden) return;
    elapsed += 50;
    if (elapsed < 850 / speed.value) return;
    elapsed = 0;
    if (readonly.value) {
      if (replayPlaying.value) replayStep();
    } else if (snapshot.value.status === "running") {
      const previous = snapshot.value.status;
      act(() => runtime.step(), false);
      if (previous !== snapshot.value.status)
        tone(snapshot.value.status === "completed" ? 880 : 220);
    }
  }, 50);
});
onBeforeUnmount(() => {
  importEpoch++;
  clearInterval(interval);
  abortComparison();
  document.removeEventListener("visibilitychange", hidden);
  motionQuery?.removeEventListener("change", motion);
  void audio?.close();
});
</script>

<template>
  <div
    class="orbit-lab"
    :data-status="snapshot.status"
    :data-mode="mode"
    :data-world-version="snapshot.worldVersion"
    :data-tick="snapshot.simTick"
    :data-delivered="snapshot.task.delivered"
    :data-run-id="snapshot.runId"
    data-testid="orbit-lab"
    :data-render-metrics="metrics ? JSON.stringify(metrics) : null"
  >
    <nav class="orbit-nav" aria-label="实验室导航">
      <RouterLink to="/" class="orbit-wordmark"
        ><span class="orbit-emblem">c<span>›</span></span
        ><span>CHENXI <b>INTELLIGENCE LAB</b></span></RouterLink
      >
      <div class="orbit-nav-links">
        <RouterLink to="/projects"
          >全部作品 <ArrowUpRight :size="13" /></RouterLink
        ><button @click="drawer = drawer === 'library' ? null : 'library'">
          实用任务库</button
        ><a
          :href="sourceRoot + 'packages/intelligence/src/orbit'"
          target="_blank"
          rel="noopener noreferrer"
          >源码 <ArrowUpRight :size="13"
        /></a>
      </div>
      <div class="orbit-nav-end">
        <span class="orbit-simulation"
          ><i />{{ readonly ? "历史回放" : "本地算法仿真" }}</span
        ><button
          class="orbit-icon"
          :aria-label="sound ? '关闭声音' : '开启声音'"
          @click="
            sound = !sound;
            tone();
          "
        >
          <Volume2 v-if="sound" :size="16" /><VolumeX v-else :size="16" />
        </button>
      </div>
    </nav>

    <section class="orbit-stage" aria-label="星域智航交互场景">
      <div class="orbit-atmosphere" aria-hidden="true" />
      <div class="orbit-world">
        <OrbitScene
          v-if="view === '3d'"
          :snapshot="snapshot"
          :selected="selected"
          :camera="camera"
          :camera-request="cameraRequest"
          :quality="quality"
          :reduced="reduced"
          @select="select"
          @camera-interrupt="notice = '镜头已交给你；任务继续保持当前状态。'"
          @context-lost="contextLost"
          @metrics="onMetrics"
        />
        <OrbitMap
          v-else
          :snapshot="snapshot"
          :selected="selected"
          @select="select"
        />
      </div>
      <header class="orbit-hero">
        <p class="orbit-eyebrow">
          <span /> ORBIT / 星域智航 <span class="orbit-edition">03</span>
        </p>
        <h1>让智能，<br />改变下一步。</h1>
        <p class="orbit-intro">
          一个目标，多条可能的航线。<br />改变世界，看见决策如何发生。
        </p>
        <div class="orbit-hero-meta">
          <span>07 轨道站点</span><i /><span>02 自主载体</span>
        </div>
      </header>
      <div class="orbit-scene-note">
        <span>KEPLER ORBITAL / 4217</span
        ><span>原创虚拟轨道港 · 模拟业务数据</span>
      </div>
      <div class="orbit-view-controls" aria-label="镜头和场景模式">
        <button
          :class="{ active: camera === 'overview' }"
          aria-label="世界全景"
          @click="setCamera('overview')"
        >
          <Orbit :size="18" /><span>全景</span>
        </button>
        <button
          :class="{ active: camera === 'focused-object' }"
          aria-label="载体近景"
          @click="setCamera('focused-object')"
        >
          <Scan :size="18" /><span>近景</span>
        </button>
        <button
          :class="{ active: camera === 'mission' }"
          aria-label="跟随载体"
          @click="setCamera('mission')"
        >
          <Radio :size="18" /><span>跟随</span>
        </button>
        <button
          :class="{ active: view === 'map' }"
          aria-label="切换任务星图"
          @click="view = view === '3d' ? 'map' : '3d'"
        >
          <GitFork :size="18" /><span>{{
            view === "3d" ? "星图" : "三维"
          }}</span>
        </button>
        <button
          :class="{ active: drawer === 'engineering' }"
          aria-label="工程透视"
          @click="setCamera('engineering')"
        >
          <Code2 :size="18" /><span>工程</span>
        </button>
      </div>
      <div class="orbit-world-caption">
        <i /><span>{{
          snapshot.status === "ready"
            ? "航道已就绪，等待你的指令"
            : snapshot.message
        }}</span
        ><button aria-label="查看世界对象" @click="drawer = 'objects'">
          <ChevronRight :size="16" />
        </button>
      </div>

      <aside
        v-if="drawer"
        class="orbit-drawer"
        :class="`orbit-drawer-${drawer}`"
        aria-label="任务面板"
      >
        <div class="orbit-drawer-head">
          <span>{{
            {
              settings: "任务设置",
              objects: "世界对象",
              engineering: "工程透视",
              comparison: "时间分岔",
              library: "实用任务库",
            }[drawer]
          }}</span
          ><button
            class="orbit-icon"
            aria-label="关闭面板"
            @click="drawer = null"
          >
            <X :size="19" />
          </button>
        </div>
        <template v-if="drawer === 'settings'">
          <p>修改世界，观察真实约束。配置场景后重置生效。</p>
          <label
            >验收场景<select v-model="scenario" aria-label="验收场景">
              <option value="normal">标准补给 · 三份能源</option>
              <option value="detour">预置绕行</option>
              <option value="sealed">目标封锁 · 不可达</option>
              <option value="scarce">库存不足</option>
              <option value="low-energy">能量不足</option>
            </select></label
          >
          <button class="orbit-button" @click="reset">重置并应用场景</button>
          <label
            >图形质量<select v-model="quality" aria-label="图形质量">
              <option value="standard">标准 · 控制绘制像素</option>
              <option value="high">精细 · 高性能设备</option>
            </select></label
          >
          <label
            >仿真速度<select v-model.number="speed" aria-label="设置运行速度">
              <option :value="0.5">0.5×</option>
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="4">4×</option>
            </select></label
          >
          <label class="orbit-check"
            ><input
              v-model="reduced"
              type="checkbox"
              aria-label="减弱空间动效"
            />减弱空间动效（停止镜头飞越）</label
          >
          <button class="orbit-button secondary" @click="view = 'map'">
            切换二维降级
          </button>
          <p>
            任务成功依据：三份能源实际到站，库存、运力与能量守恒。双载体使用确定性优先级调度，不声明全局最优。
          </p>
          <label v-for="c in snapshot.carriers" :key="c.id"
            >{{ c.label }} 调度优先级<select
              :value="c.priority"
              :disabled="readonly"
              :aria-label="`${c.label} 优先级`"
              @change="
                act(() =>
                  runtime.setPriority(
                    c.id,
                    Number(($event.target as HTMLSelectElement).value),
                  ),
                )
              "
            >
              <option :value="0">0 · 让行</option>
              <option :value="1">1 · 常规</option>
              <option :value="2">2 · 优先</option>
            </select></label
          >
          <label
            >目标站<select
              :value="snapshot.task.targetId"
              :disabled="readonly"
              aria-label="目标站"
              @change="
                act(() =>
                  runtime.setTarget(($event.target as HTMLSelectElement).value),
                )
              "
            >
              <option
                v-for="s in snapshot.stations.filter(
                  (s) => s.kind !== 'resource',
                )"
                :key="s.id"
                :value="s.id"
              >
                {{ s.label }}
              </option>
            </select></label
          >
        </template>
        <template v-else-if="drawer === 'objects'">
          <p>点击场景中的站点、航道或载体，也可在这里选择。</p>
          <section v-if="entity" class="orbit-object-detail">
            <h3>{{ "label" in entity ? entity.label : entity.id }}</h3>
            <dl class="orbit-entity-facts">
              <div v-for="fact in entityFacts" :key="fact[0]">
                <dt>{{ fact[0] }}</dt>
                <dd>{{ fact[1] }}</dd>
              </div>
            </dl>
            <button
              v-if="lane"
              class="orbit-button"
              :disabled="readonly"
              @click="setLane(lane.id, !lane.open)"
            >
              {{ lane.open ? "关闭这条航道" : "重新开放航道" }}</button
            ><button
              v-if="selected?.kind === 'carrier'"
              class="orbit-button secondary"
              @click="
                setCamera('mission');
                drawer = null;
              "
            >
              跟随这个载体
            </button>
          </section>
          <div class="orbit-object-list">
            <button
              v-for="s in snapshot.stations"
              :key="s.id"
              :class="{ active: selected?.id === s.id }"
              @click="select({ kind: 'station', id: s.id })"
            >
              {{ s.label }} <small>库存 {{ s.stock }}</small>
            </button>
          </div>
          <div class="orbit-carrier-list">
            <button
              v-for="c in snapshot.carriers"
              :key="c.id"
              :data-carrier-id="c.id"
              :data-cargo="c.cargo"
              :data-energy="c.energy"
              :data-node="c.nodeId"
              @click="
                select({ kind: 'carrier', id: c.id });
                setCamera('focused-object');
              "
            >
              <span>{{ c.label }}</span
              ><small
                >{{ carrierLabels[c.status] }} · 货物 {{ c.cargo }}/{{
                  c.capacity
                }}
                · 能量 {{ c.energy }}</small
              >
            </button>
          </div>
          <div class="orbit-lane-list">
            <button
              v-for="l in snapshot.lanes"
              :key="l.id"
              :data-lane-id="l.id"
              :data-open="l.open"
              :class="{ closed: !l.open }"
              @click="select({ kind: 'lane', id: l.id })"
            >
              <span>{{ stationLabel(l.from) }} → {{ stationLabel(l.to) }}</span
              ><small
                >{{ l.open ? "畅通" : "关闭" }} · {{ l.ticks }} tick /
                {{ l.energy }} 能耗</small
              >
            </button>
          </div>
        </template>
        <template v-else-if="drawer === 'engineering'">
          <div class="orbit-facts">
            <span
              >世界版本 <b>{{ snapshot.worldVersion }}</b></span
            ><span
              >模拟步 <b>{{ snapshot.simTick }}</b></span
            ><span
              >重规划 <b>{{ snapshot.replans }}</b></span
            ><span
              >事件数 <b>{{ visibleEvents.length }}</b></span
            >
          </div>
          <p>
            {{ snapshot.plannerVersion }} · seed {{ snapshot.seed }}<br />{{
              snapshot.runId
            }}<br />以下为工具输入输出与执行事件，不是模型思维链。
          </p>
          <div class="orbit-tool-list">
            <button
              v-for="t in snapshot.tools"
              :key="t.id"
              @click="selectedTool = t.id"
            >
              <span>{{ t.label }}</span
              ><small>{{ t.status }} · {{ t.durationMs.toFixed(2) }} ms</small>
            </button>
          </div>
          <section v-if="tool">
            <h3>{{ tool.tool }}</h3>
            <pre>{{
              JSON.stringify(
                {
                  input: tool.input,
                  output: tool.output,
                  sources: tool.sources,
                },
                null,
                2,
              )
            }}</pre>
          </section>
          <ol class="orbit-events">
            <li v-for="e in latest" :key="e.eventId">
              <span
                >#{{ e.seq }} / T{{ e.simTick }} / W{{ e.worldVersion }}</span
              ><b>{{ e.type }}</b
              ><code>{{ JSON.stringify(e.payload) }}</code>
            </li>
          </ol>
          <p v-if="metrics">
            实测渲染：P50 {{ metrics.p50.toFixed(1) }} ms / P95
            {{ metrics.p95.toFixed(1) }} ms · {{ metrics.drawCalls }} draws ·
            {{ metrics.pixels.toLocaleString() }} px
          </p>
          <a
            :href="sourceRoot + 'packages/intelligence/src/orbit'"
            target="_blank"
            rel="noopener noreferrer"
            >图搜索、调度、动作校验源码 ↗</a
          ><a
            :href="sourceRoot + 'tests/e2e/orbit.spec.ts'"
            target="_blank"
            rel="noopener noreferrer"
            >浏览器测试依据 ↗</a
          >
          <button class="orbit-button secondary" @click="exportJSON">
            <Download :size="15" />导出执行记录 JSON</button
          ><label class="orbit-file"
            >导入并验证记录<input
              type="file"
              accept="application/json,.json"
              aria-label="导入执行记录"
              @change="importJSON"
          /></label>
        </template>
        <template v-else-if="drawer === 'comparison'">
          <p>
            同一快照、种子与故障序列，在隔离 Worker
            中计算两个未来。不会创建订单或调用收费工具。
          </p>
          <button
            class="orbit-button"
            :disabled="comparing || readonly"
            @click="compare"
          >
            {{ comparing ? "正在实算两条分支…" : "从当前暂停快照计算" }}
          </button>
          <template v-if="comparison">
            <div class="orbit-branches">
              <div
                class="orbit-branch"
                v-for="branch in [comparison.time, comparison.energy]"
                :key="branch.strategy"
                :data-branch="branch.strategy"
              >
                <span>{{
                  branch.strategy === "time" ? "优先时效" : "优先能耗"
                }}</span>
                <h3>{{ branch.ticks }} <small>模拟步</small></h3>
                <OrbitBranchMap :branch="branch" />
                <small>青色：巡航者 A · 暖色：信使 B · 已实算航段</small>
                <dl>
                  <div>
                    <dt>能量消耗</dt>
                    <dd>{{ branch.energyUsed }}</dd>
                  </div>
                  <div>
                    <dt>等待步数</dt>
                    <dd>{{ branch.waitTicks }}</dd>
                  </div>
                  <div>
                    <dt>实际结果</dt>
                    <dd>
                      {{ labels[branch.snapshot.status] }} ·
                      {{ branch.snapshot.task.delivered }}/3
                    </dd>
                  </div>
                  <div>
                    <dt>约束违规</dt>
                    <dd>{{ branch.violations.length }}</dd>
                  </div>
                </dl>
                <button
                  class="orbit-button secondary"
                  :disabled="!canAdopt"
                  @click="adopt(branch.strategy)"
                >
                  采用{{ branch.strategy === "time" ? "时效" : "能耗" }}策略
                </button>
              </div>
            </div>
            <p v-if="!canAdopt">
              原世界已变化或不处于暂停状态；需要重新计算才能采用。
            </p>
            <small
              >采用策略只改变原快照后续规划，不写入预测分支的动作。</small
            ></template
          >
        </template>
        <template v-else-if="drawer === 'library'">
          <p class="orbit-eyebrow">FROM ORBIT TO EVERYDAY</p>
          <h2>同一工程方法，<br />落在真实业务约束。</h2>
          <p>
            星港展示图搜索与调度；实用任务库展示查询、草稿、异常恢复和人工确认。全部使用明确标注的模拟数据。
          </p>
          <RouterLink
            class="orbit-library-card"
            to="/intelligence/tasks?preset=product"
            ><b>01 / 商品研究</b
            ><span>库存查询 → 预算比较 → 人工确认 → 本地草稿</span
            ><ArrowUpRight :size="20"
          /></RouterLink>
          <RouterLink
            class="orbit-library-card"
            to="/intelligence/tasks?preset=activity"
            ><b>02 / 活动助理</b
            ><span>场次筛选 → 名额校验 → 人工确认 → 隔离预约</span
            ><ArrowUpRight :size="20"
          /></RouterLink>
          <p>
            真实模型：未连接。无模型凭证也能完成本地算法体验。通用智能是愿景，本演示不构成
            AGI。
          </p>
        </template>
      </aside>
      <div v-if="notice" class="orbit-notice" role="status">
        {{ notice
        }}<button class="orbit-icon" aria-label="关闭提示" @click="notice = ''">
          <X :size="15" />
        </button>
      </div>
    </section>

    <section class="orbit-mission-dock" aria-label="补给任务控制">
      <div class="orbit-task-description">
        <span class="orbit-kicker"
          >MISSION 001 <i />
          {{ readonly ? "历史回放 · 无副作用" : "能源补给" }}</span
        >
        <h2>把三份能源，送到下一站。</h2>
        <p>
          {{ snapshot.task.label }}
          <button
            class="orbit-inline"
            aria-label="任务设置"
            @click="drawer = drawer === 'settings' ? null : 'settings'"
          >
            <SlidersHorizontal :size="14" />
          </button>
        </p>
      </div>
      <div class="orbit-mission-facts">
        <span
          ><small>交付进度</small
          ><b data-testid="delivery-progress"
            >{{ snapshot.task.delivered
            }}<em>/ {{ snapshot.task.quantity }}</em></b
          ></span
        ><span
          ><small>能量消耗</small><b>{{ energyUsed }}<em> EU</em></b></span
        ><span
          ><small>世界时钟</small
          ><b
            >{{ String(snapshot.simTick).padStart(3, "0") }}<em> T</em></b
          ></span
        >
      </div>
      <div class="orbit-primary-controls">
        <template v-if="!readonly"
          ><button
            v-if="snapshot.status === 'ready'"
            class="orbit-button primary"
            @click="start"
          >
            <Play :size="16" fill="currentColor" />开始补给任务</button
          ><button
            v-else-if="['running', 'paused'].includes(snapshot.status)"
            class="orbit-button primary"
            @click="togglePause"
          >
            <Pause v-if="snapshot.status === 'running'" :size="16" /><Play
              v-else
              :size="16"
            />{{
              snapshot.status === "running" ? "暂停任务" : "继续执行"
            }}</button
          ><button
            v-else-if="snapshot.status === 'failed'"
            class="orbit-button primary"
            @click="act(() => runtime.retry())"
          >
            重试任务</button
          ><button v-else class="orbit-button primary" @click="beginReplay">
            <Play :size="16" />回放这次任务
          </button>
          <div class="orbit-secondary-controls">
            <button
              :disabled="
                !['ready', 'running', 'paused'].includes(snapshot.status)
              "
              @click="step"
            >
              <SkipForward :size="14" />单步</button
            ><button aria-label="重置世界" @click="reset">
              <RotateCcw :size="14" />重置</button
            ><label
              >速度<select v-model.number="speed" aria-label="运行速度">
                <option :value="0.5">0.5×</option>
                <option :value="1">1×</option>
                <option :value="2">2×</option>
                <option :value="4">4×</option>
              </select></label
            >
          </div>
        </template>
        <template v-else
          ><button
            class="orbit-button primary"
            @click="replayPlaying = !replayPlaying"
          >
            {{ replayPlaying ? "暂停回放" : "播放记录" }}
          </button>
          <div class="orbit-secondary-controls">
            <button @click="replayStep">回放单步</button
            ><button @click="returnLive">返回实时世界</button>
          </div></template
        >
      </div>
      <div class="orbit-mission-status" :class="snapshot.status">
        <span
          ><i />{{ labels[snapshot.status]
          }}<b v-if="snapshot.failureCode">
            · {{ snapshot.failureCode }}</b
          ></span
        ><span>{{ snapshot.message }}</span>
      </div>
    </section>

    <section class="orbit-intervention-bar" aria-label="世界干预">
      <button class="orbit-mobile-library" @click="drawer = 'library'">
        实用任务库
      </button>
      <span>如果世界改变了呢？</span
      ><button :disabled="readonly" @click="allLanes(false)">
        封闭所有航道</button
      ><button :disabled="readonly" @click="allLanes(true)">
        重新开放所有航道</button
      ><button
        :disabled="readonly || !['running', 'paused'].includes(snapshot.status)"
        @click="compare"
      >
        <GitFork :size="14" />暂停并比较策略</button
      ><button
        :disabled="readonly || !['running', 'paused'].includes(snapshot.status)"
        @click="act(() => runtime.cancel())"
      >
        <Square :size="12" />取消任务</button
      ><button :disabled="readonly || !events.length" @click="beginReplay">
        查看回放
      </button>
    </section>
    <section v-if="readonly && recording" class="orbit-replay-strip">
      <label
        >事件 {{ replayIndex + 1 }} / {{ recording.events.length
        }}<input
          v-model.number="replayIndex"
          type="range"
          min="-1"
          :max="recording.events.length - 1"
          aria-label="回放进度"
          @input="seekReplay"
      /></label>
      <p>只读快照 · 不执行工具、不扣减库存、不改变当前世界</p>
    </section>
    <section
      v-if="['completed', 'failed', 'cancelled'].includes(snapshot.status)"
      class="orbit-result"
      aria-label="任务结果摘要"
    >
      <div>
        <span class="orbit-eyebrow">MISSION REPORT</span>
        <h2>{{ labels[snapshot.status] }}</h2>
        <p>{{ snapshot.message }}</p>
      </div>
      <dl>
        <div>
          <dt>实际到货</dt>
          <dd>{{ snapshot.task.delivered }} / {{ snapshot.task.quantity }}</dd>
        </div>
        <div>
          <dt>重新规划</dt>
          <dd>{{ snapshot.replans }} 次</dd>
        </div>
        <div>
          <dt>有效动作</dt>
          <dd>{{ snapshot.actionIds.length }}</dd>
        </div>
      </dl>
      <div class="orbit-result-actions">
        <button @click="drawer = 'engineering'">查看执行依据</button
        ><button @click="exportJSON">导出 JSON</button
        ><button @click="print">打印摘要</button>
      </div>
    </section>
    <footer class="orbit-footer">
      <span>原创交互实验 / 图搜索 · 资源守恒 · 双载体调度</span
      ><span
        >模拟世界，真实约束。<RouterLink to="/"
          >返回 DevLab ↗</RouterLink
        ></span
      >
    </footer>
  </div>
</template>
