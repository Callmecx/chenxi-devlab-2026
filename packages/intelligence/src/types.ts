export type SourceMode = 'local-simulation' | 'recorded-replay' | 'server-model';
export type RunStatus = 'queued' | 'planning' | 'running' | 'waiting-approval' | 'replanning' | 'succeeded' | 'failed' | 'cancelled';
export type Preset = 'product' | 'activity' | 'warehouse';
export type Fault = 'none' | 'timeout' | 'partial' | 'failure';
export interface Point { x: number; y: number }
export interface Goal {
  preset: Preset; prompt: string; budgetCents: number; quantity: number;
  category: string; slotId: string; seed: number;
}
export interface Cargo { id: string; label: string; position: Point; delivered: boolean; priority: number }
export interface World {
  width: number; height: number; seed: number; worldVersion: number;
  obstacles: Point[]; robot: Point; target: Point; cargo: Cargo[];
  carrying: string | null; path: Point[]; moves: number; replans: number;
}
export interface PlanNode {
  id: string; title: string; tool: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'waiting-approval' | 'cancelled';
  input: Record<string, unknown>; output: unknown; sources: string[]; durationMs: number | null; attempts: number;
}
export interface LabSnapshot {
  runId: string; status: RunStatus; goal: Goal; nodes: PlanNode[]; world: World;
  message: string; result: unknown; clarification: string[]; writes: number;
}
export interface RunEvent {
  schemaVersion: 1; runId: string; eventId: string; seq: number; timestamp: string;
  sourceMode: SourceMode; type: string; stepId?: string; toolCallId?: string;
  worldVersion: number; parentEventId?: string; payload: Record<string, unknown>; snapshot: LabSnapshot;
}
export interface Recording {
  schemaVersion: 1; version: string; createdAt: string; source: string;
  input: Goal; seed: number; events: RunEvent[];
}
export interface RuntimeOptions { delayMs?: number; timeoutMs?: number; now?: () => number }

/** Public interface owned by integration. Renderer cannot execute or mutate world objects. */
export interface IntelligenceRuntime {
  snapshot: LabSnapshot; events: RunEvent[];
  plan(goal: Goal): void;
  step(): Promise<void>;
  approve(accepted: boolean): void;
  cancel(): void;
  retry(): void;
  setFault(fault: Fault): void;
  setObstacle(point: Point): void;
  moveTarget(point: Point): void;
  removeCargo(id: string): void;
  setPriority(id: string, priority: number): void;
  reset(seed?: number): void;
  exportRecording(): Recording;
}
