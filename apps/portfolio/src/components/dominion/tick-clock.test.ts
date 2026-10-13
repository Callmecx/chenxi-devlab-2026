import { describe, expect, it } from "vitest";
import { createTickClock } from "./tick-clock";

describe("UI tick pacing under delayed callbacks", () => {
  it.each([200, 800, 1200])(
    "keeps the same %i ms pace when callbacks arrive less often",
    (period) => {
      const countSteps = (callbackInterval: number) => {
        const clock = createTickClock(0);
        let steps = 0;
        for (let now = callbackInterval; now <= 12000; now += callbackInterval)
          if (clock.advance(now, period, true)) steps++;
        return steps;
      };

      // Both observe the same twelve seconds. Counting each callback as 50 ms
      // would incorrectly slow the delayed schedule by four times.
      expect(countSteps(50)).toBe(12000 / period);
      expect(countSteps(200)).toBe(12000 / period);
    },
  );

  it("retains fractional elapsed time across irregular callback boundaries", () => {
    const clock = createTickClock(0);
    expect(clock.advance(700, 800, true)).toBe(false);
    expect(clock.advance(950, 800, true)).toBe(true);
    expect(clock.advance(1599, 800, true)).toBe(false);
    expect(clock.advance(1600, 800, true)).toBe(true);
  });

  it("permits one step after a stall without a queued catch-up burst", () => {
    const clock = createTickClock(0);
    expect(clock.advance(6000, 1200, true)).toBe(true);
    for (let attempt = 0; attempt < 5; attempt++)
      expect(clock.advance(6000, 1200, true)).toBe(false);
    expect(clock.advance(7199, 1200, true)).toBe(false);
    expect(clock.advance(7200, 1200, true)).toBe(true);
  });

  it("discards partial time and background time while inactive", () => {
    const clock = createTickClock(0);
    expect(clock.advance(300, 800, true)).toBe(false);
    expect(clock.advance(600000, 800, false)).toBe(false);
    expect(clock.advance(600100, 800, true)).toBe(false);
    expect(clock.advance(600799, 800, true)).toBe(false);
    expect(clock.advance(600800, 800, true)).toBe(true);
  });

  it("reset starts a fresh period after a manual command or background return", () => {
    const clock = createTickClock(0);
    expect(clock.advance(750, 800, true)).toBe(false);
    clock.reset(600000);
    expect(clock.advance(600000, 800, true)).toBe(false);
    expect(clock.advance(600799, 800, true)).toBe(false);
    expect(clock.advance(600800, 800, true)).toBe(true);
  });

  it("does not count repeated or backward timestamps as elapsed time", () => {
    const clock = createTickClock(100);
    expect(clock.advance(500, 800, true)).toBe(false);
    expect(clock.advance(300, 800, true)).toBe(false);
    expect(clock.advance(799, 800, true)).toBe(false);
    expect(clock.advance(900, 800, true)).toBe(true);
    expect(clock.advance(900, 800, true)).toBe(false);
    expect(clock.advance(850, 800, true)).toBe(false);
    expect(clock.advance(1699, 800, true)).toBe(false);
    expect(clock.advance(1700, 800, true)).toBe(true);
  });
});
