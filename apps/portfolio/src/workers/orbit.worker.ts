import { compareOrbit } from "../../../../packages/intelligence/src/orbit";
import type { OrbitSnapshot } from "../../../../packages/intelligence/src/orbit/types";
self.onmessage = (
  event: MessageEvent<{ snapshot: OrbitSnapshot; seq: number }>,
) => {
  try {
    self.postMessage({
      result: compareOrbit(event.data.snapshot, event.data.seq),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "分支计算失败",
    });
  }
};
