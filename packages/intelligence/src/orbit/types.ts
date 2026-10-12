/** V3 shared integration contract. Only the runtime mutates simulation facts. */
export type OrbitStrategy = "time" | "energy";
export type OrbitStatus =
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";
export type OrbitScenario =
  | "normal"
  | "detour"
  | "sealed"
  | "scarce"
  | "low-energy";
export type OrbitCamera =
  | "overview"
  | "focused-object"
  | "mission"
  | "engineering"
  | "comparison";
export interface OrbitSelection {
  kind: "station" | "carrier" | "lane";
  id: string;
}
export interface OrbitStation {
  id: string;
  label: string;
  kind: "port" | "resource" | "relay" | "target";
  position: [number, number, number];
  stock: number;
  reserved: number;
  dockCapacity: number;
}
export interface OrbitLane {
  id: string;
  from: string;
  to: string;
  bidirectional: boolean;
  open: boolean;
  distance: number;
  ticks: number;
  energy: number;
  capacity: number;
}
export interface OrbitTransit {
  laneId: string;
  from: string;
  to: string;
  elapsed: number;
  duration: number;
}
export interface OrbitCarrier {
  id: string;
  label: string;
  capacity: number;
  energy: number;
  initialEnergy: number;
  nodeId: string;
  transit: OrbitTransit | null;
  cargo: number;
  reserved: number;
  sourceId: string | null;
  route: string[];
  planVersion: number;
  status:
    | "idle"
    | "moving"
    | "loading"
    | "delivering"
    | "waiting"
    | "done"
    | "failed";
  delivered: number;
  waitTicks: number;
  totalWait: number;
  priority: number;
}
export interface OrbitTask {
  id: string;
  label: string;
  quantity: number;
  targetId: string;
  delivered: number;
  initialStock: number;
  deadline: number;
}
export interface OrbitToolStep {
  id: string;
  label: string;
  tool: string;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  output: unknown;
  sources: string[];
  durationMs: number;
}
export interface OrbitFault {
  tick: number;
  laneId: string;
  open: boolean;
}
export interface OrbitSnapshot {
  schemaVersion: 3;
  plannerVersion: string;
  runId: string;
  seed: number;
  worldVersion: number;
  simTick: number;
  status: OrbitStatus;
  strategy: OrbitStrategy;
  stations: OrbitStation[];
  lanes: OrbitLane[];
  carriers: OrbitCarrier[];
  task: OrbitTask;
  message: string;
  failureCode: string | null;
  tools: OrbitToolStep[];
  actionIds: string[];
  replans: number;
  faults: OrbitFault[];
  appliedFaults: number[];
}
export interface OrbitEvent {
  runId: string;
  eventId: string;
  seq: number;
  type: string;
  mode: "local-simulation";
  simTick: number;
  wallTime: string;
  worldVersion: number;
  payload: Record<string, unknown>;
  snapshot: OrbitSnapshot;
}
export interface OrbitRecording {
  schemaVersion: 3;
  plannerVersion: string;
  seed: number;
  initial: OrbitSnapshot;
  events: OrbitEvent[];
}
export interface OrbitBranch {
  strategy: OrbitStrategy;
  parentRunId: string;
  forkSeq: number;
  sourceKey: string;
  snapshot: OrbitSnapshot;
  ticks: number;
  energyUsed: number;
  waitTicks: number;
  violations: string[];
  trace: { tick: number; carrierId: string; laneId: string }[];
}
export interface OrbitComparison {
  sourceKey: string;
  time: OrbitBranch;
  energy: OrbitBranch;
}
export interface OrbitMetrics {
  frames: number;
  p50: number;
  p95: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  pixels: number;
}
