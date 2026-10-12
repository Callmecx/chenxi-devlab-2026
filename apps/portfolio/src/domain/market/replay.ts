export type SymbolId = 'ATLAS' | 'LUMEN';
export interface Level { priceCents: number; quantity: number }
export interface MarketEvent {
  id: string; symbol: SymbolId; seq: number; at: number;
  priceCents: number; quantity: number; side: 'buy' | 'sell';
  bids: Level[]; asks: Level[];
}
export interface Candle {
  start: number; open: number; high: number; low: number; close: number;
  volume: number; closed: boolean;
}
export const REPLAY_START = Date.UTC(2026, 9, 12, 1, 30);
export const EVENT_COUNT = 72;

/** A fixed synthetic dataset, not a market API or a historical instrument. */
export function syntheticEvents(symbol: SymbolId): MarketEvent[] {
  const base = symbol === 'ATLAS' ? 10000 : 6400;
  const wave = [0, 8, -3, 12, 20, 7, -8, -15, -2, 16, 11, 4];
  return Array.from({ length: EVENT_COUNT }, (_, index) => {
    const seq = index + 1;
    const priceCents = base + wave[index % wave.length] * (symbol === 'ATLAS' ? 3 : 2) + Math.floor(index / 12) * 9;
    return {
      id: `${symbol}-${seq}`, symbol, seq, at: REPLAY_START + index * 1000,
      priceCents, quantity: 2 + (seq * 7) % 19, side: seq % 3 ? 'buy' : 'sell',
      bids: Array.from({ length: 5 }, (_, level) => ({ priceCents: priceCents - 2 - level * 3, quantity: 8 + (seq * 3 + level * 7) % 39 })),
      asks: Array.from({ length: 5 }, (_, level) => ({ priceCents: priceCents + 2 + level * 3, quantity: 8 + (seq * 5 + level * 11) % 39 })),
    };
  });
}

/** Always rebuild only the requested prefix. A gap blocks later state application. */
export function projectPrefix(events: readonly MarketEvent[], cursor: number, omitted: ReadonlySet<number> = new Set()) {
  const end = Math.max(0, Math.floor(cursor));
  const seen = new Set<string>();
  const bySequence = new Map<number, MarketEvent>();
  let duplicateCount = 0;
  for (const event of events) {
    if (event.seq < 1 || event.seq > end || omitted.has(event.seq)) continue;
    if (seen.has(event.id) || bySequence.has(event.seq)) { duplicateCount++; continue; }
    seen.add(event.id);
    bySequence.set(event.seq, event);
  }
  const missing: number[] = [];
  for (let seq = 1; seq <= end; seq++) if (!bySequence.has(seq)) missing.push(seq);
  const applied: MarketEvent[] = [];
  for (let seq = 1; seq <= end; seq++) {
    const event = bySequence.get(seq);
    if (!event) break;
    applied.push(event);
  }
  const candles: Candle[] = [];
  for (const event of applied) {
    const start = Math.floor((event.at - REPLAY_START) / 6000) * 6000 + REPLAY_START;
    let candle = candles.at(-1);
    if (!candle || candle.start !== start) {
      if (candle) candle.closed = true;
      candle = { start, open: event.priceCents, high: event.priceCents, low: event.priceCents, close: event.priceCents, volume: 0, closed: false };
      candles.push(candle);
    }
    candle.high = Math.max(candle.high, event.priceCents);
    candle.low = Math.min(candle.low, event.priceCents);
    candle.close = event.priceCents;
    candle.volume += event.quantity;
  }
  const last = applied.at(-1);
  return {
    applied, candles, missing, duplicateCount,
    receivedCount: bySequence.size, waitingCount: bySequence.size - applied.length,
    lastPrice: last?.priceCents ?? null, lastSequence: last?.seq ?? 0,
    bids: last?.bids ?? [], asks: last?.asks ?? [],
  };
}

export class ReplayLoader {
  private generation = 0;
  private controller?: AbortController;
  cancel() { this.generation++; this.controller?.abort(); }
  async load(symbol: SymbolId, source: (symbol: SymbolId, signal: AbortSignal) => Promise<MarketEvent[]>) {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const events = await source(symbol, controller.signal);
      return generation === this.generation && !controller.signal.aborted ? events : null;
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return null;
      throw error;
    }
  }
}

export function prepareSyntheticEvents(symbol: SymbolId, signal: AbortSignal): Promise<MarketEvent[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(syntheticEvents(symbol)); }, 450);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
