import { afterEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWeekend } from "./store";

afterEach(() => vi.unstubAllGlobals());
it("rejects a mode switch during connection without permanently locking later reconnects", async () => {
  setActivePinia(createPinia());
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  let release: (value: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const result = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        requestId: "test",
        serverTime: "2026-10-12T12:00:00Z",
      }),
    );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/demo-sessions")
        ? (await pending).clone()
        : result(
            url.endsWith("/campaigns/weekend")
              ? { id: "weekend", rulesVersion: "v2" }
              : [],
          ),
    ),
  );
  const store = useWeekend();
  const connecting = store.setMode("server");
  expect(store.loading).toBe(true);
  await store.setMode("local");
  expect(store.mode).toBe("server");
  release(result({ expiresAt: "2026-10-13T12:00:00Z", rulesVersion: "v2" }));
  await connecting;
  expect(store.loading).toBe(false);
  expect(store.connected).toBe(true);
  await store.setMode("local");
  expect(store.mode).toBe("local");
  await store.setMode("server");
  expect(store.loading).toBe(false);
  expect(store.connected).toBe(true);
});
