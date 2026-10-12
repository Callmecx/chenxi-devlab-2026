import { defineConfig } from '@playwright/test';

/** Optional isolated smoke suite; the root config validates the combined production build. */
export default defineConfig({
  testDir: '../../tests/e2e',
  testMatch: 'campaign.spec.ts',
  timeout: 45000,
  expect: { timeout: 8000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev --workspace @chenxi/campaign-h5',
    cwd: '../..',
    url: 'http://127.0.0.1:5175/pulse/',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
