import { readFile, writeFile, mkdir } from "node:fs/promises";
const raw = JSON.parse(
  await readFile(".local/e2e/playwright-results.json", "utf8"),
);
const cases = [];
const lifecycle = [];
function visit(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        cases.push({
          file: spec.file,
          title: spec.title,
          status: test.status,
          results: test.results.map((r) => ({
            status: r.status,
            durationMs: r.duration,
            retry: r.retry,
          })),
        });
        if (spec.file.endsWith('dominion-lifecycle.spec.ts')) {
          const ledgers = test.results.flatMap(r => (r.attachments || []).filter(a => a.contentType === 'application/json' && /^(navigation|camera|scenario|import-replay-live|reset)-10-round-resource-ledger$/.test(a.name)));
          for (const attachment of ledgers) {
            const ledger = JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
            lifecycle.push({ title: spec.title, status: test.status, ...ledger });
          }
        }
      }
    }
    visit(suite.suites);
  }
}
visit(raw.suites);
const report = {
  source:
    "Actual Playwright run; sanitized summary. Raw traces and videos remain in ignored local storage; excluded from public CI artifacts.",
  generatedAt: new Date().toISOString(),
  stats: raw.stats,
  cases,
};
await mkdir("docs/testing", { recursive: true });
await writeFile(
  "docs/testing/playwright-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (cases.some(c => c.file.endsWith('dominion-lifecycle.spec.ts'))) {
  let build = null;
  try { build = JSON.parse(await readFile('dist/build-meta.json', 'utf8')); } catch { /* Keep missing metadata explicit. */ }
  await mkdir('docs/intelligence-lab-v4', { recursive: true });
  await writeFile('docs/intelligence-lab-v4/lifecycle.json', JSON.stringify({
    source: 'Actual transparent browser platform counters; only the five explicitly named resource ledgers are published. No traces, cookies, storage or screenshots are copied by this summary.',
    generatedAt: new Date().toISOString(), build,
    complete: lifecycle.length === 5 && lifecycle.every(x => x.status === 'expected' && x.rounds === 10 && x.samples.length === 10),
    ledgers: lifecycle,
  }, null, 2) + '\n');
}
console.log(
  `${cases.length} browser cases; expected ${raw.stats.expected}, unexpected ${raw.stats.unexpected}, skipped ${raw.stats.skipped}.`,
);
if (raw.stats.unexpected || raw.stats.skipped || raw.stats.flaky)
  process.exitCode = 1;
