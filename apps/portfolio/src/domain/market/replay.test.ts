import { describe, expect, it } from 'vitest';
import { projectPrefix, ReplayLoader, syntheticEvents, type MarketEvent } from './replay';

describe('synthetic replay prefix', () => {
  it('never consumes future quotes, volume or candle extremes', () => {
    const events = syntheticEvents('ATLAS');
    const baseline = projectPrefix(events, 4);
    const altered = events.map(event => event.seq > 4 ? { ...event, priceCents: 99999999, quantity: 90000 } : event);
    expect(projectPrefix(altered, 4)).toEqual(baseline);
    expect(baseline.applied.map(event => event.seq)).toEqual([1, 2, 3, 4]);
    expect(baseline.candles[0].closed).toBe(false);
  });
  it('stops at a gap and recovers the same canonical prefix after backfill', () => {
    const events = syntheticEvents('ATLAS');
    const broken = projectPrefix(events, 10, new Set([4]));
    expect(broken.lastSequence).toBe(3);
    expect(broken.missing).toEqual([4]);
    expect(broken.waitingCount).toBe(6);
    const recovered = projectPrefix(events, 10, new Set());
    expect(recovered.lastSequence).toBe(10);
    expect(recovered.candles.reduce((sum, candle) => sum + candle.volume, 0)).toBe(events.slice(0, 10).reduce((sum, event) => sum + event.quantity, 0));
  });
  it('discards duplicates without inflating trades or volume', () => {
    const events = syntheticEvents('LUMEN');
    const baseline = projectPrefix(events, 12);
    const repeated = projectPrefix([...events, events[4], events[4]], 12);
    expect(repeated.duplicateCount).toBe(2);
    expect(repeated.applied).toEqual(baseline.applied);
    expect(repeated.candles).toEqual(baseline.candles);
  });
  it('rewinds by recalculating, restoring candle open state and empty reset', () => {
    const events = syntheticEvents('ATLAS');
    expect(projectPrefix(events, 12).candles[0].closed).toBe(true);
    expect(projectPrefix(events, 3).candles).toHaveLength(1);
    expect(projectPrefix(events, 3).candles[0].closed).toBe(false);
    expect(projectPrefix(events, 0).lastPrice).toBeNull();
    expect(projectPrefix(events, 0).bids).toEqual([]);
  });
  it('does not change the immutable source dataset', () => {
    const events = syntheticEvents('ATLAS');
    const before = structuredClone(events);
    projectPrefix(events, 40, new Set([7, 10]));
    expect(events).toEqual(before);
  });
});

describe('symbol loading ownership', () => {
  it('aborts old requests and rejects late results even when the source ignores abort', async () => {
    const loader = new ReplayLoader();
    let oldSignal!: AbortSignal;
    let finishOld!: (events: MarketEvent[]) => void;
    const old = loader.load('ATLAS', (_, signal) => { oldSignal = signal; return new Promise(resolve => { finishOld = resolve; }); });
    const latest = loader.load('LUMEN', async () => syntheticEvents('LUMEN'));
    expect(oldSignal.aborted).toBe(true);
    expect((await latest)?.[0].symbol).toBe('LUMEN');
    finishOld(syntheticEvents('ATLAS'));
    expect(await old).toBeNull();
  });
  it('invalidates pending work on disposal and propagates genuine loading errors', async () => {
    const loader = new ReplayLoader();
    let finish!: (events: MarketEvent[]) => void;
    const pending = loader.load('ATLAS', () => new Promise(resolve => { finish = resolve; }));
    loader.cancel();
    finish(syntheticEvents('ATLAS'));
    expect(await pending).toBeNull();
    await expect(loader.load('ATLAS', async () => { throw new Error('read failed'); })).rejects.toThrow('read failed');
  });
});
