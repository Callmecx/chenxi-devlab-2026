import { describe, expect, it } from "vitest";
import { createDominionRuntime } from "./runtime";
import {
  MAX_RECORDING_BYTES,
  replayFrame,
  validateRecording,
} from "./recording";
import { clone } from "./identity";
import type { DominionRecording, ValidatedRecording } from "./types";

function fixture() {
  const runtime = createDominionRuntime({
    scenario: "expedition",
    seed: 4217,
    sessionId: "recording-test",
  });
  runtime.dispatch({ type: "start" });
  for (let i = 0; i < 12; i++) runtime.dispatch({ type: "step" });
  runtime.dispatch({ type: "set-lane", laneId: "relay-lab", open: false });
  runtime.dispatch({ type: "set-connection", connected: false });
  runtime.dispatch({ type: "step" });
  runtime.dispatch({ type: "set-connection", connected: true });
  runtime.dispatch({ type: "resume" });
  while (runtime.snapshot.status === "running")
    runtime.dispatch({ type: "step" });
  runtime.dispatch({ type: "close-session" });
  return runtime.exportRecording();
}
describe("V4 strict isolated recordings", () => {
  it("T20 actual commands and events re-execute exactly before immutable read-only seeking", () => {
    const recording = fixture();
    const verified = validateRecording(JSON.stringify(recording));
    expect(verified.frames.length).toBe(recording.commands.length + 1);
    expect(verified.recording).toEqual(recording);
    const final = replayFrame(verified, verified.frames.length - 1);
    expect(final.snapshot).toEqual(recording.final);
    expect(final.snapshot.missions.every((m) => m.status === "completed")).toBe(
      true,
    );
    expect(final.snapshot.status).toBe("closed");
    expect(final.eventCount).toBe(recording.events.length);
    for (let i = verified.frames.length - 1; i >= 0; i--) {
      const frame = replayFrame(verified, i);
      expect(frame.eventCount).toBeLessThanOrEqual(recording.events.length);
      expect(Object.isFrozen(frame.snapshot)).toBe(true);
    }
    expect(verified.recording).toEqual(recording);
    expect(() => replayFrame({ ...verified } as ValidatedRecording, 0)).toThrow(
      "句柄",
    );
    expect(() => replayFrame(verified, -1)).toThrow("序号");
  });
  it.each([
    [
      "false delivery",
      (r: DominionRecording) => {
        r.final.missions[0].delivered.supplies++;
      },
    ],
    [
      "teleport",
      (r: DominionRecording) => {
        r.final.ships[0].nodeId = "sample";
      },
    ],
    [
      "inventory fabrication",
      (r: DominionRecording) => {
        r.initial.stations[0].stock.energy++;
        r.initial.ledger.initial.energy++;
      },
    ],
    [
      "reordered event",
      (r: DominionRecording) => {
        [r.events[2], r.events[3]] = [r.events[3], r.events[2]];
      },
    ],
    [
      "duplicate event",
      (r: DominionRecording) => {
        r.events.push(clone(r.events.at(-1)!));
      },
    ],
    [
      "missing command",
      (r: DominionRecording) => {
        r.commands.splice(4, 1);
      },
    ],
    [
      "duplicate command",
      (r: DominionRecording) => {
        r.commands.splice(4, 0, clone(r.commands[3]));
      },
    ],
    [
      "stale version",
      (r: DominionRecording) => {
        r.events[3].worldVersion++;
      },
    ],
    [
      "extra tool",
      (r: DominionRecording) => {
        r.events[3].payload.runShell = "do not execute";
      },
    ],
    [
      "early discovery",
      (r: DominionRecording) => {
        r.final.discoveries[0].tick = 0;
      },
    ],
  ])(
    "T19 rejects %s without mutating a valid active world",
    (_label, mutate) => {
      const good = fixture(),
        bad = clone(good),
        active = createDominionRuntime({ scenario: "supply" });
      const before = active.exportRecording();
      mutate(bad);
      expect(() => validateRecording(bad)).toThrow();
      expect(active.exportRecording()).toEqual(before);
      expect(validateRecording(good).recording.final).toEqual(good.final);
    },
  );
  it("T19 rejects malformed, oversized, executable, cyclic and older-version input", () => {
    expect(() => validateRecording("{")).toThrow("JSON");
    expect(() =>
      validateRecording(" ".repeat(MAX_RECORDING_BYTES + 1)),
    ).toThrow("16MiB");
    expect(() => validateRecording('{"__proto__":{"admin":true}}')).toThrow(
      "字段",
    );
    let executed = false;
    expect(() =>
      validateRecording({
        get schemaVersion() {
          executed = true;
          return 4;
        },
      }),
    ).toThrow("访问器");
    expect(executed).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => validateRecording(cycle)).toThrow("循环");
    expect(() => validateRecording({ schemaVersion: 3 })).toThrow("V3");
    expect(() => validateRecording(new Date())).toThrow("原型");
  });
  it("T23 visible tool pagination is not event truncation; full export still validates", () => {
    const r = createDominionRuntime({
      scenario: "supply",
      sessionId: "page-test",
    });
    for (let i = 0; i < 50; i++) r.dispatch({ type: "resume" });
    expect(r.snapshot.tools).toHaveLength(40);
    expect(r.events.filter((e) => e.type === "tool.completed")).toHaveLength(
      50,
    );
    expect(
      validateRecording(r.exportRecording()).recording.events,
    ).toHaveLength(100);
  });
});
