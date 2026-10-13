import {
  compareDominion,
  sourceKey,
} from "../../../../packages/intelligence/src/dominion";
import type {
  DominionSnapshot,
  Strategy,
} from "../../../../packages/intelligence/src/dominion/types";

interface Request {
  generation: number;
  sourceKey: string;
  forkSeq: number;
  snapshot: DominionSnapshot;
  a: Strategy;
  b: Strategy;
}
self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  try {
    if (request.sourceKey !== sourceKey(request.snapshot))
      throw new Error("分支源快照与请求版本不一致");
    const comparison = compareDominion(
      request.snapshot,
      request.forkSeq,
      request.a,
      request.b,
    );
    self.postMessage({
      generation: request.generation,
      sourceKey: request.sourceKey,
      comparison,
    });
  } catch (error) {
    self.postMessage({
      generation: request.generation,
      sourceKey: request.sourceKey,
      error: error instanceof Error ? error.message : "分支计算未完成",
    });
  }
};
