<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from "vue";
import { useRoute } from "vue-router";
import {
  ArrowUpRight,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Square,
  Download,
  Upload,
  Check,
  X,
  Layers3,
  Code2,
} from "lucide-vue-next";
import {
  createRuntime,
  defaultGoal,
} from "../../../../packages/intelligence/src/engine";
import {
  replaySnapshot,
  validateRecording,
} from "../../../../packages/intelligence/src/recording";
import type {
  Fault,
  Point,
  Preset,
  Recording,
  RunStatus,
} from "../../../../packages/intelligence/src/types";
import { loadRecording, saveRecording } from "../domain/recording-storage";
const Scene = defineAsyncComponent(
  () => import("../components/IntelligenceScene.vue"),
);
const runtime = createRuntime({ delayMs: 180, timeoutMs: 1200 });
const snapshot = shallowRef(structuredClone(runtime.snapshot));
const goal = reactive(defaultGoal("product"));
const mode = ref<"local-simulation" | "recorded-replay">("local-simulation");
const running = ref(false),
  busy = ref(false),
  twoD = ref(matchMedia("(max-width:740px)").matches),
  reduced = ref(false),
  speed = ref(1),
  fault = ref<Fault>("none");
const route = useRoute();
const notice = ref(""),
  selected = ref(""),
  engineer = ref(route.query.view === "engineering"),
  editWorld = ref<"obstacle" | "target">("obstacle");
const taskCollapsed = ref(false),
  guideStep = ref(route.query.guide === "1" ? 0 : -1);
const guide = [
  {
    title: "01 · 修改目标",
    text: "选择商品研究，改变预算或数量，再生成计划。结构化条件会成为节点的输入。",
  },
  {
    title: "02 · 观察与确认",
    text: "点击单步查看查询、比较与草稿。批准后的下一步才会写入；也可以拒绝。",
  },
  {
    title: "03 · 改变环境",
    text: "切换仓库取送，在地图中添加障碍。机器人重新计算路径；封住所有出口会明确失败。",
  },
  {
    title: "04 · 回放与追问",
    text: "保存运行并载入历史。时间游标只读取快照；工程视图展示实现边界与源码位置。",
  },
];
const replay = shallowRef<Recording>();
const cursor = ref(0);
const fileInput = ref<HTMLInputElement>();
const metrics = ref({
  frames: 0,
  p50: 0,
  p95: 0,
  drawCalls: 0,
  geometries: 0,
  textures: 0,
});
let timer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let media: MediaQueryList | undefined;
const statusLabels: Record<RunStatus, string> = {
  queued: "待规划",
  planning: "规划中",
  running: "执行中",
  "waiting-approval": "等待你确认",
  replanning: "重新规划",
  succeeded: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
};
const selectedNode = computed(
  () =>
    snapshot.value.nodes.find((n) => n.id === selected.value) ||
    snapshot.value.nodes.find((n) => n.status === "running") ||
    snapshot.value.nodes[0],
);
const events = computed(() =>
  mode.value === "recorded-replay"
    ? replay.value?.events.slice(0, cursor.value + 1) || []
    : snapshot.value.runId === runtime.snapshot.runId
      ? runtime.events
      : [],
);
const delivered = computed(
  () => snapshot.value.world.cargo.filter((c) => c.delivered).length,
);
const canStep = computed(() =>
  mode.value === "recorded-replay"
    ? !!replay.value && cursor.value < replay.value.events.length - 1
    : ["running", "replanning", "planning"].includes(snapshot.value.status),
);
const cells = computed(() =>
  Array.from(
    { length: snapshot.value.world.width * snapshot.value.world.height },
    (_, i) => ({
      x: i % snapshot.value.world.width,
      y: Math.floor(i / snapshot.value.world.width),
    }),
  ),
);
function update() {
  snapshot.value = structuredClone(runtime.snapshot);
}
function pause() {
  running.value = false;
  clearTimeout(timer);
  generation++;
}
function selectPreset(preset: Preset) {
  pause();
  runtime.reset();
  fault.value = "none";
  Object.assign(goal, defaultGoal(preset));
  mode.value = "local-simulation";
  runtime.plan({ ...goal });
  update();
  selected.value = "";
}
function plan() {
  pause();
  mode.value = "local-simulation";
  runtime.setFault(fault.value);
  runtime.plan({ ...goal });
  update();
  notice.value = "计划已根据当前目标生成；工具执行前可以逐步检查。";
}
async function single() {
  if (busy.value || !canStep.value) return;
  if (mode.value === "recorded-replay") {
    if (replay.value) {
      cursor.value++;
      snapshot.value = replaySnapshot(replay.value, cursor.value);
    }
    return;
  }
  busy.value = true;
  const runId = runtime.snapshot.runId;
  try {
    const pending = runtime.step();
    update();
    await pending;
  } catch (error) {
    notice.value =
      error instanceof Error ? error.message : "执行未完成，请检查节点。";
  } finally {
    busy.value = false;
    if (mode.value === "local-simulation" && runtime.snapshot.runId === runId)
      update();
  }
}
async function tick(epoch: number) {
  if (!running.value || epoch !== generation || document.hidden) return;
  await single();
  if (!running.value || epoch !== generation) return;
  if (!canStep.value) {
    pause();
    return;
  }
  timer = setTimeout(() => void tick(epoch), Math.max(40, 650 / speed.value));
}
function play() {
  if (running.value) {
    pause();
    return;
  }
  if (!canStep.value) return;
  running.value = true;
  void tick(++generation);
}
function cancel() {
  pause();
  runtime.cancel();
  update();
}
function reset() {
  pause();
  runtime.reset(goal.seed);
  fault.value = "none";
  mode.value = "local-simulation";
  update();
  notice.value = "世界与任务已重置，旧请求不能继续写入当前任务。";
}
function approve(accepted: boolean) {
  runtime.approve(accepted);
  update();
  notice.value = accepted
    ? "已确认；下一步才执行隔离的本地写入。"
    : "已拒绝，本次任务不会写入。";
}
function retry() {
  pause();
  runtime.setFault(fault.value);
  runtime.retry();
  update();
}
function worldCell(point: Point) {
  if (mode.value === "recorded-replay") {
    notice.value = "回放只读。切回本地运行后可干预世界。";
    return;
  }
  if (editWorld.value === "target") runtime.moveTarget(point);
  else runtime.setObstacle(point);
  update();
}
function cellKind(point: Point) {
  const w = snapshot.value.world,
    same = (p: Point) => p.x === point.x && p.y === point.y;
  if (same(w.robot)) return "robot";
  if (same(w.target)) return "target";
  if (w.obstacles.some(same)) return "obstacle";
  if (
    w.cargo.some((c) => !c.delivered && c.id !== w.carrying && same(c.position))
  )
    return "cargo";
  if (w.path.some(same)) return "path";
  return "empty";
}
function cellText(point: Point) {
  return {
    robot: "▣",
    target: "◎",
    obstacle: "",
    cargo: "◇",
    path: "·",
    empty: "",
  }[cellKind(point)];
}
function fallback(message: string) {
  twoD.value = true;
  notice.value = message;
}
async function persist() {
  try {
    const record = runtime.exportRecording();
    if (!record.events.length) throw new Error("先执行一个任务，再保存回放。");
    await saveRecording(record);
    notice.value = `已保存 ${record.events.length} 个事件到当前浏览器 IndexedDB。`;
  } catch {
    notice.value = "保存失败或暂无事件，可导出 JSON 作为替代。";
  }
}
function openReplay(record: unknown) {
  const validated = validateRecording(record);
  pause();
  runtime.cancel();
  replay.value = validated;
  cursor.value = 0;
  mode.value = "recorded-replay";
  snapshot.value = replaySnapshot(validated, 0);
  notice.value = "历史回放模式：只投影已记录快照，不执行工具或写入。";
}
async function restore() {
  try {
    openReplay(await loadRecording());
  } catch {
    notice.value = "没有可用记录，或记录格式不兼容。先完成一次运行并保存。";
  }
}
function seek() {
  if (replay.value) {
    pause();
    snapshot.value = replaySnapshot(replay.value, cursor.value);
  }
}
function exportJson() {
  const record =
    mode.value === "recorded-replay" ? replay.value : runtime.exportRecording();
  if (!record) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "chenxi-lab-recording.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importJson(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 8_000_000) throw new Error("too large");
    openReplay(JSON.parse(await file.text()));
  } catch {
    notice.value = "导入失败：请选择小于 8 MB、来自本实验室的有效事件记录。";
  }
  input.value = "";
}
function motion() {
  reduced.value = media?.matches || false;
}
function visibility() {
  if (document.hidden) pause();
}
onMounted(() => {
  if (route.query.preset === "product" || route.query.preset === "activity")
    selectPreset(route.query.preset);
  media = matchMedia("(prefers-reduced-motion: reduce)");
  motion();
  taskCollapsed.value = matchMedia("(max-width:740px)").matches;
  media.addEventListener("change", motion);
  document.addEventListener("visibilitychange", visibility);
});
onBeforeUnmount(() => {
  pause();
  runtime.cancel();
  media?.removeEventListener("change", motion);
  document.removeEventListener("visibilitychange", visibility);
});
</script>
<template>
  <div class="intelligence-lab">
    <section class="il-heading">
      <div>
        <p class="il-eyebrow">
          <span></span> CHENXI INTELLIGENCE LAB / 实用任务库
        </p>
        <h1>让智能，<em>在行动中演化。</em></h1>
        <p class="il-intro">
          从一个目标出发，观察规划、工具与环境如何互相改变。<br />这里的每一步，都有状态、有边界，也有可追溯的证据。
        </p>
      </div>
      <RouterLink class="il-source" to="/intelligence">返回星域智航 ↗</RouterLink>
      <a
        class="il-source"
        href="https://github.com/Callmecx/chenxi-devlab-2026"
        target="_blank"
        rel="noopener noreferrer"
        >开放工程档案 <ArrowUpRight :size="17"
      /></a>
    </section>
    <div class="il-mode-bar">
      <span class="il-mode">{{
        mode === "local-simulation"
          ? "LOCAL SIMULATION / 本地算法仿真"
          : "RECORDED REPLAY / 历史回放"
      }}</span
      ><span>模型执行：未配置 · AGI 仅为愿景</span
      ><button @click="engineer = !engineer">
        <Code2 :size="15" /> {{ engineer ? "收起工程视图" : "工程视图" }}
      </button>
    </div>
    <div class="il-guide">
      <button @click="guideStep = guideStep < 0 ? 0 : -1">
        {{ guideStep < 0 ? "60 秒可控导览" : "关闭导览" }}</button
      ><template v-if="guideStep >= 0"
        ><div>
          <strong>{{ guide[guideStep]?.title }}</strong>
          <p>{{ guide[guideStep]?.text }}</p>
        </div>
        <button :disabled="guideStep === 0" @click="guideStep--">上一步</button
        ><button v-if="guideStep < 3" @click="guideStep++">下一步</button
        ><button v-else @click="guideStep = -1">开始体验</button></template
      >
    </div>
    <p v-if="twoD" class="il-small">
      轻量二维保留完整任务操作，也可随时启用 3D。
    </p>
    <section class="il-console" aria-label="智能演化实验室操作台">
      <aside class="il-task" :class="{ 'task-collapsed': taskCollapsed }">
        <button
          class="il-task-toggle"
          :aria-expanded="!taskCollapsed"
          @click="taskCollapsed = !taskCollapsed"
        >
          {{ taskCollapsed ? "展开任务配置" : "收起任务配置" }}
        </button>
        <p class="il-eyebrow">01 / DEFINE INTENT</p>
        <h2>你想完成什么？</h2>
        <div class="il-presets" aria-label="任务类型">
          <button
            v-for="p in [
              ['product', '商品研究'],
              ['activity', '活动助理'],
              ['warehouse', '仓库取送'],
            ] as const"
            :key="p[0]"
            :class="{ active: goal.preset === p[0] }"
            @click="selectPreset(p[0])"
          >
            {{ p[1] }}
          </button>
        </div>
        <label class="il-field"
          >任务目标<textarea
            v-model="goal.prompt"
            rows="4"
            maxlength="500"
            :disabled="busy"
          />
        </label>
        <div class="il-pair">
          <label class="il-field"
            >预算（元）<input
              :value="goal.budgetCents / 100"
              type="number"
              min="0"
              max="100000"
              step="1"
              @input="
                goal.budgetCents = Math.round(
                  Number(($event.target as HTMLInputElement).value) * 100,
                )
              " /></label
          ><label class="il-field"
            >{{ goal.preset === "activity" ? "人数" : "数量"
            }}<input
              v-model.number="goal.quantity"
              type="number"
              min="1"
              max="20"
          /></label>
        </div>
        <label v-if="goal.preset === 'product'" class="il-field"
          >品类<select v-model="goal.category">
            <option value="all">全部模拟商品</option>
            <option value="工作">工作</option>
            <option value="通勤">通勤</option>
            <option value="生活">生活</option>
          </select></label
        >
        <label v-if="goal.preset === 'activity'" class="il-field"
          >场次筛选<input
            v-model="goal.slotId"
            placeholder="all = 全部模拟场次"
        /></label>
        <label v-if="goal.preset === 'warehouse'" class="il-field"
          >世界种子<input
            v-model.number="goal.seed"
            type="number"
            min="0"
            max="2147483647"
            step="1"
        /></label>
        <button class="il-primary" :disabled="busy" @click="plan">
          生成计划 <ArrowUpRight :size="17" />
        </button>
        <p class="il-small">
          确定性规则工作流，使用隔离的模拟数据。自然语言不受支持的约束会在规划中说明。
        </p>
        <details class="il-fault">
          <summary>验证异常与恢复</summary>
          <label class="il-field"
            >下一工具注入<select
              v-model="fault"
              @change="runtime.setFault(fault)"
            >
              <option value="none">无故障</option>
              <option value="timeout">工具超时</option>
              <option value="partial">不完整结果</option>
              <option value="failure">工具失败</option>
            </select></label
          >
          <p class="il-small">
            失败后解除故障，再点击重试。取消或重置会使旧响应失效。
          </p>
        </details>
      </aside>
      <div class="il-stage-column">
        <div class="il-stage" :data-status="snapshot.status">
          <div class="il-stage-heading">
            <span
              >02 /
              {{
                snapshot.goal.preset === "warehouse"
                  ? "EMBODIED WORLD"
                  : "TASK CONSTELLATION"
              }}</span
            ><button :aria-pressed="twoD" @click="twoD = !twoD">
              <Layers3 :size="14" />{{ twoD ? "启用 3D" : "二维视图" }}
            </button>
          </div>
          <Scene
            v-if="!twoD"
            :snapshot="snapshot"
            :reduced="reduced"
            @cell="worldCell"
            @fallback="fallback"
            @metrics="metrics = $event"
          />
          <div
            v-else-if="snapshot.goal.preset === 'warehouse'"
            class="il-grid-wrap"
          >
            <div
              class="il-world-grid"
              :style="{
                gridTemplateColumns: `repeat(${snapshot.world.width},1fr)`,
              }"
              aria-label="二维仓库，点击格子切换障碍"
            >
              <button
                v-for="c in cells"
                :key="`${c.x},${c.y}`"
                :class="`cell-${cellKind(c)}`"
                :aria-label="`坐标 ${c.x},${c.y} ${cellKind(c)}`"
                @click="worldCell(c)"
              >
                {{ cellText(c) }}
              </button>
            </div>
          </div>
          <div v-else class="il-flat-graph">
            <div class="il-core">CX<span>INTENT → ACTION</span></div>
            <div class="il-flat-nodes">
              <button
                v-for="(n, i) in snapshot.nodes"
                :key="n.id"
                :data-node-status="n.status"
                @click="selected = n.id"
              >
                <small>0{{ i + 1 }}</small
                >{{ n.title }}<span>{{ n.status }}</span>
              </button>
              <p v-if="!snapshot.nodes.length">
                输入目标，生成第一张任务星图。
              </p>
            </div>
          </div>
          <div class="il-stage-bottom">
            <span><i></i>{{ statusLabels[snapshot.status] }}</span
            ><span v-if="snapshot.goal.preset === 'warehouse'"
              >WORLD v{{ snapshot.world.worldVersion }} · {{ delivered }} /
              {{ snapshot.world.cargo.length }} 送达</span
            ><span v-else
              >{{
                snapshot.nodes.filter((n) => n.status === "succeeded").length
              }}
              / {{ snapshot.nodes.length }} 节点完成</span
            >
          </div>
        </div>
        <div class="il-controls">
          <button
            class="il-play"
            :disabled="!canStep || busy"
            :aria-label="running ? '暂停执行' : '连续执行'"
            @click="play"
          >
            <Pause v-if="running" :size="16" /><Play v-else :size="16" />{{
              running ? "暂停" : "运行"
            }}</button
          ><button :disabled="!canStep || busy || running" @click="single">
            <SkipForward :size="16" />单步</button
          ><button
            :disabled="
              mode === 'recorded-replay' ||
              ['succeeded', 'cancelled', 'queued'].includes(snapshot.status)
            "
            @click="cancel"
          >
            <Square :size="14" />取消</button
          ><button @click="reset"><RotateCcw :size="15" />重置</button
          ><label
            >速度<select v-model.number="speed">
              <option :value="0.5">0.5×</option>
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="4">4×</option>
            </select></label
          >
        </div>
        <p class="il-message" aria-live="polite">{{ snapshot.message }}</p>
        <div
          v-if="
            snapshot.status === 'waiting-approval' &&
            mode === 'local-simulation'
          "
          class="il-approval"
        >
          <div>
            <strong>这个动作需要你的确认</strong>
            <p>请先检查节点参数与结果。本地写入仅发生在明确批准后的下一步。</p>
          </div>
          <button @click="approve(true)"><Check :size="16" />批准</button
          ><button @click="approve(false)"><X :size="16" />拒绝</button>
        </div>
        <div
          v-if="snapshot.status === 'failed' && mode === 'local-simulation'"
          class="il-recovery"
        >
          <p>保留失败节点与证据。可调整世界或解除故障后继续。</p>
          <button @click="retry">重试失败步骤</button
          ><button @click="plan">按当前目标重新规划</button>
        </div>
        <div v-if="snapshot.goal.preset === 'warehouse'" class="il-world-tools">
          <label
            >点击地图<select v-model="editWorld">
              <option value="obstacle">添加 / 移除障碍</option>
              <option value="target">移动交付点</option>
            </select></label
          ><span
            >移动 {{ snapshot.world.moves }} · 重规划
            {{ snapshot.world.replans }} · 携带
            {{ snapshot.world.carrying || "无" }}</span
          >
          <div class="il-cargo-list">
            <div v-for="cargo in snapshot.world.cargo" :key="cargo.id">
              <span
                >{{ cargo.label }} ·
                {{
                  cargo.delivered
                    ? "已送达"
                    : cargo.id === snapshot.world.carrying
                      ? "运输中"
                      : "待取件"
                }}</span
              ><button
                :disabled="mode === 'recorded-replay' || cargo.delivered"
                @click="
                  runtime.setPriority(cargo.id, cargo.priority + 1);
                  update();
                "
              >
                优先处理</button
              ><button
                :disabled="mode === 'recorded-replay' || cargo.delivered"
                @click="
                  runtime.removeCargo(cargo.id);
                  update();
                "
              >
                移除货物
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    <div v-if="notice" class="il-notice" role="status">{{ notice }}</div>
    <section class="il-inspector">
      <div class="il-node-list">
        <p class="il-eyebrow">03 / TRACE EVERY DECISION</p>
        <h2>每一步，都能打开看。</h2>
        <button
          v-for="(node, i) in snapshot.nodes"
          :key="node.id"
          :class="{ selected: selectedNode?.id === node.id }"
          :data-node-status="node.status"
          @click="selected = node.id"
        >
          <span>0{{ i + 1 }}</span
          ><b
            >{{ node.title }}<small>{{ node.tool }}</small></b
          ><span>{{
            node.status === "succeeded"
              ? "✓"
              : node.status === "failed"
                ? "!"
                : node.status === "running"
                  ? "↗"
                  : "○"
          }}</span>
        </button>
        <p v-if="!snapshot.nodes.length" class="il-muted">
          还没有执行节点。先在上方创建计划。
        </p>
      </div>
      <div class="il-node-detail">
        <template v-if="selectedNode"
          ><div class="il-detail-title">
            <h3>{{ selectedNode.title }}</h3>
            <span>{{ selectedNode.status }}</span>
          </div>
          <dl>
            <div>
              <dt>耗时</dt>
              <dd>
                {{
                  selectedNode.durationMs === null
                    ? "尚未执行"
                    : `${selectedNode.durationMs.toFixed(1)} ms`
                }}
              </dd>
            </div>
            <div>
              <dt>尝试</dt>
              <dd>{{ selectedNode.attempts }}</dd>
            </div>
            <div>
              <dt>已写入</dt>
              <dd>{{ snapshot.writes }} 次（隔离本地状态）</dd>
            </div>
          </dl>
          <div class="il-json-pair">
            <div>
              <h4>输入参数</h4>
              <pre>{{ JSON.stringify(selectedNode.input, null, 2) }}</pre>
            </div>
            <div>
              <h4>实际结果</h4>
              <pre>{{
                JSON.stringify(selectedNode.output, null, 2) ?? "等待执行"
              }}</pre>
            </div>
          </div>
          <p class="il-small">
            数据来源：{{ selectedNode.sources.join(" · ") || "执行后记录来源" }}
          </p></template
        >
        <p v-else class="il-muted">
          节点参数、执行结果、来源与耗时将在这里同步呈现。
        </p>
        <ul v-if="snapshot.clarification.length" class="il-clarification">
          <li v-for="c in snapshot.clarification" :key="c">{{ c }}</li>
        </ul>
      </div>
    </section>
    <section class="il-replay">
      <div>
        <p class="il-eyebrow">04 / REPLAY & UNDERSTAND</p>
        <h2>回到那个决策发生的瞬间。</h2>
        <p>
          保存输入、种子、事件与世界快照。拖动时间线只回放历史，绝不重新调用工具。
        </p>
      </div>
      <div class="il-record-actions">
        <button :disabled="mode === 'recorded-replay'" @click="persist">
          保存本次运行</button
        ><button @click="restore">载入上次记录</button
        ><button @click="exportJson"><Download :size="15" />导出 JSON</button
        ><button @click="fileInput?.click()">
          <Upload :size="15" />导入记录</button
        ><input
          ref="fileInput"
          hidden
          type="file"
          accept="application/json,.json"
          @change="importJson"
        />
      </div>
      <div v-if="mode === 'recorded-replay' && replay" class="il-seek">
        <label
          >事件 {{ cursor + 1 }} / {{ replay.events.length
          }}<input
            v-model.number="cursor"
            type="range"
            min="0"
            :max="replay.events.length - 1"
            @input="seek"
        /></label>
        <p>
          {{ replay.source }} · {{ replay.createdAt }} · v{{ replay.version }}
        </p>
      </div>
      <ol class="il-timeline">
        <li v-for="event in events.slice(-8)" :key="event.eventId">
          <span>{{ String(event.seq).padStart(3, "0") }}</span
          ><b>{{ event.type }}</b
          ><small>WORLD v{{ event.worldVersion }}</small
          ><time>{{ event.timestamp.slice(11, 23) }}</time>
        </li>
      </ol>
    </section>
    <section v-if="engineer" class="il-engineer">
      <p class="il-eyebrow">ENGINEERING / INSPECT THE MECHANISM</p>
      <h2>图形只是投影，运行状态才是依据。</h2>
      <div class="il-engineer-grid">
        <article>
          <h3>清晰的职责边界</h3>
          <p>
            纯 TypeScript 运行引擎管理状态、工具审批与 A* 路径；Vue
            负责控制台；Three.js 只根据快照渲染。修改图形不会完成任务。
          </p>
          <p>
            <a
              href="https://github.com/Callmecx/chenxi-devlab-2026/blob/main/packages/intelligence/src/engine.ts#L50"
              target="_blank"
              rel="noreferrer"
              >运行引擎 · createRuntime</a
            >
          </p>
          <p>
            <a
              href="https://github.com/Callmecx/chenxi-devlab-2026/blob/main/packages/intelligence/src/pathfinding.ts#L99"
              target="_blank"
              rel="noreferrer"
              >A* 路径搜索 · findPath</a
            >
          </p>
          <p>
            <a
              href="https://github.com/Callmecx/chenxi-devlab-2026/blob/main/apps/portfolio/src/components/IntelligenceScene.vue"
              target="_blank"
              rel="noreferrer"
              >Three.js 状态投影与资源释放</a
            >
          </p>
        </article>
        <article>
          <h3>当前渲染测量</h3>
          <p v-if="metrics.frames">
            采样 {{ metrics.frames }} 帧，帧间隔 p50
            {{ metrics.p50.toFixed(1) }} ms / p95
            {{ metrics.p95.toFixed(1) }} ms；draw calls
            {{ metrics.drawCalls }}，geometry {{ metrics.geometries }}，texture
            {{ metrics.textures }}。
          </p>
          <p v-else>尚无动态帧样本。二维或减弱动效模式按状态变化重绘。</p>
          <p>
            本设备、本次会话结果；不是生产设备承诺。DPR ≤ 1.5，绘制像素 ≤ 160
            万，后台暂停，卸载释放资源。
          </p>
          <label
            ><input
              v-model="reduced"
              type="checkbox"
            />减弱动效（保留完整操作）</label
          >
        </article>
        <article>
          <h3>能力与边界</h3>
          <p>
            当前为本地确定性工具链与离散仓库仿真。感知来自模拟器状态读取；未训练视觉模型，未连接实体机器人，未执行真实付款与预约。
          </p>
          <p>真实模型执行未配置。AGI 是研究愿景，不是本演示的完成声明。</p>
          <p>
            <a
              href="https://github.com/Callmecx/chenxi-devlab-2026/blob/main/docs/intelligence-lab/EVALUATION_REPORT.md"
              target="_blank"
              rel="noreferrer"
              >实际评测与测试证据</a
            >
            ·
            <a
              href="https://github.com/Callmecx/chenxi-devlab-2026/blob/main/tests/e2e/intelligence.spec.ts"
              target="_blank"
              rel="noreferrer"
              >浏览器验收脚本</a
            >
          </p>
        </article>
      </div>
    </section>
    <div class="il-future">
      <span>BEYOND THE NEXT STEP / 概念愿景</span>
      <h2>目标 → 规划 → 行动 → 反馈 → 演化</h2>
      <p>通用智能的想象，始于可检查、可纠错的具体行动。</p>
    </div>
  </div>
</template>
<style src="../intelligence.css"></style>
