import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { cpus, platform, release } from 'node:os';

const output = resolve(process.env.DOMINION_PERF_OUTPUT || '.local/v4/performance');
const configurations = [
  { version: 'V3', root: resolve('.local/v4/baseline/production-dist'), port: 4195, canvas: '[data-orbit-canvas]', lab: 'orbit-lab', start: '开始补给任务', settings: '任务设置' },
  { version: 'V4', root: resolve('dist'), port: 4194, canvas: '[data-dominion-canvas]', lab: 'dominion-lab', start: '启动远征', settings: '世界设置' },
];
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
async function serve(config) {
  const meta = JSON.parse(await readFile(resolve(config.root, 'build-meta.json'), 'utf8'));
  if (meta.sourceTreeDirty) throw Error(`${config.version} performance evidence requires a clean source build`);
  if (config.version === 'V4' && process.env.EXPECTED_REVISION && meta.sourceRevision !== process.env.EXPECTED_REVISION) throw Error('V4 build does not match EXPECTED_REVISION');
  const base = meta.basePath || '/';
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.startsWith(base)) throw Error('wrong base');
      let file = resolve(config.root, '.' + '/' + path.slice(base.length));
      if (file !== config.root && !file.startsWith(config.root + sep)) throw Error('path escaped');
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((yes, no) => { server.once('error', no); server.listen(config.port, '127.0.0.1', yes); });
  return { server, meta, url: `http://127.0.0.1:${config.port}${base}` };
}
const percentile = (list, p) => list.length ? [...list].sort((a,b) => a-b)[Math.min(list.length-1, Math.floor(list.length*p))] : null;
const servers = [], samples = [];
let browser;
await mkdir(output, { recursive: true });
try {
  for (const config of configurations) servers.push(await serve(config));
  browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const systemSession = await browser.newBrowserCDPSession();
  let gpu;
  try { const info = (await systemSession.send('SystemInfo.getInfo')).gpu; gpu = { devices: info.devices, glRenderer: info.auxAttributes?.glRenderer, glVendor: info.auxAttributes?.glVendor }; } catch { gpu = 'unavailable'; }
  await systemSession.detach();
  // Alternate versions under identical host, CSS size, DPR, active task,
  // prewarm and sample duration. V4 has the required larger world and two
  // default missions; it is not represented as an equal-workload microbenchmark.
  for (const width of [1440, 390]) for (let run = 1; run <= 3; run++) for (let i = 0; i < configurations.length; i++) {
    const config = configurations[i], served = servers[i];
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage(), errors = [], responses = [], qualityChanges = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('response', r => { if (r.status() >= 400) responses.push({ status: r.status(), url: r.url() }); });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.addInitScript(() => { window.__coldLongTasks = []; new PerformanceObserver(list => window.__coldLongTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true }); });
      await page.goto(new URL('#/intelligence', served.url).href);
      await expect(page.getByRole('button', { name: config.start, exact: true })).toBeEnabled();
      const controlsReadyMs = await page.evaluate(() => performance.now());
      const canvas = page.locator(config.canvas), lab = page.getByTestId(config.lab);
      await expect(canvas).toBeVisible();
      await expect.poll(async () => Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(0);
      const firstObservedSceneMs = await page.evaluate(() => performance.now());
      const coldLoad = await page.evaluate(() => ({ cutoffMs: performance.now(), longTasks: [...window.__coldLongTasks], resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, initiatorType: r.initiatorType, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: r.duration })) }));
      await expect.poll(async () => Number(await canvas.getAttribute('data-frames')), { timeout: 30000 }).toBeGreaterThanOrEqual(100);
      const prewarmEndMs = await page.evaluate(() => performance.now());
      await page.getByRole('button', { name: config.settings, exact: true }).click();
      await page.getByRole('combobox', { name: '设置运行速度', exact: true }).selectOption('0.5');
      await page.getByRole('button', { name: '关闭面板', exact: true }).click();
      await page.getByRole('button', { name: config.start, exact: true }).click();
      const startedTick = Number(await lab.getAttribute('data-tick'));
      const timing = await page.evaluate(({ selector, labId }) => new Promise(resolve => {
        const raf = [], rendered = [], longTasks = [], qualityChanges = [];
        let last = 0, lastDraw = 0, drawCount = -1, handle, lastQuality;
        const begin = performance.now();
        const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))));
        observer.observe({ type: 'longtask', buffered: false });
        function frame(now) {
          if (last) raf.push(now-last); last = now;
          const c = document.querySelector(selector), count = Number(c?.dataset.frames ?? '-1');
          if (c && count !== drawCount) { if (lastDraw) rendered.push(now-lastDraw); lastDraw = now; drawCount = count; }
          const quality = c?.dataset.quality || (c ? 'standard' : '2d-fallback');
          if (quality !== lastQuality) { qualityChanges.push({ atMs: now-begin, quality }); lastQuality = quality; }
          handle = requestAnimationFrame(frame);
        }
        handle = requestAnimationFrame(frame);
        setTimeout(() => {
          cancelAnimationFrame(handle); observer.disconnect();
          const c = document.querySelector(selector), node = document.querySelector(`[data-testid="${labId}"]`);
          resolve({ raf, rendered, longTasks, qualityChanges, actualWindowMs: performance.now()-begin, canvas: c ? { width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight, dataset: { ...c.dataset } } : null, tick: Number(node?.dataset.tick), status: node?.dataset.status });
        }, 10000);
      }), { selector: config.canvas, labId: config.lab });
      const loading = await page.evaluate(() => ({ longTasks: window.__coldLongTasks, resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, initiatorType: r.initiatorType, transferSize: r.transferSize, encodedBodySize: r.encodedBodySize, decodedBodySize: r.decodedBodySize, duration: r.duration })) }));
      qualityChanges.push(...timing.qualityChanges);
      const sample = { version: config.version, width, run, source: served.meta, controlsReadyMs, firstObservedSceneMs, prewarmEndMs, prewarm: 'at least 100 actual renderer frames; bounded 30-second wait', defaultQuality: config.version === 'V4' ? 'balanced with measured slow-frame fallback' : 'standard (mobile viewport capped at 30Hz)', startedTick, timing: { ...timing, raf: { count: timing.raf.length, p50: percentile(timing.raf, .5), p95: percentile(timing.raf, .95) }, rendered: { count: timing.rendered.length, p50: percentile(timing.rendered, .5), p95: percentile(timing.rendered, .95) } }, qualityChanges, coldLoad, loadingThroughSampleEnd: loading, errors, failedResponses: responses };
      samples.push(sample); await writeFile(resolve(output, 'samples.partial.json'), JSON.stringify(samples, null, 2)+'\n');
      if (errors.length || responses.length || timing.tick <= startedTick || timing.status !== 'running') throw Error(`Invalid performance workload: ${JSON.stringify(sample)}`);
      console.log(`${config.version} ${width}px #${run}: controls ${controlsReadyMs.toFixed(0)}ms scene ${firstObservedSceneMs.toFixed(0)}ms; renderer p95 ${sample.timing.rendered.p95?.toFixed(1)}ms; ${timing.longTasks.length} long tasks; tick ${timing.tick}`);
    } finally { await context.close(); }
  }
  for (let i = 0; i < configurations.length; i++) if (JSON.stringify(JSON.parse(await readFile(resolve(configurations[i].root, 'build-meta.json'), 'utf8'))) !== JSON.stringify(servers[i].meta)) throw Error('A production build changed during performance capture');
  const result = { measuredAt: new Date().toISOString(), browser: browser.version(), host: { platform: platform(), release: release(), cpu: cpus()[0]?.model, logicalCores: cpus().length, gpu }, dpr: 1, samples, limitations: ['Real headless Chrome on one desktop, phone-sized viewport is not a phone GPU.', 'Controls-ready and first observed draw are reproducible cold-load proxies, not Lighthouse interactive/TBT metrics. coldLoad stops at observed first draw; the separately named loadingThroughSampleEnd includes the whole test.', 'Static localhost server sends uncompressed files with cache disabled. Report actual transfer and decoded bytes; do not present as Internet latency.', 'RAF and renderer-frame-counter intervals are wall-clock measurements, not GPU timestamps. Adapter list alone does not prove hardware acceleration; glRenderer is recorded separately.', 'Each version uses its actual default task workload: V3 two carriers; V4 six ships and two dependent missions. V3 mobile defaults to 30Hz; V4 balanced targets 60Hz before measured fallback. Actual canvas dimensions are recorded; no equal-workload, equal-area or equal-FPS speedup claim.'] };
  await writeFile(resolve(output, 'performance.json'), JSON.stringify(result, null, 2)+'\n');
} finally {
  await browser?.close();
  for (const { server } of servers) await new Promise(done => server.close(done));
}
