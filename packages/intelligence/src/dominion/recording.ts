import { z } from "zod";
import { createFixture, PLANNER_VERSION, SCENARIOS } from "./fixtures";
import { clone } from "./identity";
import {
  commandSchema,
  createDominionRuntime,
  MAX_COMMANDS,
  MAX_EVENTS,
} from "./runtime";
import type {
  DominionEvent,
  DominionRecording,
  DominionSnapshot,
  ReplayFrame,
  ValidatedRecording,
} from "./types";

export const MAX_RECORDING_BYTES = 16 * 1024 * 1024;
const validated = new WeakSet<object>();
const commandRecordSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_.:-]{1,128}$/),
    command: commandSchema,
    accepted: z.boolean(),
    tick: z.number().int().min(0).max(600),
    stateKey: z.string().max(200),
  })
  .strict();

/** Reject executable accessors/prototypes/cycles before touching input properties. */
function plain(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
  budget = { count: 0 },
): void {
  if (++budget.count > 800_000 || depth > 32)
    throw Error("记录结构超过读取预算");
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw Error("记录必须为纯 JSON 数据");
  if (ancestors.has(value)) throw Error("记录包含循环结构");
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && proto !== Array.prototype)
    throw Error("记录包含不允许的原型");
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (
      typeof key !== "string" ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor"
    )
      throw Error("记录包含不允许的字段");
    if (Array.isArray(value) && key === "length") continue;
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (!("value" in property)) throw Error("记录不允许访问器");
    plain(property.value, ancestors, depth + 1, budget);
  }
  ancestors.delete(value);
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
    .join(",")}}`;
}
function normalized(snapshot: DominionSnapshot) {
  return {
    ...snapshot,
    tools: snapshot.tools.map((t) => {
      if (
        !Number.isFinite(t.durationMs) ||
        t.durationMs < 0 ||
        t.durationMs > 60_000
      )
        throw Error("工具耗时字段无效");
      return { ...t, durationMs: 0 };
    }),
  };
}
function eventFacts(event: DominionEvent) {
  if (event.type !== 'tool.completed') return { ...event, wallTime: '' };
  const elapsed = event.payload.durationMs;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 60_000) throw Error('工具事件耗时无效');
  return { ...event, wallTime: '', payload: { ...event.payload, durationMs: 0 } };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

/** Full deterministic re-execution before playback. Never executes external/model tools. */
export function validateRecording(input: unknown): ValidatedRecording {
  let candidate: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).length > MAX_RECORDING_BYTES)
      throw Error("记录超过16MiB预算");
    try {
      candidate = JSON.parse(input);
    } catch {
      throw Error("记录不是有效JSON");
    }
  }
  plain(candidate);
  if (
    new TextEncoder().encode(JSON.stringify(candidate)).length >
    MAX_RECORDING_BYTES
  )
    throw Error("记录超过16MiB预算");
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    throw Error("记录格式无效");
  const value = candidate as DominionRecording;
  if (value.schemaVersion !== 4)
    throw Error(
      "不是V4记录。V3记录请在「V3历史版本」中只读查看，不能迁移为当前世界。",
    );
  if (
    Object.keys(value).sort().join(",") !==
      "commands,events,final,initial,plannerVersion,schemaVersion" ||
    value.plannerVersion !== PLANNER_VERSION
  )
    throw Error("记录字段或规划器版本不兼容");
  if (
    !value.initial ||
    !SCENARIOS.includes(value.initial.scenario) ||
    !Number.isSafeInteger(value.initial.seed) ||
    value.initial.seed < 0 ||
    value.initial.seed > 2147483647 ||
    !/^[a-zA-Z0-9_.:-]{1,64}$/.test(value.initial.sessionId)
  )
    throw Error("初始场景/种子/会话无效");
  const initial = createFixture(
    value.initial.scenario,
    value.initial.seed,
    value.initial.sessionId,
  );
  if (canonical(value.initial) !== canonical(initial))
    throw Error("初始世界不是此版本的标准场景，拒绝伪造库存、发现或动作");
  if (
    !Array.isArray(value.commands) ||
    value.commands.length > MAX_COMMANDS ||
    !Array.isArray(value.events) ||
    value.events.length > MAX_EVENTS
  )
    throw Error("记录命令/事件预算无效");
  const runtime = createDominionRuntime({ snapshot: initial });
  const frames: ReplayFrame[] = [
    { snapshot: runtime.snapshot, eventCount: 0, commandId: null },
  ];
  for (const entry of value.commands) {
    const parsed = commandRecordSchema.safeParse(entry);
    if (!parsed.success) throw Error("命令记录不符合严格契约");
    const result = runtime.dispatch(parsed.data.command, entry.id);
    const actual = runtime.exportRecording().commands.at(-1);
    if (result.duplicate || canonical(actual) !== canonical(entry))
      throw Error("命令重复、迟到或对应世界状态被篡改");
    frames.push({
      snapshot: runtime.snapshot,
      eventCount: runtime.events.length,
      commandId: entry.id,
    });
  }
  const actual = runtime.exportRecording();
  if (value.events.length !== actual.events.length)
    throw Error("事件序列缺失或多出");
  for (let i = 0; i < value.events.length; i++) {
    const event = value.events[i];
    if (
      !event ||
      typeof event.wallTime !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(event.wallTime) ||
      !Number.isFinite(Date.parse(event.wallTime))
    )
      throw Error("事件时间字段无效");
    if (
      canonical(eventFacts(event)) !== canonical(eventFacts(actual.events[i]))
    )
      throw Error(`事件${i + 1}未通过实际动作重演校验`);
  }
  if (
    !value.final ||
    !Array.isArray(value.final.tools) ||
    canonical(normalized(value.final)) !== canonical(normalized(actual.final))
  )
    throw Error("最终世界未通过资源、位置、归属及终态重演校验");
  // Replay shows the original measured tool latency, never the validator's
  // re-execution timing. Full events retain latency after the 40-tool UI window.
  const durations = new Map(value.events.filter(e => e.type === 'tool.completed').map(e => [e.toolCallId, Number(e.payload.durationMs)]));
  for (const tool of value.final.tools) if (durations.get(tool.id) !== tool.durationMs) throw Error('工具耗时与原事件记录不一致');
  for (const frame of frames) for (const tool of frame.snapshot.tools) {
    const duration = durations.get(tool.id);
    if (duration === undefined) throw Error('回放工具缺少原始事件依据');
    tool.durationMs = duration;
  }
  const result = freeze({ recording: clone(value), frames });
  validated.add(result);
  return result;
}
/** Seeking only projects previously validated immutable frames; it cannot run a tool. */
export function replayFrame(
  recording: ValidatedRecording,
  index: number,
): ReplayFrame {
  if (
    !validated.has(recording) ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= recording.frames.length
  )
    throw Error("回放句柄或帧序号无效");
  return recording.frames[index];
}
