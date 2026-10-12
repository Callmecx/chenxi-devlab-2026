import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base) || !base.endsWith('/')) throw new Error('Provide a full deployment base URL ending in /');
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; const externalOrigins = new Set(); const results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { const url = new URL(request.url()); if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) externalOrigins.add(url.origin); });
try {
  for (const [path, expected] of [['', '工程交付'], ['shop/', 'ShopPilot'], ['pulse/', 'Pulse']]) {
    const response = await page.goto(new URL(path, base).href);
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    if (response.status() !== 200 || !title.toLowerCase().includes(expected.toLowerCase())) throw Error(`Unexpected page at ${path}: ${response.status()} / ${title}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw Error(`Overflow at ${path}`);
    results.push({ path, status: response.status(), title });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '#/projects/shop-pilot');
  await page.getByRole('link', { name: '运行演示', exact: true }).click();
  if (!page.url().startsWith(base + 'shop/')) throw Error('Portfolio → Shop link escaped deployment base');
  await page.getByRole('button', { name: '返回作品集 ↗', exact: true }).first().click();
  if (!page.url().startsWith(base) || page.url().includes('/shop/')) throw Error('Shop return link escaped deployment base');
  for (const asset of ['evidence/TEST_REPORT.md', 'evidence/enterpriseflow-dashboard.png', 'screenshots/shop-checkout-390.png']) {
    const response = await page.request.get(new URL(asset, base).href);
    if (response.status() !== 200) throw Error(`Missing public evidence asset: ${asset}`);
    results.push({ path: asset, status: response.status() });
  }
  if (errors.length || externalOrigins.size) throw Error(JSON.stringify({ errors, externalOrigins: [...externalOrigins] }));
  await mkdir('docs/testing', { recursive: true });
  const report = { checkedAt: new Date().toISOString(), base, browser: browser.version(), result: 'PASS', pagesAndAssets: results, pageErrors: errors, externalOrigins: [...externalOrigins] };
  const name = new URL(base).hostname === '127.0.0.1' ? 'deployment-path-check.json' : 'online-smoke.json';
  await writeFile(`docs/testing/${name}`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
