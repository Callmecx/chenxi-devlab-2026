/** UI pacing only. Each true result permits one deterministic runtime step. */
export function createTickClock(initialTime: number) {
  let previous = initialTime;
  let accumulated = 0;
  return {
    reset(now: number) {
      previous = now;
      accumulated = 0;
    },
    advance(now: number, period: number, active: boolean): boolean {
      const delta = Math.max(0, now - previous);
      previous = Math.max(previous, now);
      if (!active) {
        accumulated = 0;
        return false;
      }
      // Delayed callbacks measure monotonic time, not a fictitious 50 ms.
      // A stall may permit one step, never a burst of catch-up commands.
      accumulated += Math.min(delta, period);
      if (accumulated < period) return false;
      accumulated %= period;
      return true;
    },
  };
}
