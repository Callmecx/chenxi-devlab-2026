/** V4 shared contract. Domain facts are owned by the deterministic runtime. */
export type Resource = "energy" | "supplies" | "parts" | "samples";
export type Resources = Record<Resource, number>;
export type ShipRole = "transport" | "survey" | "repair";
export type RegionId = "dawn" | "frost" | "ember";
export type Strategy = "time" | "energy" | "robust" | "balanced";
export type Scenario =
  | "supply"
  | "expedition"
  | "four-missions"
  | "competition"
  | "sealed"
  | "low-energy";
export type CameraMode =
  | "overview"
  | "follow"
  | "cockpit"
  | "docking"
  | "planet"
  | "scan"
  | "inspect";
export type Quality = "high" | "balanced" | "mobile";
export type WorkspaceView =
  | "command"
  | "map"
  | "fleet"
  | "missions"
  | "experience"
  | "engineering";
export interface Selection {
  kind: "station" | "ship" | "lane";
  id: string;
}
export interface Station {
  id: string;
  label: string;
  regionId: RegionId;
  kind: "port" | "depot" | "outpost" | "relay" | "science" | "sample";
  position: [number, number, number];
  stock: Resources;
  reserved: Resources;
  dockCapacity: number;
  blockedBerths: number;
  damaged: boolean;
}
export interface Lane {
  id: string;
  from: string;
  to: string;
  ticks: number;
  energy: number;
  risk: number;
  capacity: number;
  open: boolean;
  damaged: boolean;
  roles: ShipRole[];
}
export interface Transit {
  laneId: string;
  from: string;
  to: string;
  elapsed: number;
  duration: number;
}
export interface ShipAction {
  kind: "load" | "deliver" | "scan" | "repair" | "rescue";
  elapsed: number;
  duration: number;
  targetId: string;
  missionId: string;
}
export interface Ship {
  id: string;
  label: string;
  role: ShipRole;
  nodeId: string;
  transit: Transit | null;
  capacity: number;
  energy: number;
  initialEnergy: number;
  speed: number;
  cargo: Resources;
  reserved: Resources;
  cargoOwner: string | null;
  sourceId: string | null;
  missionId: string | null;
  stepId: string | null;
  route: string[];
  planVersion: number;
  phase: "idle" | "to-source" | "to-target" | "working";
  status:
    | "idle"
    | "moving"
    | "loading"
    | "delivering"
    | "scanning"
    | "repairing"
    | "waiting"
    | "disabled";
  action: ShipAction | null;
  disabled: boolean;
  waitTicks: number;
  totalWait: number;
}
export type MissionKind = "supply" | "relay" | "rescue" | "science";
export interface MissionStep {
  id: string;
  label: string;
  kind: "deliver" | "scan" | "repair" | "rescue";
  role: ShipRole;
  targetId: string;
  sourceId: string | null;
  resources: Resources;
  dependsOn: string[];
  status: "blocked" | "queued" | "assigned" | "completed";
  shipId: string | null;
  startedAt: number | null;
  completedAt: number | null;
}
export interface Attempt {
  attempt: number;
  startedAt: number;
  endedAt: number | null;
  outcome: "active" | "failed" | "completed" | "cancelled";
  reason: string | null;
}
export interface Mission {
  id: string;
  kind: MissionKind;
  label: string;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "failed"
    | "completed"
    | "cancelled";
  priority: number;
  createdAt: number;
  deadline: number;
  deadlineWindow: number;
  attempt: number;
  attempts: Attempt[];
  steps: MissionStep[];
  delivered: Resources;
  failureCode: string | null;
  message: string;
  waitTicks: number;
  lastProgress: number;
}
export interface Discovery {
  id: string;
  stationId: string;
  missionId: string;
  shipId: string;
  tick: number;
  kind: "damage" | "samples";
  quantity: number;
}
export interface Ledger {
  initial: Resources;
  generated: Resources;
  consumed: Resources;
}
export interface Fault {
  id: string;
  tick: number;
  kind: "close-lane" | "damage-lane" | "distress";
  targetId: string;
}
export interface ToolEntry {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  sources: string[];
  durationMs: number;
}
export interface DominionSnapshot {
  schemaVersion: 4;
  plannerVersion: string;
  sessionId: string;
  seed: number;
  scenario: Scenario;
  tick: number;
  worldVersion: number;
  status: "ready" | "running" | "paused" | "closed";
  strategy: Strategy;
  connected: boolean;
  stations: Station[];
  lanes: Lane[];
  ships: Ship[];
  missions: Mission[];
  discoveries: Discovery[];
  ledger: Ledger;
  faults: Fault[];
  appliedFaults: string[];
  actionIds: string[];
  commandIds: string[];
  replans: number;
  message: string;
  tools: ToolEntry[];
}
export interface DominionEvent {
  schemaVersion: 4;
  sessionId: string;
  missionId: string | null;
  attempt: number | null;
  eventId: string;
  seq: number;
  tick: number;
  wallTime: string;
  worldVersion: number;
  mode: "local-simulation";
  type: string;
  actionId: string | null;
  toolCallId: string | null;
  payload: Record<string, unknown>;
}
export type Command =
  | { type: "start" | "pause" | "resume" | "step" | "close-session" }
  | { type: "set-lane"; laneId: string; open: boolean }
  | { type: "damage-lane"; laneId: string }
  | { type: "set-all-lanes"; open: boolean }
  | { type: "set-priority"; missionId: string; priority: number }
  | { type: "set-strategy"; strategy: Strategy; sourceKey?: string }
  | {
      type: "add-mission";
      kind: MissionKind;
      targetId?: string;
      quantity?: number;
      deadline?: number;
    }
  | { type: "cancel-mission" | "retry-mission"; missionId: string }
  | { type: "distress"; shipId: string }
  | { type: "rescue"; shipId: string }
  | { type: "hold-dock"; stationId: string; berths: number }
  | { type: "return-cargo"; shipId: string }
  | { type: "set-connection"; connected: boolean };
export interface CommandResult {
  accepted: boolean;
  duplicate: boolean;
  message: string;
}
export interface CommandRecord {
  id: string;
  command: Command;
  accepted: boolean;
  tick: number;
  stateKey: string;
}
export interface DominionRecording {
  schemaVersion: 4;
  plannerVersion: string;
  initial: DominionSnapshot;
  commands: CommandRecord[];
  events: DominionEvent[];
  final: DominionSnapshot;
}
export interface ReplayFrame {
  snapshot: DominionSnapshot;
  eventCount: number;
  commandId: string | null;
}
export interface ValidatedRecording {
  recording: DominionRecording;
  frames: readonly ReplayFrame[];
}
export interface BranchResult {
  strategy: Strategy;
  parentSessionId: string;
  forkSeq: number;
  sourceKey: string;
  snapshot: DominionSnapshot;
  ticks: number;
  energyUsed: number;
  waitTicks: number;
  completed: number;
  failed: number;
  deadlineViolations: number;
  violations: string[];
  trace: { tick: number; shipId: string; laneId: string }[];
}
export interface DominionComparison {
  sourceKey: string;
  a: BranchResult;
  b: BranchResult;
}
export interface SceneMetrics {
  frames: number;
  p50: number;
  p95: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  pixels: number;
}
export interface RuntimeOptions {
  scenario?: Scenario;
  seed?: number;
  sessionId?: string;
  snapshot?: DominionSnapshot;
}
