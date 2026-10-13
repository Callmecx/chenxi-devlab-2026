export * from "./types";
export * from "./fixtures";
export * from "./runtime";
export * from "./planner";
export * from "./invariants";
export * from "./identity";
export * from "./comparison";
export * from "./recording";
export { validateRecording as validateDominionRecording } from "./recording";
import { compareStrategies } from "./comparison";
import type { DominionSnapshot, Strategy } from "./types";
export const compareDominion = (
  snapshot: DominionSnapshot,
  forkSeq: number,
  a: Strategy,
  b: Strategy,
) => compareStrategies(snapshot, a, b, forkSeq);
