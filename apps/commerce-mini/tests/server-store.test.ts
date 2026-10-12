import { afterEach, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSelect } from "../src/v2/store";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps a connecting session owned by its generation and permits later mode changes", async () => {
  setActivePinia(createPinia());
  vi.stubEnv("VITE_SHOP_API_BASE", "https://demo.invalid/api/v1/shop");
  type Reply = { statusCode: number; data: unknown };
  let release: (value: Reply) => void = () => {};
  const values = new Map<string, string>();
  const reply = (data: unknown): Reply => ({
    statusCode: 200,
    data: { data, requestId: "test", serverTime: "2026-10-12T12:00:00Z" },
  });
  vi.stubGlobal("uni", {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: string) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key),
    request: (options: { url: string; success: (response: Reply) => void }) => {
      if (options.url.endsWith("/demo/session")) {
        release = options.success;
        return;
      }
      options.success(
        reply(options.url.endsWith("/cart") ? { version: 0, items: [] } : []),
      );
    },
  });
  const store = useSelect();
  const connecting = store.setMode("server");
  expect(store.loading).toBe(true);
  await store.setMode("local");
  expect(store.mode).toBe("server");
  release(
    reply({
      token: "test-session",
      expiresAt: "2099-01-01T00:00:00Z",
      mode: "server-demo",
      ruleVersion: "v2",
    }),
  );
  await connecting;
  expect(store.loading).toBe(false);
  expect(store.connected).toBe(true);
  await store.setMode("local");
  expect(store.mode).toBe("local");
  await store.setMode("server");
  expect(store.loading).toBe(false);
  expect(store.connected).toBe(true);
});
