import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
if (!process.env.CI)
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(".local/playwright");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: ".local/e2e/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".local/e2e/playwright-results.json" }],
    ["html", { open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4176",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: { mode: "on", size: { width: 1440, height: 900 } },
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://127.0.0.1:4116/api/v1/health",
      reuseExistingServer: false,
      env: { API_PORT: "4116", DEMO_DB: ".local/e2e/demo.sqlite" },
      timeout: 30000,
    },
    {
      command: "npm run preview",
      url: "http://127.0.0.1:4176",
      reuseExistingServer: false,
      env: { PORT: "4176", API_PORT: "4116" },
      timeout: 30000,
    },
  ],
});
