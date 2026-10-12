import { readFile, writeFile, mkdir } from "node:fs/promises";
const raw = JSON.parse(
  await readFile(".local/e2e/playwright-results.json", "utf8"),
);
const cases = [];
function visit(suites) {
  for (const suite of suites || []) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || [])
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
console.log(
  `${cases.length} browser cases; expected ${raw.stats.expected}, unexpected ${raw.stats.unexpected}, skipped ${raw.stats.skipped}.`,
);
if (raw.stats.unexpected || raw.stats.skipped || raw.stats.flaky)
  process.exitCode = 1;
