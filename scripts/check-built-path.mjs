import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const base = process.env.BASE_PATH;
if (!base || !/^\/[a-zA-Z0-9_-]+\/$/.test(base))
  throw new Error(
    "Set the repository BASE_PATH before checking the built site.",
  );
const address = `http://127.0.0.1:4186${base}`;
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  stdio: "inherit",
  env: { ...process.env, PORT: "4186" },
});
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null)
      throw new Error("Deployment preview exited before becoming ready");
    try {
      ready = (await fetch(address)).ok;
    } catch {
      /* server is starting */
    }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error("Deployment preview did not become ready");
  const check = spawn(
    process.execPath,
    ["scripts/verify-deployment.mjs", address],
    { stdio: "inherit", env: process.env },
  );
  const status = await new Promise((resolve, reject) => {
    check.once("error", reject);
    check.once("exit", (code) => resolve(code));
  });
  if (status !== 0)
    throw new Error(`Deployment path browser check failed: ${status}`);
} finally {
  server.kill();
}
