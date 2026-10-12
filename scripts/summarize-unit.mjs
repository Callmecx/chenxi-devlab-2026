import { readFile, writeFile, mkdir } from "node:fs/promises";
import { relative } from "node:path";
const raw = JSON.parse(
  await readFile(".local/testing/vitest-results.json", "utf8"),
);
const report = {
  source:
    "Actual Vitest run; sanitized result without absolute paths or failure payloads.",
  generatedAt: new Date().toISOString(),
  startTime: new Date(raw.startTime).toISOString(),
  total: raw.numTotalTests,
  passed: raw.numPassedTests,
  failed: raw.numFailedTests,
  skipped: raw.numPendingTests,
  todo: raw.numTodoTests,
  success: raw.success,
  files: raw.testResults.map((file) => ({
    file: relative(process.cwd(), file.name).replaceAll("\\", "/"),
    status: file.status,
    tests: file.assertionResults.map((test) => ({
      title: test.fullName,
      status: test.status,
      durationMs: test.duration,
    })),
  })),
};
await mkdir("docs/testing", { recursive: true });
await writeFile(
  "docs/testing/vitest-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${report.passed}/${report.total} unit and API tests; skipped ${report.skipped}, failed ${report.failed}.`,
);
if (!report.success || report.failed || report.skipped || report.todo)
  process.exitCode = 1;
