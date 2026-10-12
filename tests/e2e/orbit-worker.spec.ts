import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { OrbitRecording } from "../../packages/intelligence/src/orbit/types";

const lab = (page: Page) => page.getByTestId("orbit-lab");
const button = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const errors = new WeakMap<Page, string[]>();

test.use({ viewport: { width: 1440, height: 900 } });
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errors.get(page) ?? []).toEqual([]);
});

async function pausedWorld(page: Page) {
  await page.goto("/#/intelligence");
  await expect(lab(page)).toHaveAttribute("data-status", "ready");
  await button(page, "单步").click();
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  await expect(lab(page)).toHaveAttribute("data-tick", "1");
}

async function record(page: Page): Promise<OrbitRecording> {
  await button(page, "工程透视").click();
  const pending = page.waitForEvent("download");
  await button(page, "导出执行记录 JSON").click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  const data = JSON.parse(await readFile(path!, "utf8")) as OrbitRecording;
  await button(page, "关闭面板").click();
  return data;
}

async function realBranchResults(page: Page) {
  for (const strategy of ["time", "energy"]) {
    const branch = page.locator(`[data-branch="${strategy}"]`);
    await expect(branch).toBeVisible();
    await expect(branch).toContainText("补给完成");
    await expect(branch).toContainText("3/3");
    await expect(
      branch
        .locator("dl > div")
        .filter({ has: page.locator("dt", { hasText: "约束违规" }) })
        .locator("dd"),
    ).toHaveText("0");
    // Successful branches must contain computed journeys, not just completion text.
    await expect
      .poll(() =>
        branch.locator(".orbit-branch-map line[stroke-width='2.5']").count(),
      )
      .toBeGreaterThan(0);
  }
  await expect(button(page, "采用能耗策略")).toBeEnabled();
  await expect(button(page, "采用时效策略")).toBeEnabled();
}

for (const fault of ["constructor", "postMessage"] as const) {
  test(`ORBIT Worker ${fault} 同步失败保留原世界，重试使用真实 Worker 计算`, async ({
    page,
  }) => {
    // Inject only the platform failure. Later Workers use the unmodified browser
    // constructor and execute the real bundled planner; no branch result is mocked.
    await page.addInitScript(
      ({ fault }) => {
        const NativeWorker = window.Worker;
        let injected = false;
        window.Worker = new Proxy(NativeWorker, {
          construct(target, args) {
            const isOrbit = String(args[0]).includes("orbit.worker");
            if (isOrbit && !injected) {
              injected = true;
              if (fault === "constructor") {
                console.info("ORBIT_TEST_WORKER_constructor_INJECTED");
                throw new DOMException(
                  "Injected Worker construction failure",
                  "SecurityError",
                );
              }
              const instance = Reflect.construct(target, args) as Worker;
              instance.postMessage = () => {
                console.info("ORBIT_TEST_WORKER_postMessage_INJECTED");
                throw new DOMException(
                  "Injected Worker postMessage failure",
                  "DataCloneError",
                );
              };
              return instance;
            }
            return Reflect.construct(target, args) as Worker;
          },
        });
      },
      { fault },
    );
    await pausedWorld(page);
    const before = await record(page);
    const injected = page.waitForEvent("console", {
      predicate: (message) =>
        message.text() === `ORBIT_TEST_WORKER_${fault}_INJECTED`,
    });
    await button(page, "暂停并比较策略").click();
    await injected;
    await expect(page.locator(".orbit-notice")).toContainText(
      "无法启动分支计算",
    );
    await expect(page.locator(".orbit-notice")).toContainText("可重试");
    await expect(button(page, "从当前暂停快照计算")).toBeEnabled();
    await expect(page.locator("[data-branch]")).toHaveCount(0);
    await expect(lab(page)).toHaveAttribute("data-status", "paused");
    // Includes runId, source inputs, every event, resources and action IDs.
    expect(await record(page)).toEqual(before);

    const nativeWorker = page.waitForEvent("worker", {
      predicate: (worker) => worker.url().includes("orbit.worker"),
    });
    await button(page, "暂停并比较策略").click();
    expect((await nativeWorker).url()).toContain("orbit.worker");
    await realBranchResults(page);
    await expect(lab(page)).toHaveAttribute("data-status", "paused");
    await expect(lab(page)).toHaveAttribute("data-tick", "1");
    await expect(lab(page)).toHaveAttribute("data-delivered", "0");
    expect(await record(page)).toEqual(before);
  });
}

test("ORBIT 已取消 Worker 的迟到 onerror 不得终止新的真实分支计算", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    let count = 0;
    let staleWorker: Worker | undefined;
    let staleError: Worker["onerror"];
    window.Worker = new Proxy(NativeWorker, {
      construct(target, args) {
        const instance = Reflect.construct(target, args) as Worker;
        if (!String(args[0]).includes("orbit.worker")) return instance;
        count++;
        if (count === 1) {
          // Hold the first real Worker before dispatch. Capture the callback as
          // if its failure had already been queued when terminate() was called.
          instance.postMessage = () => {
            staleWorker = instance;
            staleError = instance.onerror;
          };
        } else if (count === 2) {
          const nativePost = instance.postMessage.bind(instance);
          instance.postMessage = (message: unknown) => {
            setTimeout(() => {
              if (!staleWorker || !staleError)
                throw new Error(
                  "The first Worker error callback was not captured",
                );
              staleError.call(
                staleWorker,
                new ErrorEvent("error", {
                  message: "Injected delayed error from the cancelled Worker",
                }),
              );
              console.info("ORBIT_TEST_STALE_WORKER_ERROR_DELIVERED");
            }, 0);
            // Keep this Worker pending until the stale callback has run, then
            // forward the actual snapshot to the native Worker without alterations.
            setTimeout(() => nativePost(message), 100);
          };
        }
        return instance;
      },
    });
  });
  await pausedWorld(page);
  const before = await record(page);
  const firstStarted = page.waitForEvent("worker", {
    predicate: (worker) => worker.url().includes("orbit.worker"),
  });
  await button(page, "暂停并比较策略").click();
  const first = await firstStarted;
  await expect(button(page, "正在实算两条分支…")).toBeDisabled();
  await expect(page.locator("[data-branch]")).toHaveCount(0);

  const firstClosed = first.waitForEvent("close");
  const secondStarted = page.waitForEvent("worker", {
    predicate: (worker) =>
      worker !== first && worker.url().includes("orbit.worker"),
  });
  const staleDelivered = page.waitForEvent("console", {
    predicate: (message) =>
      message.text() === "ORBIT_TEST_STALE_WORKER_ERROR_DELIVERED",
  });
  await button(page, "暂停并比较策略").click();
  await Promise.all([firstClosed, secondStarted, staleDelivered]);
  await realBranchResults(page);
  await expect(
    page.getByText("分支计算异常，当前任务保持原样，可重试。", { exact: true }),
  ).toHaveCount(0);
  await expect(lab(page)).toHaveAttribute("data-status", "paused");
  await expect(lab(page)).toHaveAttribute("data-tick", "1");
  await expect(lab(page)).toHaveAttribute("data-delivered", "0");
  expect(await record(page)).toEqual(before);
});
