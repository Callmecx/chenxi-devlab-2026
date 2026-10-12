import { resolve } from "node:path";
import { createService } from "./server.ts";
const port = Number(process.env.API_PORT || 4016);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid API_PORT");
const app = createService({
  filename: resolve(process.env.DEMO_DB || ".local/data/demo.sqlite"),
});
await app.listen({ port, host: "127.0.0.1" });
console.log(
  `Local demo API http://127.0.0.1:${port}/api/v1/health (SQLite, simulated business data)`,
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
