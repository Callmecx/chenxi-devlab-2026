import { ROW_COUNT, selectIndices, type SortOrder } from './list';
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ generation: number; query: string; sort: SortOrder }>) => void) | null; postMessage(value: unknown, transfer: Transferable[]): void };
scope.onmessage = event => {
  const started = performance.now();
  const indices = selectIndices(ROW_COUNT, event.data.query, event.data.sort);
  scope.postMessage({ generation: event.data.generation, indices, duration: performance.now() - started }, [indices.buffer]);
};
