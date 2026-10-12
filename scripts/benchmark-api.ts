import { createService } from "../services/demo-api/src/server.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release, totalmem } from "node:os";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

// Each invocation gets an isolated SQLite file; no real account or shared demo is measured.
mkdirSync(".local/performance", { recursive: true });
mkdirSync("docs/acceptance", { recursive: true });
const app = createService({
  filename: `.local/performance/api-${Date.now()}.sqlite`,
});
let base: string;
const samples: Record<string, number[]> = {
  shopCatalog: [],
  h5Slots: [],
  cartWrite: [],
};
let requests = 0;
async function call(
  domain: string,
  path: string,
  credential = "",
  body?: unknown,
  metric?: string,
) {
  const start = performance.now();
  const response = await fetch(`${base}/api/v1/${domain}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: "http://127.0.0.1:4176",
      "content-type": "application/json",
      "x-chenxi-app": "h5",
      "idempotency-key": randomUUID(),
      ...(domain === "shop"
        ? { authorization: `Bearer ${credential}` }
        : { cookie: credential }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  requests++;
  if (!response.ok)
    throw new Error(
      `Unexpected HTTP ${response.status}: ${result.error?.code}`,
    );
  if (metric) samples[metric]!.push(performance.now() - start);
  return {
    data: result.data,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) =>
    Number(sorted[Math.ceil(sorted.length * fraction) - 1]!.toFixed(2));
  return {
    count: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: at(1),
  };
}
try {
  base = await app.listen({ host: "127.0.0.1", port: 0 });
  const clients: Array<{
    shop: string;
    h5: string;
    version: number;
    lineId: string;
  }> = [];
  for (let i = 0; i < 10; i++) {
    const shop = (await call("shop", "/demo/session", "", {})).data
      .token as string;
    const h5 = (await call("h5", "/demo-sessions", "", {})).cookie;
    const cart = (
      await call("shop", "/cart/items", shop, {
        skuId: "book-clay",
        quantity: 1,
        cartVersion: 0,
      })
    ).data;
    clients.push({ shop, h5, version: cart.version, lineId: cart.items[0].id });
  }
  // Two batches, exactly five concurrent visitors. Warmups are excluded from samples.
  for (let batch = 0; batch < 2; batch++)
    await Promise.all(
      clients.slice(batch * 5, batch * 5 + 5).map(async (client) => {
        await call("shop", "/products", client.shop);
        await call("h5", "/routes/slow/slots", client.h5);
        for (let i = 0; i < 10; i++) {
          await call(
            "shop",
            "/products",
            client.shop,
            undefined,
            "shopCatalog",
          );
          await call(
            "h5",
            "/routes/slow/slots",
            client.h5,
            undefined,
            "h5Slots",
          );
          const cart = (
            await call(
              "shop",
              `/cart/items/${client.lineId}/update`,
              client.shop,
              { quantity: (i % 2) + 1, cartVersion: client.version },
              "cartWrite",
            )
          ).data;
          client.version = cart.version;
        }
      }),
    );
  const report = {
    measuredAt: new Date().toISOString(),
    node: process.version,
    machine: {
      os: `${platform()} ${release()}`,
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
    },
    protocol:
      "Real loopback HTTP, Node fetch, single Fastify process + SQLite WAL, five concurrent visitors, ten independent shop/H5 sessions; ten warm reads/domain excluded; one request at a time per visitor.",
    requests,
    failures: 0,
    datasets: {
      productsPerSession: 12,
      skusPerSession: 25,
      slotsPerSession: 9,
      slotsPerMeasuredRoute: 3,
    },
    metrics: Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [name, summary(values)]),
    ),
    limits: [
      "Local machine and synthetic data only; no WAN/TLS or production capacity claim.",
      "All transactions including reads persist the small session document; not a normalized multi-instance database benchmark.",
    ],
  };
  writeFileSync(
    "docs/acceptance/api-performance.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await app.close();
}
