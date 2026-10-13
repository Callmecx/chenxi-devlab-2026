<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
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
  Settings2,
  Volume2,
  VolumeX,
  ChevronRight,
  Download,
  ScanLine,
} from "lucide-vue-next";
import {
  createDominionRuntime,
  validateDominionRecording,
  sourceKey,
  MAX_RECORDING_BYTES,
} from "../../../../packages/intelligence/src/dominion";
import {
  RESOURCE_LABELS,
  canRepairLane,
  RESOURCES,
  SCENARIOS,
  STRATEGIES,
} from "../../../../packages/intelligence/src/dominion/fixtures";
import type {
  CameraMode,
  Command,
  DominionComparison,
  DominionRecording,
  Mission,
  MissionKind,
  Quality,
  Resource,
  Scenario,
  SceneMetrics,
  Selection,
  Strategy,
  ValidatedRecording,
  WorkspaceView,
} from "../../../../packages/intelligence/src/dominion/types";
import {
  createPlannerAdapter,
  type ApprovedProposal,
} from "../../../../packages/intelligence/src/dominion/model-adapter";
import DominionMap from "../components/dominion/DominionMap.vue";
import DominionBranchMap from "../components/dominion/DominionBranchMap.vue";
import "../dominion.css";

type SceneModule = typeof import("../components/dominion/DominionScene.vue");
let failedSceneModule: URL | undefined;
let sceneRetryCount = 0;
function controlledSceneUrl(error: unknown): URL | undefined {
  const base = new URL(import.meta.env.BASE_URL, location.origin);
  const message = error instanceof Error ? error.message : "";
  const candidates = [
    ...(message.match(/https?:\/\/[^\s"'<>]+/g) ?? []),
    ...Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'),
      (link) => link.href,
    ),
  ];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate.replace(/[),.;]+$/, ""), location.href);
      if (url.origin !== location.origin || url.username || url.password)
        continue;
      const assetPrefix = `${base.pathname}assets/`;
      const built =
        url.pathname.startsWith(assetPrefix) &&
        /^DominionScene-[\w-]+\.js$/.test(
          url.pathname.slice(assetPrefix.length),
        );
      const dev =
        import.meta.env.DEV &&
        url.pathname ===
          `${base.pathname}src/components/dominion/DominionScene.vue`;
      if (!built && !dev) continue;
      url.search = "";
      url.hash = "";
      return url;
    } catch {
      /* Only the known, same-origin scene module may be retried. */
    }
  }
  return undefined;
}
async function loadScene(): Promise<SceneModule> {
  try {
    if (failedSceneModule && sceneRetryCount) {
      // A fresh module-map key retries a failed fetch without replacing the runtime.
      // This URL is restricted to the built scene chunk (or its exact Vite dev path).
      const retryUrl = new URL(failedSceneModule.href);
      retryUrl.searchParams.set("dominion-retry", String(sceneRetryCount));
      return (await import(/* @vite-ignore */ retryUrl.href)) as SceneModule;
    }
    return await import("../components/dominion/DominionScene.vue");
  } catch (error) {
    failedSceneModule = controlledSceneUrl(error) ?? failedSceneModule;
    throw error;
  }
}
const DominionScene = defineAsyncComponent({
  loader: loadScene,
  onError: (_error, retry) => {
    sceneRetryCount++;
    retrySceneLoad = retry;
    flat.value = true;
    notice.value = "三维资源加载失败。已切换可操作星图，世界状态保留。";
  },
});
const seed = ref(4217);
const scenario = ref<Scenario>("expedition");
let runtime = createDominionRuntime({
  scenario: scenario.value,
  seed: seed.value,
});
const snapshot = shallowRef(runtime.snapshot);
const events = shallowRef(runtime.events);
let planner = createPlannerAdapter({ runtime });
const plannerGoal = ref("向霜环前哨补给，先检查资源再提交草案。");
const proposal = shallowRef<ApprovedProposal | null>(null);
const planning = ref(false);
const plannerFeedback = ref("");
let planningEpoch = 0;
const guide = ref<
  | "idle"
  | "intro"
  | "scan"
  | "closure"
  | "repair"
  | "comparison"
  | "comparison-hold"
  | "delivery"
  | "completed"
  | "taken-over"
  | "stopped"
>("idle");
const guideSeconds = ref(0);
const guideActive = computed(() =>
  [
    "intro",
    "scan",
    "closure",
    "repair",
    "comparison",
    "comparison-hold",
    "delivery",
  ].includes(guide.value),
);
let guideStarted = 0;
let guideHoldUntil = 0;
let guideSession = "";
let guideIntroCamera = false;
let guideScanCamera = false;
let guideDockCamera = false;
let guideFlat = false;
const guideText = computed(
  () =>
    ({
      idle: ["远征导览", "约100秒，观察一项真实的勘测、维修、运输接力。"],
      intro: [
        "从指挥桥出发",
        "同一个世界，六艘有不同职责的舰。镜头不会推进任务。",
      ],
      scan: [
        "先发现，再行动",
        "勘测舰驶向受损中继；维修和运输仍等待前置条件。",
      ],
      closure: [
        "航道许可已关闭",
        "已关闭物资仓至中继的直达航道。维修无法覆盖用户许可，后续航行必须重新规划。",
      ],
      repair: [
        "维修舰接力",
        "维修件先从库存转为载荷；实际维修完成后，运输任务才有资格开始。",
      ],
      comparison: [
        "同一暂停点，两种策略",
        "Worker从当前快照实算分支。原世界保持暂停，预测不会写成交付。",
      ],
      "comparison-hold": [
        "比较已返回",
        "看清两条真实分支的时间、耗能和约束。导览保留原策略继续，不导入预测终点。",
      ],
      delivery: [
        "最后一段，实际交付",
        "运输舰装载、航行、卸货。只有账本已确认交付，任务才会完成。",
      ],
      completed: [
        "接力任务已完成",
        "勘测、维修和交付均来自实际事件。可以回放记录，或自由继续探索。",
      ],
      "taken-over": [
        "控制权交给你",
        "导览命令已停止，世界安全暂停。你的操作将从当前状态继续。",
      ],
      stopped: [
        "导览已停止",
        "保留当前世界与事件。可检查原因、手动继续或重新开始。",
      ],
    })[guide.value],
);
const workspace = ref<WorkspaceView>("command");
const experienceExpanded = ref(true);
const selected = ref<Selection | null>(null);
const selectedMission = ref(snapshot.value.missions[0]?.id ?? "");
const camera = ref<CameraMode>("overview");
const cameraRequest = ref(0);
const resourceLayer = ref(false);
const laneLayer = ref(true);
const observingLayers = computed(
  () => camera.value === "planet" || workspace.value === "map",
);
const showResources = computed(
  () => observingLayers.value && resourceLayer.value,
);
const showLanes = computed(() => !observingLayers.value || laneLayer.value);
const initialReducedMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const flat = ref(initialReducedMotion);
const quality = ref<Quality>("balanced");
const reduced = ref(initialReducedMotion);
const sound = ref(false);
const speed = ref(1);
const notice = ref("");
const drawer = ref<"objects" | "settings" | "comparison" | "library" | null>(
  null,
);
const replay = shallowRef<ValidatedRecording | null>(null);
const history = ref(false);
const replayIndex = ref(0);
const replayPlaying = ref(false);
const comparison = shallowRef<DominionComparison | null>(null);
const comparing = ref(false);
const strategyA = ref<Strategy>("time");
const strategyB = ref<Strategy>("energy");
const metrics = shallowRef<SceneMetrics | null>(null);
const newKind = ref<MissionKind>("supply");
const newQuantity = ref(2);
const newDeadline = ref(180);
const target = ref("ice");
const eventPage = ref(0);
const toolId = ref("");
let worker: Worker | undefined;
let workerTimer: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let generation = 0;
let importEpoch = 0;
let elapsed = 0;
let slowWindows = 0;
let audio: AudioContext | undefined;
let motionQuery: MediaQueryList | undefined;
type FocusableElement = Element & { focus: () => void };
let previousFocus: FocusableElement | null = null;
function canFocus(element: Element | null): element is FocusableElement {
  return !!element && "focus" in element && typeof element.focus === "function";
}
let retrySceneLoad: (() => void) | undefined;
const sourceRoot = "https://github.com/Callmecx/chenxi-devlab-2026/tree/main/";
const evidenceLinks = [
  { file: "TEST_REPORT.md", label: "V4 测试报告" },
  { file: "PERFORMANCE.md", label: "V4 性能实测" },
  { file: "DEMO_GUIDE.md", label: "V4 演示路线" },
].map((item) => ({
  ...item,
  href: `${import.meta.env.BASE_URL}evidence/intelligence-lab-v4/${item.file}`,
}));
const strategyLabels: Record<Strategy, string> = {
  time: "时效优先",
  energy: "能耗优先",
  robust: "稳健优先",
  balanced: "平衡策略",
};
const scenarioLabels: Record<Scenario, string> = {
  supply: "深空补给 · 初次体验",
  expedition: "远征接力 · 勘测与维修",
  "four-missions": "四任务协同",
  competition: "资源争用",
  sealed: "全航道封闭",
  "low-energy": "能量不足",
};
const roleLabels = { transport: "运输", survey: "勘测", repair: "维修" };
const missionLabels: Record<MissionKind, string> = {
  supply: "常规补给",
  relay: "勘测维修接力",
  rescue: "紧急救援",
  science: "科研采样",
};
const missionStatus = {
  queued: "等待调度",
  running: "执行中",
  waiting: "等待资源",
  failed: "受阻",
  completed: "已完成",
  cancelled: "已取消",
};
const shipStatus = {
  idle: "待命",
  moving: "航行",
  loading: "装载",
  delivering: "交付",
  scanning: "扫描",
  repairing: "维修",
  waiting: "等待",
  disabled: "需救援",
};
const stepStatus = {
  blocked: "等待前置",
  queued: "待分配",
  assigned: "执行中",
  completed: "完成",
};
const cameras: { id: CameraMode; label: string; description: string }[] = [
  { id: "overview", label: "全域", description: "看清港口、航道与远征目的地" },
  { id: "follow", label: "跟随", description: "跟踪所选舰船的实际任务" },
  { id: "cockpit", label: "指挥桥", description: "从实体舷窗观察同一个世界" },
  { id: "docking", label: "靠港", description: "查看泊位、装载与作业状态" },
  { id: "planet", label: "天体", description: "观察所选对象所在区域" },
  { id: "scan", label: "扫描", description: "观察勘测任务与有来源的发现" },
];
const views: { id: WorkspaceView; label: string; number: string }[] = [
  { id: "command", label: "指挥中枢", number: "01" },
  { id: "map", label: "全息星图", number: "02" },
  { id: "fleet", label: "舰队协同", number: "03" },
  { id: "missions", label: "任务编排", number: "04" },
  { id: "experience", label: "体验舱", number: "05" },
  { id: "engineering", label: "工程档案", number: "06" },
];
const readonly = computed(() => history.value);
const canCommand = computed(
  () =>
    !readonly.value &&
    snapshot.value.connected &&
    snapshot.value.status !== "closed",
);
const mission = computed(
  () =>
    snapshot.value.missions.find((m) => m.id === selectedMission.value) ??
    snapshot.value.missions[0],
);
const complete = computed(
  () => snapshot.value.missions.filter((m) => m.status === "completed").length,
);
const active = computed(
  () =>
    snapshot.value.missions.filter(
      (m) => !["completed", "cancelled", "failed"].includes(m.status),
    ).length,
);
const failures = computed(() =>
  snapshot.value.missions.filter((m) => m.status === "failed"),
);
const ship = computed(() =>
  selected.value?.kind === "ship"
    ? snapshot.value.ships.find((s) => s.id === selected.value?.id)
    : undefined,
);
const station = computed(() =>
  selected.value?.kind === "station"
    ? snapshot.value.stations.find((s) => s.id === selected.value?.id)
    : undefined,
);
const lane = computed(() =>
  selected.value?.kind === "lane"
    ? snapshot.value.lanes.find((s) => s.id === selected.value?.id)
    : undefined,
);
// The same predicates as runtime.enter()/occupied(): a transit commits exactly
// its current lane and its next safe berth. Future route IDs are intent only.
const stationDocked = computed(() =>
  station.value
    ? snapshot.value.ships.filter(
        (s) => !s.transit && s.nodeId === station.value!.id,
      )
    : [],
);
const stationInbound = computed(() =>
  station.value
    ? snapshot.value.ships.filter((s) => s.transit?.to === station.value!.id)
    : [],
);
const stationReserved = computed(() =>
  station.value
    ? snapshot.value.ships.filter(
        (s) =>
          s.sourceId === station.value!.id &&
          RESOURCES.some((r) => s.reserved[r] > 0),
      )
    : [],
);
const stationFree = computed(() =>
  station.value
    ? Math.max(
        0,
        station.value.dockCapacity -
          station.value.blockedBerths -
          stationDocked.value.length -
          stationInbound.value.length,
      )
    : 0,
);
function routeVisits(ship: (typeof snapshot.value.ships)[number], id: string) {
  let cursor = ship.transit?.to || ship.nodeId;
  for (const laneId of ship.route) {
    const segment = snapshot.value.lanes.find((item) => item.id === laneId);
    if (!segment) return false;
    const next =
      segment.from === cursor
        ? segment.to
        : segment.to === cursor
          ? segment.from
          : null;
    if (!next) return false;
    if (next === id) return true;
    cursor = next;
  }
  return false;
}
const stationPlanned = computed(() =>
  station.value
    ? snapshot.value.ships.filter(
        (s) =>
          !stationDocked.value.includes(s) &&
          !stationInbound.value.includes(s) &&
          routeVisits(s, station.value!.id),
      )
    : [],
);
const laneTransit = computed(() =>
  lane.value
    ? snapshot.value.ships.filter((s) => s.transit?.laneId === lane.value!.id)
    : [],
);
const lanePlanned = computed(() =>
  lane.value
    ? snapshot.value.ships.filter(
        (s) =>
          s.route.includes(lane.value!.id) &&
          s.transit?.laneId !== lane.value!.id,
      )
    : [],
);
const laneFree = computed(() =>
  lane.value ? Math.max(0, lane.value.capacity - laneTransit.value.length) : 0,
);
const relatedMissions = computed(() => {
  const participants = station.value
    ? [
        ...stationDocked.value,
        ...stationInbound.value,
        ...stationReserved.value,
        ...stationPlanned.value,
      ]
    : [...laneTransit.value, ...lanePlanned.value];
  return snapshot.value.missions.filter(
    (m) =>
      participants.some((s) => s.missionId === m.id) ||
      (!!station.value &&
        m.steps.some((step) => {
          const target =
            step.kind === "rescue"
              ? snapshot.value.ships.find((s) => s.id === step.targetId)?.nodeId
              : step.targetId;
          return (
            step.sourceId === station.value!.id || target === station.value!.id
          );
        })),
  );
});
function missionForShip(id: string | null) {
  return (
    snapshot.value.missions.find((m) => m.id === id)?.label || "未分配任务"
  );
}
const visibleEvents = computed(() =>
  readonly.value && replay.value
    ? replay.value.recording.events.slice(
        0,
        replay.value.frames[replayIndex.value]?.eventCount ?? 0,
      )
    : events.value,
);
const eventPages = computed(() =>
  Math.max(1, Math.ceil(visibleEvents.value.length / 15)),
);
const pageEvents = computed(() =>
  [...visibleEvents.value]
    .reverse()
    .slice(eventPage.value * 15, eventPage.value * 15 + 15),
);
const tool = computed(
  () =>
    snapshot.value.tools.find((t) => t.id === toolId.value) ??
    snapshot.value.tools.at(-1),
);
const canAdopt = computed(
  () =>
    canCommand.value &&
    snapshot.value.status === "paused" &&
    comparison.value?.sourceKey === sourceKey(snapshot.value),
);
const entityTitle = computed(
  () =>
    ship.value?.label ??
    station.value?.label ??
    (lane.value
      ? `${stationName(lane.value.from)} → ${stationName(lane.value.to)}`
      : "世界对象"),
);
const sessionLabel = computed(() =>
  readonly.value
    ? "历史记录 · 只读"
    : !snapshot.value.connected
      ? "观测链路已断开"
      : {
          ready: "等待远征",
          running: "世界运行中",
          paused: "世界已暂停",
          closed: "会话已关闭",
        }[snapshot.value.status],
);
function stationName(id: string) {
  return (
    snapshot.value.stations.find((s) => s.id === id)?.label ??
    snapshot.value.ships.find((s) => s.id === id)?.label ??
    id
  );
}
function amount(values: Record<Resource, number>) {
  return (
    RESOURCES.filter((k) => values[k] > 0)
      .map((k) => `${values[k]} ${RESOURCE_LABELS[k]}`)
      .join(" · ") || "无"
  );
}
function progress(m: Mission) {
  return `${m.steps.filter((s) => s.status === "completed").length} / ${m.steps.length}`;
}
function located(resource: Resource) {
  return (
    snapshot.value.stations.reduce((sum, s) => sum + s.stock[resource], 0) +
    snapshot.value.ships.reduce(
      (sum, s) =>
        sum + s.cargo[resource] + (resource === "energy" ? s.energy : 0),
      0,
    )
  );
}
function sync() {
  snapshot.value = runtime.snapshot;
  events.value = runtime.events;
}
function stopComparison() {
  generation++;
  worker?.terminate();
  worker = undefined;
  clearTimeout(workerTimer);
  comparing.value = false;
}
function tone() {
  if (!sound.value) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.frequency.value = 540;
    gain.gain.setValueAtTime(0.018, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.1);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.11);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    sound.value = false;
  }
}
function send(command: Command, automatic = false) {
  if (readonly.value) return;
  if (!automatic) {
    importEpoch++;
    stopComparison();
    elapsed = 0;
  }
  try {
    const result = runtime.dispatch(command, crypto.randomUUID());
    sync();
    if (!automatic || !result.accepted) notice.value = result.message;
    if (result.accepted && !automatic) tone();
    return result;
  } catch (error) {
    notice.value =
      error instanceof Error ? error.message : "命令未提交，世界保留当前状态。";
    return undefined;
  }
}
function primary() {
  if (guideActive.value) {
    // Preserve the action the user pressed before takeover changes runtime status.
    const intended =
      snapshot.value.status === "ready"
        ? "start"
        : snapshot.value.status === "running"
          ? "pause"
          : "resume";
    stopGuide();
    if (intended !== "pause") send({ type: intended });
    return;
  }
  if (
    active.value === 0 &&
    !failures.value.length &&
    snapshot.value.status === "paused"
  ) {
    beginReplay();
    return;
  }
  send({
    type:
      snapshot.value.status === "ready"
        ? "start"
        : snapshot.value.status === "running"
          ? "pause"
          : "resume",
  });
}
function retryMission(missionId: string) {
  const result = send({ type: "retry-mission", missionId });
  if (result?.accepted && snapshot.value.status === "paused")
    send({ type: "resume" });
}
function choose(value: Selection) {
  selected.value = value;
  openDrawer("objects");
}
function setCamera(value: CameraMode) {
  if (workspace.value === "experience") experienceExpanded.value = false;
  camera.value = value;
  cameraRequest.value++;
  flat.value = false;
  retrySceneLoad?.();
  retrySceneLoad = undefined;
  if (["follow", "scan"].includes(value) && selected.value?.kind !== "ship") {
    const candidate =
      snapshot.value.ships.find((s) =>
        value === "scan" ? s.role === "survey" : s.missionId,
      ) ?? snapshot.value.ships[0];
    if (candidate) selected.value = { kind: "ship", id: candidate.id };
  }
}
function toggleFlat() {
  if (flat.value) {
    retrySceneLoad?.();
    retrySceneLoad = undefined;
  }
  flat.value = !flat.value;
}
function changeView(value: WorkspaceView) {
  workspace.value = value;
  if (value === "experience") experienceExpanded.value = true;
  drawer.value = null;
  eventPage.value = 0;
}
function openDrawer(value: typeof drawer.value) {
  previousFocus = canFocus(document.activeElement)
    ? document.activeElement
    : null;
  drawer.value = value;
  void nextTick(() =>
    document.querySelector<HTMLElement>(".dom-drawer button")?.focus(),
  );
}
function closeDrawer() {
  drawer.value = null;
  void nextTick(() => previousFocus?.isConnected && previousFocus.focus());
}
function trap(event: KeyboardEvent) {
  if (event.key === "Escape") {
    closeDrawer();
    return;
  }
  if (event.key !== "Tab") return;
  const box = event.currentTarget as HTMLElement;
  const items = [
    ...box.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]',
    ),
  ].filter((e) => e.getClientRects().length);
  const first = items[0],
    last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
function reset() {
  stopGuide(false);
  guide.value = "idle";
  importEpoch++;
  stopComparison();
  let nextRuntime: typeof runtime;
  try {
    if (
      !Number.isSafeInteger(seed.value) ||
      seed.value < 0 ||
      seed.value > 2_147_483_647
    )
      throw new Error("种子须为0至2147483647的整数");
    nextRuntime = createDominionRuntime({
      scenario: scenario.value,
      seed: seed.value,
    });
  } catch (error) {
    notice.value = `未重置，原世界保留：${error instanceof Error ? error.message : "配置无效"}`;
    return;
  }
  replayPlaying.value = false;
  history.value = false;
  replay.value = null;
  planner.dispose();
  planningEpoch++;
  planning.value = false;
  proposal.value = null;
  plannerFeedback.value = "";
  runtime = nextRuntime;
  planner = createPlannerAdapter({ runtime });
  sync();
  selected.value = null;
  selectedMission.value = snapshot.value.missions[0]?.id ?? "";
  comparison.value = null;
  eventPage.value = 0;
  camera.value = "overview";
  cameraRequest.value++;
  elapsed = 0;
  notice.value = "已创建新世界会话；旧任务没有被改写。";
}
function compare() {
  if (!canCommand.value) return;
  if (["ready", "running"].includes(snapshot.value.status))
    send({ type: "pause" });
  if (snapshot.value.status !== "paused") {
    notice.value = "请先单步或开始后暂停，在真实世界快照上比较。";
    return;
  }
  stopComparison();
  comparing.value = true;
  comparison.value = null;
  openDrawer("comparison");
  const ticket = generation,
    key = sourceKey(snapshot.value);
  try {
    worker = new Worker(
      new URL("../workers/dominion.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (
      event: MessageEvent<{
        generation: number;
        sourceKey: string;
        comparison?: DominionComparison;
        error?: string;
      }>,
    ) => {
      if (
        ticket !== generation ||
        event.data.generation !== ticket ||
        event.data.sourceKey !== key ||
        sourceKey(runtime.snapshot) !== key
      )
        return;
      if (event.data.comparison) comparison.value = event.data.comparison;
      notice.value = event.data.error ?? "两条分支已实算；原世界仍在暂停点。";
      stopComparison();
    };
    worker.onerror = () => {
      if (ticket !== generation) return;
      notice.value = "分支计算异常，原世界未改变，可重试。";
      stopComparison();
    };
    workerTimer = setTimeout(() => {
      if (ticket !== generation) return;
      notice.value = "分支计算超时，已终止，可重试。";
      stopComparison();
    }, 8000);
    worker.postMessage({
      generation: ticket,
      sourceKey: key,
      forkSeq: events.value.at(-1)?.seq ?? 0,
      snapshot: structuredClone(snapshot.value),
      a: strategyA.value,
      b: strategyB.value,
    });
  } catch {
    notice.value = "无法启动分支计算，原世界未改变，可重试。";
    stopComparison();
  }
}
function adopt(strategy: Strategy) {
  if (!canAdopt.value || !comparison.value) {
    notice.value = "世界已变化，不能采用旧结果。请重新比较。";
    return;
  }
  const result = send({
    type: "set-strategy",
    strategy,
    sourceKey: comparison.value.sourceKey,
  });
  if (result?.accepted) {
    notice.value = "已采用未来规划政策，未导入预测终点或交付。";
    closeDrawer();
  }
}
function seek() {
  const frame = replay.value?.frames[replayIndex.value];
  if (frame) {
    snapshot.value = frame.snapshot;
    eventPage.value = 0;
  }
}
function historyStep() {
  if (!replay.value) return;
  if (replayIndex.value < replay.value.frames.length - 1) {
    replayIndex.value++;
    seek();
  } else replayPlaying.value = false;
}
function beginReplay() {
  stopGuide(false);
  guide.value = "idle";
  importEpoch++;
  stopComparison();
  if (runtime.snapshot.status === "running")
    runtime.dispatch({ type: "pause" }, crypto.randomUUID());
  sync();
  try {
    replay.value = validateDominionRecording(runtime.exportRecording());
    history.value = true;
    replayIndex.value = 0;
    replayPlaying.value = false;
    seek();
    workspace.value = "engineering";
    drawer.value = null;
  } catch (error) {
    notice.value = `记录未通过验证：${error instanceof Error ? error.message : "格式错误"}`;
  }
}
function returnLive() {
  importEpoch++;
  replayPlaying.value = false;
  history.value = false;
  sync();
  eventPage.value = 0;
  notice.value = "返回保留的实时会话，仍由你决定是否继续。";
}
function exportJSON() {
  try {
    const data: DominionRecording =
      readonly.value && replay.value
        ? replay.value.recording
        : runtime.exportRecording();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dominion-${data.initial.sessionId}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    notice.value = `导出失败：${error instanceof Error ? error.message : "记录校验失败"}`;
  }
}
async function importJSON(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  const ticket = ++importEpoch;
  try {
    if (file.size > MAX_RECORDING_BYTES)
      throw new Error(`记录不能超过${MAX_RECORDING_BYTES / 1024 / 1024} MiB`);
    const text = await file.text();
    if (ticket !== importEpoch) return;
    const parsed: unknown = JSON.parse(text);
    if (
      parsed &&
      typeof parsed === "object" &&
      "schemaVersion" in parsed &&
      parsed.schemaVersion === 3
    )
      throw new Error(
        "这是V3记录。本页只读取V4格式，原文件未改动；请在V3版本查看，不能静默迁移账本。",
      );
    const valid = validateDominionRecording(parsed);
    if (ticket !== importEpoch) return;
    if (runtime.snapshot.status === "running")
      runtime.dispatch({ type: "pause" }, crypto.randomUUID());
    stopComparison();
    replay.value = valid;
    history.value = true;
    replayIndex.value = 0;
    replayPlaying.value = false;
    seek();
    notice.value = "记录已在隔离副本验证，当前为只读历史。";
  } catch (error) {
    if (ticket === importEpoch)
      notice.value = `导入拒绝，原世界保留：${error instanceof Error ? error.message : "格式无效"}`;
  } finally {
    input.value = "";
  }
}
function addMission() {
  const command: Command = {
    type: "add-mission",
    kind: newKind.value,
    quantity: newQuantity.value,
    deadline: newDeadline.value,
  };
  if (newKind.value !== "relay") command.targetId = target.value;
  const result = send(command);
  if (result?.accepted)
    selectedMission.value =
      snapshot.value.missions.at(-1)?.id ?? selectedMission.value;
}
async function planMission() {
  if (!canCommand.value || planning.value) return;
  if (snapshot.value.status === "running") send({ type: "pause" });
  const epoch = ++planningEpoch,
    owner = planner;
  planning.value = true;
  proposal.value = null;
  plannerFeedback.value = "正在读取当前世界并校验显式参数。";
  try {
    const result = await owner.plan({
      requestId: crypto.randomUUID(),
      goal: plannerGoal.value,
      mission: {
        kind: newKind.value,
        ...(newKind.value !== "relay" ? { targetId: target.value } : {}),
        quantity: newQuantity.value,
        deadline: newDeadline.value,
      },
    });
    if (epoch !== planningEpoch || owner !== planner || readonly.value) return;
    if (result.status === "awaiting-approval") {
      proposal.value = result.proposal;
      plannerFeedback.value =
        "草案已生成，尚未创建任务。请检查参数与只读工具输出后批准或拒绝。";
    } else
      plannerFeedback.value = `未生成可执行提案：${result.code}。世界未因规划而变化。`;
  } catch (error) {
    if (epoch === planningEpoch)
      plannerFeedback.value = `规划失败：${error instanceof Error ? error.message : "未知错误"}`;
  } finally {
    if (epoch === planningEpoch) planning.value = false;
  }
}
function approveProposal(approved: boolean) {
  const p = proposal.value;
  if (!p || readonly.value) return;
  const result = planner.approve({
    proposalId: p.proposalId,
    sessionId: p.sessionId,
    worldVersion: p.worldVersion,
    sourceKey: p.sourceKey,
    approved,
  });
  sync();
  plannerFeedback.value = !approved
    ? "已拒绝草案，没有创建任务。"
    : result.accepted
      ? "已明确批准一个高层任务。仍由运行时逐步执行，未声明交付完成。"
      : `执行未获接受：${result.message}。请重新生成并确认。`;
  proposal.value = null;
  if (result.accepted)
    selectedMission.value = snapshot.value.missions.at(-1)?.id ?? "";
}
function cancelPlanning() {
  planningEpoch++;
  planner.cancel();
  planning.value = false;
  proposal.value = null;
  plannerFeedback.value = "规划已取消；未提交新的任务。";
}
function stopGuide(takeover = true) {
  if (!guideActive.value) return;
  guide.value = takeover ? "taken-over" : "stopped";
  if (runtime.snapshot.status === "running") {
    runtime.dispatch({ type: "pause" }, crypto.randomUUID());
    if (!readonly.value) sync();
  }
  stopComparison();
  elapsed = 0;
}
function userTakesControl(event: Event) {
  if (!guideActive.value) return;
  if (
    event instanceof KeyboardEvent &&
    ![
      "Enter",
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Escape",
      "Home",
      "End",
    ].includes(event.key)
  )
    return;
  if (
    event.target instanceof Element &&
    event.target.closest("[data-guide-control], [data-primary-control]")
  )
    return;
  stopGuide();
}
function startGuide() {
  guideFlat = flat.value || reduced.value || workspace.value === "map";
  scenario.value = "expedition";
  seed.value = 4217;
  reset();
  workspace.value = "command";
  drawer.value = null;
  speed.value = 1;
  guide.value = "intro";
  guideStarted = performance.now();
  guideSeconds.value = 0;
  guideHoldUntil = guideStarted + 4000;
  guideSession = snapshot.value.sessionId;
  guideIntroCamera = false;
  guideScanCamera = false;
  guideDockCamera = false;
  selected.value = { kind: "station", id: "port" };
  guideCamera("overview");
  notice.value =
    "导览按实际任务事件前进。触碰任一控制或拖动世界，即停止导览并接管。";
}
function guideCamera(
  mode: CameraMode,
  role?: "survey" | "repair" | "transport",
) {
  const relay = snapshot.value.missions.find((m) => m.kind === "relay");
  const step = relay?.steps.find((s) => s.role === role);
  if (step?.shipId) selected.value = { kind: "ship", id: step.shipId };
  else if (role) {
    const candidate = snapshot.value.ships.find((s) => s.role === role);
    if (candidate) selected.value = { kind: "ship", id: candidate.id };
  }
  guideFlat ||= flat.value || reduced.value;
  if (guideFlat) {
    camera.value = mode;
    cameraRequest.value++;
    flat.value = true;
  } else setCamera(mode);
}
function advanceGuide() {
  if (!guideActive.value) return;
  const now = performance.now();
  guideSeconds.value = Math.floor((now - guideStarted) / 1000);
  if (
    readonly.value ||
    snapshot.value.sessionId !== guideSession ||
    !snapshot.value.connected ||
    snapshot.value.status === "closed"
  ) {
    stopGuide(false);
    return;
  }
  const relay = snapshot.value.missions.find((m) => m.kind === "relay");
  if (!relay || relay.status === "failed" || guideSeconds.value > 180) {
    stopGuide(false);
    notice.value = relay?.message ?? "导览已停止，请检查当前世界。";
    return;
  }
  if (guide.value === "intro") {
    if (!guideIntroCamera && now >= guideHoldUntil - 2000) {
      guideIntroCamera = true;
      guideCamera("cockpit");
    }
    if (now >= guideHoldUntil) {
      send({ type: "start" });
      guide.value = "scan";
      guideCamera("follow", "survey");
    }
  } else if (guide.value === "scan") {
    const scan = relay.steps.find((s) => s.kind === "scan");
    if (
      !guideScanCamera &&
      snapshot.value.ships.some(
        (s) => s.role === "survey" && s.status === "scanning",
      )
    ) {
      guideScanCamera = true;
      guideCamera("scan", "survey");
    }
    if (scan?.status === "completed") {
      send({ type: "pause" });
      const result = send({
        type: "set-lane",
        laneId: "forge-relay",
        open: false,
      });
      if (!result?.accepted) {
        stopGuide(false);
        return;
      }
      selected.value = { kind: "lane", id: "forge-relay" };
      guideCamera("inspect");
      guide.value = "closure";
      guideHoldUntil = now + 4000;
    }
  } else if (guide.value === "closure" && now >= guideHoldUntil) {
    send({ type: "resume" });
    guide.value = "repair";
    guideCamera("follow", "repair");
  } else if (guide.value === "repair") {
    const repair = relay.steps.find((s) => s.kind === "repair");
    if (repair?.status === "completed") {
      send({ type: "pause" });
      guide.value = "comparison";
      strategyA.value = "time";
      strategyB.value = "energy";
      // Let strategy watchers invalidate the previous worker before starting this one.
      void nextTick(() => {
        if (guide.value === "comparison") compare();
      });
    } else if (
      !guideDockCamera &&
      snapshot.value.ships.some(
        (s) => s.role === "repair" && s.status === "repairing",
      )
    ) {
      guideDockCamera = true;
      guideCamera("docking", "repair");
    }
  } else if (guide.value === "comparison") {
    if (
      comparison.value &&
      comparison.value.sourceKey === sourceKey(snapshot.value)
    ) {
      guide.value = "comparison-hold";
      guideHoldUntil = now + 8000;
    } else if (!comparing.value && drawer.value === "comparison") {
      stopGuide(false);
    }
  } else if (guide.value === "comparison-hold" && now >= guideHoldUntil) {
    drawer.value = null;
    guide.value = "delivery";
    guideDockCamera = false;
    guideCamera("planet", "transport");
    send({ type: "resume" });
  } else if (guide.value === "delivery") {
    const delivery = relay.steps.find((s) => s.kind === "deliver");
    const carrier = snapshot.value.ships.find((s) => s.id === delivery?.shipId);
    if (!guideDockCamera && carrier?.transit) {
      guideDockCamera = true;
      guideCamera("follow", "transport");
    }
    if (relay.status === "completed") {
      guide.value = "completed";
      guideCamera("overview");
      notice.value = `导览完成，用时${guideSeconds.value}秒；实际${snapshot.value.tick}个tick，接力交付已记账。`;
    }
  }
}
watch([strategyA, strategyB], () => {
  stopComparison();
  comparison.value = null;
});
watch(newKind, (value) => {
  target.value =
    value === "rescue"
      ? (snapshot.value.ships.find((s) => s.disabled)?.id ?? "transport-b")
      : value === "science"
        ? "sample"
        : "ice";
});
function contextLost() {
  flat.value = true;
  notice.value = "图形上下文不可用，二维星图继续提供相同任务操作。";
}
function onMetrics(value: SceneMetrics) {
  metrics.value = value;
  if (value.frames < 120 || document.hidden) return;
  slowWindows = value.p95 > 70 ? slowWindows + 1 : 0;
  if (slowWindows >= 3) {
    slowWindows = 0;
    if (quality.value === "high") quality.value = "balanced";
    else if (quality.value === "balanced") quality.value = "mobile";
    else flat.value = true;
    notice.value = "持续慢帧，已降低图形开销；世界与任务没有改变。";
  }
}
function hidden() {
  if (!document.hidden) return;
  stopGuide(false);
  if (runtime.snapshot.status === "running") {
    runtime.dispatch({ type: "pause" }, crypto.randomUUID());
    if (!readonly.value) sync();
    notice.value = "已进入后台，仿真安全暂停。返回后可继续。";
  }
  elapsed = 0;
  replayPlaying.value = false;
  void audio?.suspend();
}
function motion() {
  reduced.value = motionQuery?.matches ?? false;
  if (reduced.value) flat.value = true;
}
onMounted(() => {
  motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  motion();
  motionQuery.addEventListener("change", motion);
  document.addEventListener("visibilitychange", hidden);
  timer = setInterval(() => {
    if (document.hidden) return;
    advanceGuide();
    elapsed += 50;
    if (elapsed < (guideActive.value ? 1200 : 800 / speed.value)) return;
    elapsed = 0;
    if (readonly.value) {
      if (replayPlaying.value) historyStep();
    } else if (snapshot.value.status === "running" && snapshot.value.connected)
      send({ type: "step" }, true);
  }, 50);
});
onBeforeUnmount(() => {
  planningEpoch++;
  planner.dispose();
  guide.value = "stopped";
  importEpoch++;
  stopComparison();
  clearInterval(timer);
  document.removeEventListener("visibilitychange", hidden);
  motionQuery?.removeEventListener("change", motion);
  void audio?.close();
});
</script>

<template>
  <div
    class="dominion"
    data-testid="dominion-lab"
    :data-session-id="snapshot.sessionId"
    :data-status="snapshot.status"
    :data-mode="history ? 'history-replay' : 'local-simulation'"
    :data-tick="snapshot.tick"
    :data-world-version="snapshot.worldVersion"
    :data-completed="complete"
    :data-connected="snapshot.connected"
    :data-view="workspace"
    :data-guide="guide"
    :data-guide-seconds="guideSeconds"
    :data-layer-resources="showResources"
    :data-layer-lanes="showLanes"
    @pointerdown.capture="userTakesControl"
    @click.capture="userTakesControl"
    @input.capture="userTakesControl"
    @keydown.capture="userTakesControl"
    @wheel.capture.passive="userTakesControl"
  >
    <nav class="dom-nav" aria-label="星域智航导航">
      <RouterLink to="/" class="dom-brand"
        ><span class="dom-brand-mark">c›</span
        ><span>CHENXI<small>STAR DOMINION / 04</small></span></RouterLink
      >
      <div class="dom-nav-links">
        <RouterLink to="/projects"
          >返回作品集 <ArrowUpRight :size="13" /></RouterLink
        ><button @click="openDrawer('library')">实用任务库</button>
      </div>
      <div class="dom-mode">
        <span class="dom-led" />{{ readonly ? "历史回放" : "本地规划仿真" }}
      </div>
      <button
        class="dom-icon"
        :aria-label="sound ? '关闭声音' : '开启声音'"
        @click="
          sound = !sound;
          tone();
        "
      >
        <Volume2 v-if="sound" :size="18" /><VolumeX v-else :size="18" />
      </button>
      <button
        class="dom-icon"
        aria-label="世界设置"
        @click="openDrawer('settings')"
      >
        <Settings2 :size="18" />
      </button>
    </nav>

    <section class="dom-stage" aria-label="星际协同指挥中枢">
      <div class="dom-world">
        <DominionScene
          v-if="!flat && workspace !== 'map'"
          :snapshot="snapshot"
          :selected="selected"
          :camera="camera"
          :camera-request="cameraRequest"
          :quality="quality"
          :reduced="reduced"
          :resources-visible="showResources"
          :lanes-visible="showLanes"
          @select="choose"
          @camera-interrupt="notice = '镜头已交由你控制，任务保持原有状态。'"
          @context-lost="contextLost"
          @metrics="onMetrics"
        />
        <DominionMap
          v-else
          :snapshot="snapshot"
          :selected="selected"
          :resources-visible="showResources"
          :lanes-visible="showLanes"
          @select="choose"
        />
      </div>
      <div
        v-if="observingLayers"
        class="dom-world-layers"
        role="group"
        aria-label="世界观察图层"
      >
        <span>观察图层</span>
        <button
          aria-label="资源图层"
          :aria-pressed="resourceLayer"
          @click="resourceLayer = !resourceLayer"
        >
          资源
        </button>
        <button
          aria-label="航道图层"
          :aria-pressed="laneLayer"
          @click="laneLayer = !laneLayer"
        >
          航道
        </button>
        <small v-if="resourceLayer">库存 / 已预留 · 同一世界</small>
      </div>
      <header
        v-if="
          workspace === 'command' &&
          camera === 'overview' &&
          !flat &&
          ['idle', 'stopped'].includes(guide)
        "
        class="dom-hero"
      >
        <p class="dom-eyebrow"><span /> STAR DOMINION COMMAND</p>
        <h1>向未知出发，<br /><em>让协同发生。</em></h1>
        <p class="dom-intro">
          一片星域，六舰同行。<span>每一步行动，都留下可验证的依据。</span>
        </p>
        <button
          class="dom-text-button"
          @click="
            changeView('experience');
            setCamera('overview');
          "
        >
          自由探索 <ArrowUpRight :size="15" />
        </button>
        <button
          class="dom-text-button dom-guide-start"
          data-guide-control
          @click="startGuide"
        >
          远征导览 · 约100秒 <Play :size="13" />
        </button>
      </header>
      <button
        v-if="
          (flat || workspace === 'map') &&
          ['command', 'map'].includes(workspace) &&
          ['idle', 'stopped'].includes(guide) &&
          !readonly
        "
        class="dom-button secondary dom-flat-guide-entry"
        data-guide-control
        @click="startGuide"
      >
        <Play :size="14" />远征导览 · 约100秒
      </button>
      <section
        v-if="
          workspace === 'command' &&
          (guideActive || guide === 'completed' || guide === 'taken-over')
        "
        class="dom-guide"
        aria-label="远征交互导览"
        data-guide-control
      >
        <p class="dom-eyebrow">
          EXPEDITION TOUR <span>{{ guideSeconds }}s</span>
        </p>
        <h2>{{ guideText[0] }}</h2>
        <p>{{ guideText[1] }}</p>
        <div class="dom-guide-steps">
          <span
            v-for="step in snapshot.missions.find((m) => m.kind === 'relay')
              ?.steps"
            :key="step.id"
            :class="{ done: step.status === 'completed' }"
            >{{
              step.kind === "scan"
                ? "勘测"
                : step.kind === "repair"
                  ? "维修"
                  : "交付"
            }}
            <b>{{ step.status === "completed" ? "✓" : "·" }}</b></span
          >
        </div>
        <button v-if="guideActive" class="dom-text-button" @click="stopGuide()">
          停止导览并接管
        </button>
        <template v-else
          ><button class="dom-text-button" @click="guide = 'idle'">
            继续自由探索</button
          ><button
            v-if="guide === 'completed'"
            class="dom-text-button"
            @click="
              guide = 'idle';
              beginReplay();
            "
          >
            回放这次远征
          </button></template
        >
      </section>
      <div class="dom-stage-coordinate" aria-hidden="true">
        DAWN / FROST / EMBER <span>SEED {{ snapshot.seed }}</span>
      </div>
      <div class="dom-camera-bar" aria-label="体验视角">
        <button
          v-for="c in cameras"
          :key="c.id"
          :class="{ active: camera === c.id && !flat }"
          :aria-pressed="camera === c.id && !flat"
          :title="c.description"
          @click="setCamera(c.id)"
        >
          {{ c.label }}</button
        ><button :aria-pressed="flat" @click="toggleFlat">
          {{ flat ? "三维" : "二维" }}
        </button>
      </div>

      <aside
        v-if="workspace === 'fleet'"
        class="dom-workspace-panel"
        aria-label="舰队协同"
      >
        <p class="dom-eyebrow">FLEET / {{ snapshot.ships.length }} SHIPS</p>
        <h2>各司其职，共同前行。</h2>
        <p>舰型决定任务资格。选择一艘舰，检查真实载荷与下一步。</p>
        <button
          v-for="s in snapshot.ships"
          :key="s.id"
          class="dom-ship-card"
          :data-ship-id="s.id"
          :data-role="s.role"
          :data-cargo="JSON.stringify(s.cargo)"
          :data-energy="s.energy"
          @click="choose({ kind: 'ship', id: s.id })"
        >
          <span :class="['dom-role-icon', s.role]">{{
            s.role === "transport" ? "⬟" : s.role === "survey" ? "△" : "＋"
          }}</span
          ><span
            ><b>{{ s.label }}</b
            ><small>{{ roleLabels[s.role] }} · {{ shipStatus[s.status] }}</small
            ><small>{{
              s.missionId
                ? snapshot.missions.find((m) => m.id === s.missionId)?.label
                : "未分配任务"
            }}</small></span
          ><strong>{{ s.energy }}<small>EU</small></strong>
        </button>
      </aside>
      <aside
        v-if="workspace === 'missions'"
        class="dom-workspace-panel dom-missions-panel"
        aria-label="任务编排"
      >
        <p class="dom-eyebrow">MISSION CONTROL</p>
        <h2>把目标，编排为行动。</h2>
        <div class="dom-mission-tabs">
          <button
            v-for="m in snapshot.missions"
            :key="m.id"
            :class="{ active: mission?.id === m.id }"
            :data-mission-id="m.id"
            :data-mission-status="m.status"
            @click="selectedMission = m.id"
          >
            <span>{{ m.label }}</span
            ><small>{{ missionStatus[m.status] }} · {{ progress(m) }}</small>
          </button>
        </div>
        <section v-if="mission" class="dom-mission-detail">
          <div class="dom-panel-line">
            <h3>{{ mission.label }}</h3>
            <span>尝试 #{{ mission.attempt }}</span>
          </div>
          <p>{{ mission.message }}</p>
          <ol class="dom-dependencies">
            <li
              v-for="s in mission.steps"
              :key="s.id"
              :data-step-id="s.id"
              :data-step-status="s.status"
              :class="s.status"
            >
              <i />
              <div>
                <b>{{ s.label }}</b
                ><small
                  >{{ roleLabels[s.role] }} · {{ stepStatus[s.status] }} ·
                  {{ stationName(s.targetId) }}</small
                ><small
                  >{{
                    !s.dependsOn.length
                      ? "无前置依赖"
                      : s.dependsOn.every(
                            (id) =>
                              mission.steps.find((step) => step.id === id)
                                ?.status === "completed",
                          )
                        ? "前置条件已满足"
                        : "前置条件未满足"
                  }}
                  · {{ amount(s.resources) }}</small
                ><small v-if="s.shipId"
                  >执行舰：{{
                    snapshot.ships.find((v) => v.id === s.shipId)?.label
                  }}</small
                >
              </div>
            </li>
          </ol>
          <label
            >调度优先级<select
              :value="mission.priority"
              :disabled="
                !canCommand ||
                ['completed', 'cancelled'].includes(mission.status)
              "
              aria-label="任务优先级"
              @change="
                send({
                  type: 'set-priority',
                  missionId: mission.id,
                  priority: Number(($event.target as HTMLSelectElement).value),
                })
              "
            >
              <option v-for="n in 10" :key="n" :value="n - 1">
                {{ n - 1 }}{{ n === 9 ? " · 救援优先" : "" }}
              </option>
            </select></label
          >
          <div class="dom-panel-actions">
            <button
              v-if="mission.status === 'failed'"
              class="dom-button"
              :disabled="!canCommand"
              @click="retryMission(mission.id)"
            >
              显式重试任务</button
            ><button
              v-if="!['completed', 'cancelled'].includes(mission.status)"
              class="dom-button secondary"
              :disabled="!canCommand"
              @click="send({ type: 'cancel-mission', missionId: mission.id })"
            >
              取消任务
            </button>
          </div>
          <p class="dom-fine">
            截止 T{{ mission.deadline }} · 实际交付
            {{ amount(mission.delivered) }}
          </p>
          <details>
            <summary>尝试历史与失败依据</summary>
            <p v-for="a in mission.attempts" :key="a.attempt">
              #{{ a.attempt }} · T{{ a.startedAt }}—{{ a.endedAt ?? "当前" }} ·
              {{ a.outcome }} · {{ a.reason ?? "无失败原因" }}
            </p>
          </details>
        </section>
        <details class="dom-create">
          <summary>添加沙箱任务</summary>
          <label
            >任务类型<select v-model="newKind" aria-label="新任务类型">
              <option v-for="(label, k) in missionLabels" :key="k" :value="k">
                {{ label }}
              </option>
            </select></label
          ><label v-if="newKind !== 'relay'"
            >{{ newKind === "rescue" ? "需要救援的舰船" : "目标站点"
            }}<select v-model="target" aria-label="新任务目标">
              <template v-if="newKind === 'rescue'"
                ><option v-for="s in snapshot.ships" :key="s.id" :value="s.id">
                  {{ s.label }}
                </option></template
              ><template v-else
                ><option
                  v-for="s in snapshot.stations.filter(
                    (s) => newKind !== 'science' || s.kind === 'sample',
                  )"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.label }}
                </option></template
              >
            </select></label
          ><label
            >数量（1–6）<input
              v-model.number="newQuantity"
              type="number"
              min="1"
              max="6"
              aria-label="任务数量" /></label
          ><label
            >模拟期限<input
              v-model.number="newDeadline"
              type="number"
              min="5"
              max="500"
              aria-label="任务期限" /></label
          ><button
            class="dom-button"
            :disabled="!canCommand || active >= 4"
            @click="addMission"
          >
            提交任务
          </button>
          <p>数量1–6，最多四项活动任务；库存、舰型和路径仍由运行时检查。</p>
          <section class="dom-planner" aria-label="受控规划提案">
            <h3>规划替身（不调用模型）</h3>
            <p>
              使用上方显式参数，读取当前世界并生成一个高层提案。目标文字不执行指令；批准前不创建任务。
            </p>
            <label
              >任务意图<textarea
                v-model="plannerGoal"
                maxlength="4000"
                aria-label="规划意图"
              />
            </label>
            <button
              class="dom-button secondary"
              :disabled="!canCommand || planning"
              @click="planMission"
            >
              {{ planning ? "正在生成草案" : "生成受控提案" }}
            </button>
            <button
              v-if="planning"
              class="dom-button secondary"
              @click="cancelPlanning"
            >
              取消规划
            </button>
            <p role="status">{{ plannerFeedback }}</p>
            <article
              v-if="proposal"
              class="dom-proposal"
              :data-proposal-id="proposal.proposalId"
            >
              <b>待人工确认 · 世界版本 {{ proposal.worldVersion }}</b>
              <p>{{ proposal.summary }}</p>
              <pre>{{ JSON.stringify(proposal.command, null, 2) }}</pre>
              <details>
                <summary>
                  只读工具输入 / 输出 / 来源（{{ proposal.tools.length }}）
                </summary>
                <pre>{{ JSON.stringify(proposal.tools, null, 2) }}</pre>
              </details>
              <p
                v-if="proposal.sourceKey !== sourceKey(snapshot)"
                class="dom-warning"
              >
                世界已变化，旧提案不能执行，请重新生成。
              </p>
              <div class="dom-panel-actions">
                <button
                  class="dom-button"
                  :disabled="!canCommand"
                  @click="approveProposal(true)"
                >
                  批准一个任务</button
                ><button
                  class="dom-button secondary"
                  @click="approveProposal(false)"
                >
                  拒绝提案
                </button>
              </div>
            </article>
          </section>
        </details>
      </aside>
      <aside
        v-if="workspace === 'experience' && experienceExpanded"
        class="dom-workspace-panel dom-experience-panel"
        aria-label="星际体验舱"
      >
        <div class="dom-panel-line">
          <p class="dom-eyebrow">EXPERIENCE DECK</p>
          <button
            class="dom-icon"
            aria-label="收起体验菜单"
            @click="experienceExpanded = false"
          >
            <X :size="17" />
          </button>
        </div>
        <h2>换个位置，<br />看见同一场远征。</h2>
        <p>镜头只改变观察位置，任务与模拟时钟连续。</p>
        <button
          v-for="c in cameras.filter((c) => c.id !== 'overview')"
          :key="c.id"
          class="dom-experience-option"
          :aria-pressed="camera === c.id"
          @click="setCamera(c.id)"
        >
          <span>{{ c.label }}</span
          ><small>{{ c.description }}</small
          ><ChevronRight :size="17" /></button
        ><label
          >跟踪舰船<select
            :value="selected?.kind === 'ship' ? selected.id : ''"
            aria-label="跟踪舰船"
            @change="
              selected = {
                kind: 'ship',
                id: ($event.target as HTMLSelectElement).value,
              };
              cameraRequest++;
            "
          >
            <option value="" disabled>选择舰船</option>
            <option v-for="s in snapshot.ships" :key="s.id" :value="s.id">
              {{ s.label }} · {{ roleLabels[s.role] }}
            </option>
          </select></label
        ><button
          class="dom-button secondary"
          :disabled="!canCommand"
          @click="
            newKind = 'science';
            changeView('missions');
          "
        >
          <ScanLine :size="15" />下达勘测任务
        </button>
        <details>
          <summary>
            已发现的世界事实（{{ snapshot.discoveries.length }}）
          </summary>
          <p v-if="!snapshot.discoveries.length">
            尚未完成勘测；不提前显示扫描结果。
          </p>
          <p v-for="d in snapshot.discoveries" :key="d.id">
            T{{ d.tick }} · {{ stationName(d.stationId) }} ·
            {{
              d.kind === "damage"
                ? "实际发现受损设施"
                : "样本发现 " + d.quantity
            }}
            · {{ d.shipId }}
          </p>
        </details>
        <p class="dom-fine">浏览器交互体验，不是VR设备或真实航天验证。</p>
      </aside>
      <div
        v-if="workspace === 'experience' && !experienceExpanded"
        class="dom-experience-compact"
      >
        <div>
          <small>LIVE EXPERIENCE / T{{ snapshot.tick }}</small
          ><b
            >{{ cameras.find((c) => c.id === camera)?.label ?? "对象观察"
            }}<span v-if="ship">
              · {{ ship.label }} · {{ shipStatus[ship.status] }}</span
            ></b
          >
        </div>
        <button class="dom-button secondary" @click="experienceExpanded = true">
          选择体验
        </button>
      </div>
      <aside
        v-if="workspace === 'engineering'"
        class="dom-workspace-panel dom-engineering-panel"
        aria-label="工程档案"
      >
        <p class="dom-eyebrow">EVIDENCE / NOT PREDICTION</p>
        <h2>每次行动，均有出处。</h2>
        <div class="dom-fact-grid">
          <span
            >世界版本<b>{{ snapshot.worldVersion }}</b></span
          ><span
            >模拟时钟<b>{{ snapshot.tick }}</b></span
          ><span
            >事件<b>{{ visibleEvents.length }}</b></span
          ><span
            >重规划<b>{{ snapshot.replans }}</b></span
          >
        </div>
        <p class="dom-code">
          {{ snapshot.sessionId }}<br />{{ snapshot.plannerVersion }}
        </p>
        <details open>
          <summary>资源账本</summary>
          <div class="dom-ledger">
            <div v-for="resource in RESOURCES" :key="resource">
              <b>{{ RESOURCE_LABELS[resource] }}</b
              ><span>初始 {{ snapshot.ledger.initial[resource] }}</span
              ><span>生成 {{ snapshot.ledger.generated[resource] }}</span
              ><span>消耗 {{ snapshot.ledger.consumed[resource] }}</span>
              <span
                :data-ledger-resource="resource"
                :data-located="located(resource)"
                >现存 {{ located(resource) }}</span
              >
            </div>
          </div>
          <p class="dom-fine">
            所有权在库存、预留、载荷和交付间转移；能量包括已消耗项。数据均为合成。
          </p>
        </details>
        <div class="dom-panel-actions">
          <button
            class="dom-button"
            :disabled="!canCommand || comparing"
            @click="compare"
          >
            暂停并比较策略</button
          ><button
            class="dom-button secondary"
            @click="beginReplay"
            :disabled="readonly"
          >
            回放记录</button
          ><button class="dom-button secondary" @click="exportJSON">
            <Download :size="14" />导出 JSON
          </button>
        </div>
        <label class="dom-file"
          >导入并验证记录<input
            type="file"
            accept="application/json,.json"
            aria-label="导入执行记录"
            @change="importJSON"
        /></label>
        <details>
          <summary>工具输入 / 输出 / 来源</summary>
          <label
            >实际工具调用<select v-model="toolId" aria-label="工具调用">
              <option value="">最近一次</option>
              <option
                v-for="t in snapshot.tools.slice(-50)"
                :key="t.id"
                :value="t.id"
              >
                {{ t.tool }} · {{ t.durationMs.toFixed(2) }}ms
              </option>
            </select></label
          >
          <pre v-if="tool">{{ JSON.stringify(tool, null, 2) }}</pre>
          <p v-else>尚未发生工具调用。</p>
        </details>
        <ol class="dom-events">
          <li v-for="e in pageEvents" :key="e.eventId">
            <small
              >#{{ e.seq }} · T{{ e.tick }} · W{{ e.worldVersion }}
              <span v-if="e.missionId"
                >{{ e.missionId }} / #{{ e.attempt }}</span
              ></small
            ><b>{{ e.type }}</b
            ><code>{{ JSON.stringify(e.payload) }}</code>
          </li>
        </ol>
        <div class="dom-pagination">
          <button :disabled="eventPage === 0" @click="eventPage--">
            较新事件</button
          ><span>{{ eventPage + 1 }} / {{ eventPages }}</span
          ><button :disabled="eventPage >= eventPages - 1" @click="eventPage++">
            较早事件
          </button>
        </div>
        <p v-if="metrics" class="dom-fine">
          当前采样 P50 {{ metrics.p50.toFixed(1) }} / P95
          {{ metrics.p95.toFixed(1) }}ms · {{ metrics.drawCalls }} draws ·
          {{ metrics.geometries }} geometries。不是手机真机性能。
        </p>
        <a
          :href="sourceRoot + 'packages/intelligence/src/dominion'"
          target="_blank"
          rel="noopener noreferrer"
          >运行时与约束源码 ↗</a
        >
        <p class="dom-fine">
          本地规划仿真已运行；模型辅助规划未启用。三类舰不等于多个大模型。历史校验不认证外部来源真实性。
        </p>
        <nav class="dom-evidence-links" aria-label="版本与验收证据">
          <RouterLink to="/intelligence/v3">V3 历史版本</RouterLink>
          <a
            v-for="link in evidenceLinks"
            :key="link.file"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            >{{ link.label }} ↗</a
          >
        </nav>
      </aside>

      <div class="dom-live-ribbon">
        <span class="dom-led" /><span>{{ sessionLabel }}</span
        ><b>T{{ String(snapshot.tick).padStart(3, "0") }}</b
        ><span>W{{ snapshot.worldVersion }}</span
        ><button @click="openDrawer('objects')">
          查看世界对象 <ChevronRight :size="14" />
        </button>
      </div>
    </section>

    <section class="dom-command-dock" aria-label="远征控制">
      <div class="dom-dock-title">
        <p class="dom-eyebrow">
          {{ readonly ? "RECORDED WORLD" : "MISSION OPERATIONS" }}
        </p>
        <h2>{{ mission?.label ?? "世界会话" }}</h2>
        <p>{{ snapshot.message }}</p>
      </div>
      <div class="dom-dock-facts">
        <span
          ><small>任务完成</small
          ><b
            >{{ complete }}<em>/{{ snapshot.missions.length }}</em></b
          ></span
        ><span
          ><small>消耗能源</small
          ><b>{{ snapshot.ledger.consumed.energy }}<em>EU</em></b></span
        >
      </div>
      <div class="dom-dock-actions">
        <template v-if="!readonly"
          ><button
            class="dom-button primary"
            data-primary-control
            :disabled="!canCommand"
            @click="primary"
          >
            <Pause v-if="snapshot.status === 'running'" :size="17" /><Play
              v-else
              :size="17"
            />{{
              snapshot.status === "ready"
                ? "启动远征"
                : snapshot.status === "running"
                  ? "暂停世界"
                  : snapshot.status === "closed"
                    ? "会话已关闭"
                    : active === 0 && !failures.length
                      ? "回放这次远征"
                      : "继续远征"
            }}
          </button>
          <div class="dom-minor-controls">
            <button :disabled="!canCommand" @click="send({ type: 'step' })">
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
          </div></template
        ><template v-else
          ><button class="dom-button" @click="replayPlaying = !replayPlaying">
            {{ replayPlaying ? "暂停回放" : "播放历史" }}
          </button>
          <div class="dom-minor-controls">
            <button @click="historyStep">回放单步</button
            ><button @click="returnLive">返回实时</button>
          </div></template
        >
      </div>
    </section>
    <section
      v-if="readonly && replay"
      class="dom-replay"
      aria-label="历史时间线"
    >
      <label
        >记录帧 {{ replayIndex }} / {{ replay.frames.length - 1
        }}<input
          v-model.number="replayIndex"
          type="range"
          min="0"
          :max="replay.frames.length - 1"
          aria-label="历史记录进度"
          @input="
            replayPlaying = false;
            seek();
          "
      /></label>
      <p>
        按已验证记录投影 · 不提交命令，不调用外部工具 · 来源
        {{ replay.recording.initial.sessionId }}
      </p>
    </section>
    <div
      v-if="failures.length && !readonly"
      class="dom-failure-strip"
      role="status"
    >
      <div v-for="m in failures" :key="m.id">
        <b>{{ m.label }} · {{ m.failureCode }}</b
        ><span>{{ m.message }}</span
        ><button :disabled="!canCommand" @click="retryMission(m.id)">
          重试 {{ m.label }}
        </button>
      </div>
    </div>
    <nav class="dom-workspace-nav" aria-label="工作视图">
      <button
        v-for="v in views"
        :key="v.id"
        :aria-label="v.label"
        :aria-pressed="workspace === v.id"
        @click="changeView(v.id)"
      >
        <small>{{ v.number }}</small
        >{{ v.label }}
      </button>
    </nav>
    <footer class="dom-footer">
      <span>原创压缩尺度世界 / 模拟资源与任务</span
      ><button @click="changeView('engineering')">
        打开工程档案 <ArrowUpRight :size="13" /></button
      ><RouterLink to="/">返回 Chenxi DevLab</RouterLink>
    </footer>

    <div v-if="drawer" class="dom-drawer-backdrop" @click.self="closeDrawer">
      <aside
        class="dom-drawer"
        :class="`dom-drawer-${drawer}`"
        role="dialog"
        aria-modal="true"
        :aria-label="
          {
            objects: '世界对象',
            settings: '世界设置',
            comparison: '两个未来',
            library: '实用任务库',
          }[drawer]
        "
        @keydown="trap"
      >
        <header>
          <span>{{
            {
              objects: "世界对象",
              settings: "世界设置",
              comparison: "两个未来",
              library: "实用任务库",
            }[drawer]
          }}</span
          ><button class="dom-icon" aria-label="关闭面板" @click="closeDrawer">
            <X :size="20" />
          </button>
        </header>
        <template v-if="drawer === 'objects'"
          ><h2>{{ entityTitle }}</h2>
          <section v-if="ship">
            <p>{{ roleLabels[ship.role] }}舰 · {{ shipStatus[ship.status] }}</p>
            <dl class="dom-entity-facts">
              <div>
                <dt>位置</dt>
                <dd>
                  {{
                    ship.transit
                      ? `${stationName(ship.transit.from)} → ${stationName(ship.transit.to)}`
                      : stationName(ship.nodeId)
                  }}
                </dd>
              </div>
              <div>
                <dt>能量</dt>
                <dd>{{ ship.energy }} EU</dd>
              </div>
              <div>
                <dt>实际载货 / 容量</dt>
                <dd>{{ amount(ship.cargo) }} / {{ ship.capacity }}</dd>
              </div>
              <div>
                <dt>预约货物</dt>
                <dd>{{ amount(ship.reserved) }}</dd>
              </div>
              <div>
                <dt>任务归属</dt>
                <dd>{{ ship.missionId ?? "无" }}</dd>
              </div>
              <div>
                <dt>等待</dt>
                <dd>{{ ship.totalWait }} ticks</dd>
              </div>
            </dl>
            <div class="dom-panel-actions">
              <button
                class="dom-button"
                @click="
                  setCamera('follow');
                  closeDrawer();
                "
              >
                跟随这艘舰</button
              ><button
                class="dom-button secondary"
                :disabled="!canCommand"
                @click="send({ type: 'distress', shipId: ship.id })"
              >
                注入设备故障</button
              ><button
                class="dom-button secondary"
                :disabled="!canCommand || !ship.disabled"
                @click="send({ type: 'rescue', shipId: ship.id })"
              >
                请求真实救援</button
              ><button
                class="dom-button secondary"
                :disabled="!canCommand"
                @click="send({ type: 'return-cargo', shipId: ship.id })"
              >
                归还保留载货
              </button>
            </div>
            <p class="dom-fine">
              故障会影响该舰当前执行；救援仍需合格维修舰、资源和可达路径。
            </p>
          </section>
          <section v-if="station">
            <p>
              {{ station.regionId }} ·
              {{ station.damaged ? "设施受损" : "设施可用" }}
            </p>
            <div class="dom-ledger">
              <div v-for="r in RESOURCES" :key="r">
                <b>{{ RESOURCE_LABELS[r] }}</b
                ><span>库存 {{ station.stock[r] }}</span
                ><span>预留 {{ station.reserved[r] }}</span>
              </div>
            </div>
            <p>
              泊位容量 {{ station.dockCapacity }} · 注入占用
              {{ station.blockedBerths }}
            </p>
            <section
              class="dom-commitments"
              data-testid="station-commitments"
              :data-docked="stationDocked.length"
              :data-inbound="stationInbound.length"
              :data-blocked="station.blockedBerths"
              :data-free="stationFree"
            >
              <h3>泊位与已承诺预约</h3>
              <p>
                停靠 {{ stationDocked.length }} · 在途入站
                {{ stationInbound.length }} · 可接收新预约 {{ stationFree }}
              </p>
              <ul>
                <li
                  v-for="s in stationDocked"
                  :key="`dock-${s.id}`"
                  :data-ship-id="s.id"
                  data-commitment="docked"
                >
                  <b>{{ s.label }} · 已停靠</b
                  ><span
                    >{{ shipStatus[s.status] }} ·
                    {{ missionForShip(s.missionId) }}</span
                  >
                </li>
                <li
                  v-for="s in stationInbound"
                  :key="`inbound-${s.id}`"
                  :data-ship-id="s.id"
                  data-commitment="inbound"
                >
                  <b>{{ s.label }} · 下一泊位已预约</b
                  ><span
                    >{{ stationName(s.transit!.from) }} → {{ station.label }} ·
                    {{ s.transit!.elapsed }}/{{ s.transit!.duration }} tick ·
                    {{ missionForShip(s.missionId) }}</span
                  >
                </li>
              </ul>
              <p v-if="!stationDocked.length && !stationInbound.length">
                没有停靠舰或已出发的入站预约。
              </p>
              <details v-if="stationReserved.length || stationPlanned.length">
                <summary>资源预留与后续路线意图</summary>
                <ul>
                  <li
                    v-for="s in stationReserved"
                    :key="`resource-${s.id}`"
                    :data-ship-id="s.id"
                    data-commitment="resource"
                  >
                    <b>{{ s.label }} · 资源已预留</b
                    ><span>{{ amount(s.reserved) }}</span>
                  </li>
                  <li
                    v-for="s in stationPlanned"
                    :key="`plan-${s.id}`"
                    :data-ship-id="s.id"
                    data-commitment="planned"
                  >
                    <b>{{ s.label }} · 后续计划经过</b
                    ><span
                      >尚未预约此泊位 · {{ missionForShip(s.missionId) }}</span
                    >
                  </li>
                </ul>
              </details>
              <p class="dom-fine">
                泊位计数只包含实际停靠、当前在途目的地和注入占用。未来路线与资源预留不额外占用泊位。
              </p>
            </section>
            <button
              class="dom-button secondary"
              :disabled="!canCommand"
              @click="
                send({
                  type: 'hold-dock',
                  stationId: station.id,
                  berths: station.blockedBerths ? 0 : station.dockCapacity,
                })
              "
            >
              {{ station.blockedBerths ? "释放注入占用" : "模拟泊位占满" }}
            </button>
            <p class="dom-fine">
              占满将影响后续预约，不取消已有在途事实。释放后按调度规则恢复。
            </p>
          </section>
          <section v-if="lane">
            <dl class="dom-entity-facts">
              <div>
                <dt>通行权限</dt>
                <dd>{{ lane.open ? "用户允许" : "用户禁行" }}</dd>
              </div>
              <div>
                <dt>设施状态</dt>
                <dd>{{ lane.damaged ? "受损，需维修" : "完好" }}</dd>
              </div>
              <div>
                <dt>时间 / 能源</dt>
                <dd>{{ lane.ticks }} tick / {{ lane.energy }} EU</dd>
              </div>
              <div>
                <dt>容量 / 风险代价</dt>
                <dd>{{ lane.capacity }} / {{ lane.risk }}</dd>
              </div>
            </dl>
            <p>
              禁行阻止新进入；已在途舰安全到下一节点。维修不会解除用户禁行。
            </p>
            <section
              class="dom-commitments"
              data-testid="lane-commitments"
              :data-transit="laneTransit.length"
              :data-planned="lanePlanned.length"
              :data-free="laneFree"
            >
              <h3>当前航道占用</h3>
              <p>
                已承诺在途 {{ laneTransit.length }}/{{ lane.capacity }} ·
                容量余量 {{ laneFree }}
              </p>
              <ul>
                <li
                  v-for="s in laneTransit"
                  :key="s.id"
                  :data-ship-id="s.id"
                  data-commitment="transit"
                >
                  <b>{{ s.label }} · 当前段已预约</b
                  ><span
                    >{{ stationName(s.transit!.from) }} →
                    {{ stationName(s.transit!.to) }} ·
                    {{ s.transit!.elapsed }}/{{ s.transit!.duration }} tick ·
                    {{ missionForShip(s.missionId) }}</span
                  >
                </li>
              </ul>
              <p v-if="!laneTransit.length">当前没有已进入此段的舰船。</p>
              <details v-if="lanePlanned.length">
                <summary>
                  后续路线意图 {{ lanePlanned.length }} 艘 · 尚未占用
                </summary>
                <ul>
                  <li
                    v-for="s in lanePlanned"
                    :key="s.id"
                    :data-ship-id="s.id"
                    data-commitment="planned"
                  >
                    <b>{{ s.label }}</b
                    ><span
                      >{{ missionForShip(s.missionId) }} ·
                      进入前仍需许可、设施、能量与下一泊位校验</span
                    >
                  </li>
                </ul>
              </details>
              <p class="dom-fine">
                只统计已经驶入当前航段的舰船。后续计划不会提前预约整条路线；容量有余量也不代表当前允许通行。
              </p>
            </section>
            <div class="dom-panel-actions">
              <button
                class="dom-button"
                :disabled="!canCommand"
                @click="
                  send({ type: 'set-lane', laneId: lane.id, open: !lane.open })
                "
              >
                {{ lane.open ? "关闭这条航道" : "重新开放航道" }}</button
              ><button
                class="dom-button secondary"
                v-if="canRepairLane(lane)"
                :disabled="!canCommand || lane.damaged"
                @click="send({ type: 'damage-lane', laneId: lane.id })"
              >
                注入设施损坏
              </button>
            </div>
            <p v-if="!canRepairLane(lane)">
              此航道可关闭与重新开放；物理损坏演示限于有维修任务的中继关联设施。
            </p>
          </section>
          <section
            v-if="station || lane"
            class="dom-commitments"
            data-testid="object-related-missions"
          >
            <h3>关联任务</h3>
            <ul>
              <li
                v-for="m in relatedMissions"
                :key="m.id"
                :data-mission-id="m.id"
              >
                <b>{{ m.label }}</b
                ><span
                  >{{ missionStatus[m.status] }} · 尝试 #{{ m.attempt }}</span
                >
              </li>
            </ul>
            <p v-if="!relatedMissions.length">当前没有关联的任务安排。</p>
            <p class="dom-fine">
              按此站的任务来源/目标，或当前占用、资源预留、后续路线对应舰船关联；关联本身不代表预约成功。
            </p>
          </section>
          <details :open="!selected">
            <summary>选择站点、舰船与航道</summary>
            <div class="dom-object-list">
              <button
                v-for="s in snapshot.stations"
                :key="s.id"
                :data-station-id="s.id"
                @click="selected = { kind: 'station', id: s.id }"
              >
                {{ s.label }}<small>{{ s.stock.energy }} EU</small></button
              ><button
                v-for="s in snapshot.ships"
                :key="s.id"
                :data-ship-id="s.id"
                @click="selected = { kind: 'ship', id: s.id }"
              >
                {{ s.label
                }}<small
                  >{{ roleLabels[s.role] }} · {{ shipStatus[s.status] }}</small
                ></button
              ><button
                v-for="l in snapshot.lanes"
                :key="l.id"
                :data-lane-id="l.id"
                :data-open="l.open"
                :data-damaged="l.damaged"
                @click="selected = { kind: 'lane', id: l.id }"
              >
                {{ stationName(l.from) }} → {{ stationName(l.to)
                }}<small>{{
                  !l.open ? "禁行" : l.damaged ? "受损" : "可通行"
                }}</small>
              </button>
            </div>
          </details></template
        >
        <template v-else-if="drawer === 'settings'"
          ><p>配置用于新会话；不改写已完成任务。</p>
          <label
            >场景<select v-model="scenario" aria-label="世界场景">
              <option v-for="s in SCENARIOS" :key="s" :value="s">
                {{ scenarioLabels[s] }}
              </option>
            </select></label
          ><label
            >固定种子<input
              v-model.number="seed"
              type="number"
              min="0"
              max="2147483647"
              aria-label="世界种子" /></label
          ><button
            class="dom-button"
            @click="
              reset();
              closeDrawer();
            "
          >
            重置并应用场景</button
          ><label
            >画质<select v-model="quality" aria-label="图形质量">
              <option value="high">高 · 桌面展示</option>
              <option value="balanced">平衡 · 有界像素</option>
              <option value="mobile">移动 · 低装饰开销</option>
            </select></label
          ><label class="dom-checkbox"
            ><input v-model="reduced" type="checkbox" />减弱空间动效</label
          ><label
            >运行速度<select v-model.number="speed" aria-label="设置运行速度">
              <option :value="0.5">0.5×</option>
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="4">4×</option>
            </select></label
          ><label
            >规划策略<select
              :value="snapshot.strategy"
              :disabled="!canCommand"
              aria-label="规划策略"
              @change="
                send({
                  type: 'set-strategy',
                  strategy: ($event.target as HTMLSelectElement)
                    .value as Strategy,
                })
              "
            >
              <option v-for="s in STRATEGIES" :key="s" :value="s">
                {{ strategyLabels[s] }}
              </option>
            </select></label
          >
          <p class="dom-fine">策略是可解释偏好，不保证全局最优或成功概率。</p>
          <h3>世界干预</h3>
          <p>
            以下命令仅影响当前隔离仿真。全部禁行后任务可能不可达；开放后需显式重试失败任务。
          </p>
          <div class="dom-panel-actions">
            <button
              class="dom-button secondary"
              :disabled="!canCommand"
              @click="send({ type: 'set-all-lanes', open: false })"
            >
              封闭所有航道</button
            ><button
              class="dom-button secondary"
              :disabled="!canCommand"
              @click="send({ type: 'set-all-lanes', open: true })"
            >
              重新开放所有航道</button
            ><button
              class="dom-button secondary"
              :disabled="readonly || snapshot.status === 'closed'"
              @click="
                send({ type: 'set-connection', connected: !snapshot.connected })
              "
            >
              {{
                snapshot.connected ? "模拟断开观测链路" : "重连并同步快照"
              }}</button
            ><button
              class="dom-button secondary"
              :disabled="!canCommand"
              @click="send({ type: 'close-session' })"
            >
              关闭此世界会话
            </button>
          </div>
          <p class="dom-fine">
            本地断连演示会安全暂停，重连后需明确继续；没有真实网络请求或服务端任务。
          </p></template
        >
        <template v-else-if="drawer === 'comparison'"
          ><p class="dom-eyebrow">SAME WORLD / TWO FUTURES</p>
          <h2>同一时刻，两个未来。</h2>
          <p>
            保留任务依赖、已承诺载荷、预约与故障时序。结果来自隔离Worker实算；相同结果与失败也如实显示。
          </p>
          <div class="dom-compare-select">
            <label
              >分支 A<select v-model="strategyA" aria-label="分支A策略">
                <option v-for="s in STRATEGIES" :key="s" :value="s">
                  {{ strategyLabels[s] }}
                </option>
              </select></label
            ><label
              >分支 B<select v-model="strategyB" aria-label="分支B策略">
                <option v-for="s in STRATEGIES" :key="s" :value="s">
                  {{ strategyLabels[s] }}
                </option>
              </select></label
            >
          </div>
          <button
            class="dom-button"
            :disabled="!canCommand || comparing"
            @click="compare"
          >
            {{ comparing ? "正在计算两条未来…" : "从当前暂停快照计算" }}
          </button>
          <div v-if="comparison" class="dom-branches">
            <section
              v-for="(branch, i) in [comparison.a, comparison.b]"
              :key="i"
              class="dom-branch"
              :data-branch="i === 0 ? 'a' : 'b'"
              :data-strategy="branch.strategy"
            >
              <p>
                {{ i === 0 ? "A" : "B" }} /
                {{ strategyLabels[branch.strategy] }}
              </p>
              <h3>{{ branch.completed }}<small>项任务完成</small></h3>
              <DominionBranchMap :branch="branch" /><small
                >青：运输 · 紫：勘测 · 琥珀：维修</small
              >
              <dl>
                <div>
                  <dt>额外模拟步</dt>
                  <dd>{{ branch.ticks }}</dd>
                </div>
                <div>
                  <dt>能源消耗</dt>
                  <dd>{{ branch.energyUsed }} EU</dd>
                </div>
                <div>
                  <dt>等待</dt>
                  <dd>{{ branch.waitTicks }} tick</dd>
                </div>
                <div>
                  <dt>失败 / 超期</dt>
                  <dd>{{ branch.failed }} / {{ branch.deadlineViolations }}</dd>
                </div>
                <div>
                  <dt>约束违规</dt>
                  <dd>{{ branch.violations.length }}</dd>
                </div>
              </dl>
              <p v-if="branch.failed">
                {{
                  branch.snapshot.missions
                    .filter((m) => m.status === "failed")
                    .map((m) => `${m.label}：${m.failureCode}`)
                    .join("；")
                }}
              </p>
              <button
                class="dom-button secondary"
                :disabled="!canAdopt"
                @click="adopt(branch.strategy)"
              >
                采用{{ strategyLabels[branch.strategy] }}
              </button>
            </section>
          </div>
          <p v-if="comparison && !canAdopt">
            源快照已变化或不处于暂停状态，请重新计算。
          </p>
          <p class="dom-fine">
            采用只改变未来政策，不复制分支中的未来交付、库存和时间。
          </p></template
        >
        <template v-else
          ><p class="dom-eyebrow">FROM SPACE TO SOFTWARE</p>
          <h2>同一工程方法，<br />用于业务约束。</h2>
          <RouterLink
            class="dom-library-link"
            to="/intelligence/tasks?preset=product"
            ><b>商品研究</b><span>查询 → 比较 → 审批 → 草稿</span
            ><ArrowUpRight :size="17" /></RouterLink
          ><RouterLink
            class="dom-library-link"
            to="/intelligence/tasks?preset=activity"
            ><b>活动助理</b><span>筛选 → 名额 → 确认 → 模拟预约</span
            ><ArrowUpRight :size="17"
          /></RouterLink>
          <p>
            保留既有任务与测试边界。真实模型未启用；公开体验使用模拟数据。
          </p></template
        >
      </aside>
    </div>
    <div v-if="notice" class="dom-notice" role="status">
      <span>{{ notice }}</span
      ><button class="dom-icon" aria-label="关闭提示" @click="notice = ''">
        <X :size="16" />
      </button>
    </div>
  </div>
</template>
