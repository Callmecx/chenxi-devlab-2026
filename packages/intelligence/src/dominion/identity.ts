import type { DominionSnapshot } from "./types";
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Synchronous deterministic fingerprint; identity guard, not a cryptographic signature. */
export function sourceKey(snapshot: DominionSnapshot): string {
  const value = JSON.stringify({
    ...snapshot,
    tools: snapshot.tools.map((t) => ({ ...t, durationMs: 0 })),
  });
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619) >>> 0;
  return `${snapshot.sessionId}:${snapshot.worldVersion}:${snapshot.tick}:${snapshot.commandIds.length}:${hash.toString(16)}`;
}
