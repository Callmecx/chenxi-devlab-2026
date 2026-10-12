import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
await mkdir('docs/screenshots', { recursive: true });
try {
  for (const [path, file, width, height] of [['', 'portfolio-desktop', 1440, 1000], ['shop/', 'shop-desktop', 1440, 1000], ['pulse/', 'pulse-mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(new URL(path, base).href);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `docs/screenshots/${file}.png` });
    await page.close();
  }
  console.log('Captured three actual browser showcase images.');
} finally { await browser.close(); }
