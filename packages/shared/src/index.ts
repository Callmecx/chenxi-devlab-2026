/** Pure helpers. Money is always represented as integer cents. */
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError('Amount must be non-negative integer cents');
  return `¥${(cents / 100).toFixed(2)}`;
}
export function readLocal<T>(key: string, fallback: T, guard: (value: unknown) => value is T): T {
  try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null'); return guard(value) ? value : fallback; }
  catch { return fallback; }
}
export function saveLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
