export const ROW_COUNT = 100_000;
export const ROW_HEIGHT = 44;
export type SortOrder = 'id' | 'value-asc' | 'value-desc';
export interface DemoRow { index: number; id: string; label: string; category: string; value: number }
const categories = ['基础设施', '业务应用', '数据服务', '工程工具'];
export function rowAt(index: number): DemoRow {
  return { index, id: `LAB-${String(index + 1).padStart(6, '0')}`, label: `合成记录 ${index + 1}`, category: categories[index % categories.length], value: (index * 7919 + 173) % 100_003 };
}
export function selectIndices(count: number, query: string, sort: SortOrder): Uint32Array {
  const needle = query.trim().toLocaleLowerCase();
  const indices: number[] = [];
  for (let index = 0; index < count; index++) {
    const row = rowAt(index);
    if (!needle || `${row.id} ${row.label} ${row.category}`.toLocaleLowerCase().includes(needle)) indices.push(index);
  }
  if (sort !== 'id') indices.sort((a, b) => (sort === 'value-asc' ? 1 : -1) * (rowAt(a).value - rowAt(b).value) || a - b);
  return Uint32Array.from(indices);
}
export function visibleWindow(total: number, scrollTop: number, viewportHeight: number, overscan = 5) {
  const start = Math.max(0, Math.min(total, Math.floor(Math.max(0, scrollTop) / ROW_HEIGHT) - overscan));
  return { start, end: Math.min(total, start + Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2) };
}
/** Termination saves work; generation validation also rejects messages already queued. */
export class WorkerGeneration {
  private generation = 0;
  private current?: { terminate(): void };
  cancel() { this.generation++; this.current?.terminate(); this.current = undefined; }
  start(worker: { terminate(): void }) { this.cancel(); this.current = worker; return this.generation; }
  accepts(generation: number) { return generation === this.generation && this.current !== undefined; }
}
