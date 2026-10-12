import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./tests/v2",
  timeout: 45000,
  expect: { timeout: 12000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: fileURLToPath(
          new URL(
            "../../.local/evidence/client-v2/results.json",
            import.meta.url,
          ),
        ),
      },
    ],
  ],
  outputDir: "../../.local/evidence/client-v2/traces",
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
