import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, release } from "node:os";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = new URL(process.env.LH_BASE_URL || "http://127.0.0.1:4177/");
if (!["127.0.0.1", "localhost"].includes(base.hostname))
  throw new Error("This local acceptance script only measures loopback URLs.");
if (base.search || base.hash || !base.pathname.endsWith("/"))
  throw new Error("LH_BASE_URL must end in / and contain no search/hash.");
const cases = [
  { id: "home-mobile", label: "首页 / mobile", route: "#/", device: "mobile" },
  {
    id: "home-desktop",
    label: "首页 / desktop",
    route: "#/",
    device: "desktop",
  },
  {
    id: "enterprise-mobile",
    label: "EnterpriseFlow 静态案例 / mobile",
    route: "#/projects/enterprise-flow",
    device: "mobile",
    heading: "EnterpriseFlow",
  },
  {
    id: "lab-mobile",
    label: "智能演化 Lab 默认 2D / mobile",
    route: "#/intelligence",
    device: "mobile",
    heading: "在行动中演化",
    labMode: "default-2d",
  },
  {
    id: "h5-mobile",
    label: "蓉城周末 Lab 默认本地入口 / mobile",
    route: "pulse/#/",
    device: "mobile",
    localMode: true,
  },
  {
    id: "shop-mobile",
    label: "巷集 Select 默认本地入口 / mobile",
    route: "shop/#/pages/index/index",
    device: "mobile",
    localMode: true,
  },
].map((item) => ({ ...item, url: new URL(item.route, base).href }));
const repetitions = 3;
if (process.argv.includes("--plan")) {
  console.log(
    JSON.stringify(
      { base: base.href, repetitions, runs: cases.length * repetitions, cases },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (process.argv.some((arg, index) => index > 1 && arg !== "--run"))
  throw new Error("Supported arguments: --plan or --run.");
if (!process.argv.includes("--run"))
  throw new Error(
    "Use --plan to inspect, then --run to start all 18 sequential measurements.",
  );

const startedAt = new Date().toISOString();
const sessionId = startedAt.replace(/[:.]/g, "-");
const sessionDir = resolve(root, ".local/performance", sessionId);
const tempDir = resolve(sessionDir, "temp");
await mkdir(tempDir, { recursive: true });
process.env.TEMP = tempDir;
process.env.TMP = tempDir;
process.env.TMPDIR = tempDir;

// Load Chrome tooling after configuring temporary paths; never use a personal profile.
const [{ default: lighthouse }, { launch }, { default: puppeteer }, constants] =
  await Promise.all([
    import("lighthouse"),
    import("chrome-launcher"),
    import("puppeteer-core"),
    import("lighthouse/core/config/constants.js"),
  ]);
const versions = JSON.parse(
  await readFile(resolve(root, "node_modules/lighthouse/package.json"), "utf8"),
);
const settings = Object.fromEntries(
  ["mobile", "desktop"].map((device) => [
    device,
    {
      formFactor: device,
      throttlingMethod: "simulate",
      throttling: {
        ...(device === "mobile"
          ? constants.throttling.mobileSlow4G
          : constants.throttling.desktopDense4G),
      },
      screenEmulation: {
        mobile: device === "mobile",
        width: device === "mobile" ? 390 : 1440,
        height: device === "mobile" ? 844 : 900,
        deviceScaleFactor: 1,
        disabled: false,
      },
      emulatedUserAgent: constants.userAgents[device],
      onlyCategories: ["performance", "accessibility"],
      locale: "en-US",
      disableStorageReset: false,
      maxWaitForFcp: 30000,
      maxWaitForLoad: 45000,
    },
  ]),
);
const localPath = (path) => relative(root, path).replaceAll("\\", "/");
async function distFingerprint() {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (
        entry.isFile() &&
        /\.(?:html|css|js|json|woff2?)$/.test(entry.name)
      )
        files.push(path);
    }
  }
  await walk(resolve(root, "dist"));
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(localPath(file));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return { sha256: hash.digest("hex"), fileCount: files.length };
}
function gitRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}
function aggregate(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length
    ? {
        median: sorted[Math.floor(sorted.length / 2)],
        min: sorted[0],
        max: sorted.at(-1),
        samples: sorted.length,
      }
    : null;
}
function nodeHints(details) {
  const hints = [];
  function walk(value, depth = 0) {
    if (!value || typeof value !== "object" || depth > 7 || hints.length >= 8)
      return;
    if (value.type === "node")
      hints.push({
        selector: value.selector,
        snippet: value.snippet?.slice(0, 300),
        explanation: value.explanation,
      });
    else for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(details);
  return hints;
}
function issuesFrom(lhr) {
  return Object.entries(lhr.categories).flatMap(([category, data]) =>
    data.auditRefs.flatMap((ref) => {
      const audit = lhr.audits[ref.id];
      if (
        !audit ||
        !(
          (typeof audit.score === "number" && audit.score < 1) ||
          audit.scoreDisplayMode === "error"
        )
      )
        return [];
      return [
        {
          category,
          id: ref.id,
          title: audit.title,
          score: audit.score,
          weight: ref.weight,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue,
          scoreDisplayMode: audit.scoreDisplayMode,
          errorMessage: audit.errorMessage,
          nodes: nodeHints(audit.details),
        },
      ];
    }),
  );
}
const initialDist = await distFingerprint();
const health = await fetch(base, { signal: AbortSignal.timeout(10000) });
if (!health.ok)
  throw new Error(`Production preview unavailable: ${health.status}`);
const runs = [];
let index = 0;
for (const target of cases) {
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    index++;
    const name = `${target.id}-${repetition}`;
    const entry = {
      id: name,
      caseId: target.id,
      repetition,
      requestedUrl: target.url,
      startedAt: new Date().toISOString(),
      status: "failed",
    };
    let chrome;
    let browser;
    console.log(`[${index}/18] ${name} ${target.url}`);
    try {
      const profile = resolve(sessionDir, "profiles", name);
      await mkdir(profile, { recursive: true });
      chrome = await launch({
        chromePath:
          process.env.CHROME_PATH ||
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
        userDataDir: profile,
        chromeFlags: [
          "--headless=new",
          "--no-first-run",
          "--no-default-browser-check",
        ],
        envVars: {
          ...process.env,
          TEMP: tempDir,
          TMP: tempDir,
          TMPDIR: tempDir,
        },
        logLevel: "error",
      });
      browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${chrome.port}`,
      });
      const page = await browser.newPage();
      const result = await lighthouse(
        target.url,
        { port: chrome.port, logLevel: "error", output: ["json", "html"] },
        { extends: "lighthouse:default", settings: settings[target.device] },
        page,
      );
      if (!result) throw new Error("Lighthouse returned no result.");
      const jsonPath = resolve(sessionDir, `${name}.json`);
      const htmlPath = resolve(sessionDir, `${name}.html`);
      await writeFile(jsonPath, JSON.stringify(result.lhr, null, 2));
      const reports = Array.isArray(result.report)
        ? result.report
        : [result.report];
      const html = reports.find(
        (report) =>
          report.trimStart().startsWith("<!") ||
          report.trimStart().startsWith("<html"),
      );
      if (!html)
        throw new Error(
          "Lighthouse did not generate the requested HTML report.",
        );
      await writeFile(htmlPath, html);
      entry.raw = { json: localPath(jsonPath), html: localPath(htmlPath) };
      const lhr = result.lhr;
      entry.finalDisplayedUrl = lhr.finalDisplayedUrl;
      entry.finalUrl = lhr.finalUrl;
      entry.lighthouseVersion = lhr.lighthouseVersion;
      entry.browserUserAgent = lhr.environment?.hostUserAgent;
      entry.fetchTime = lhr.fetchTime;
      entry.warnings = lhr.runWarnings;
      entry.issues = issuesFrom(lhr);
      entry.page = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        headings: Array.from(
          document.querySelectorAll('h1,[role="heading"][aria-level="1"]'),
        )
          .map((node) => node.textContent?.replace(/\s+/g, " ").trim())
          .slice(0, 6),
        mode:
          document
            .querySelector(".wk-mode p,.select-mode-copy")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() || null,
        canvasCount: document.querySelectorAll("canvas").length,
        canEnable3D: Array.from(document.querySelectorAll("button")).some(
          (button) => button.textContent?.includes("启用 3D"),
        ),
      }));
      if (lhr.runtimeError)
        throw new Error(
          `${lhr.runtimeError.code}: ${lhr.runtimeError.message}`,
        );
      // Hash routes must be checked explicitly: HTTP 200 alone can be the wrong SPA page.
      for (const actual of [lhr.finalDisplayedUrl, entry.page.url]) {
        if (actual !== target.url)
          throw new Error(
            `URL/hash mismatch: expected ${target.url}; received ${actual}`,
          );
      }
      if (
        target.heading &&
        !entry.page.headings.some((heading) => heading.includes(target.heading))
      )
        throw new Error(`Expected page heading missing: ${target.heading}`);
      if (target.localMode && !entry.page.mode?.includes("本地演示"))
        throw new Error(
          "Expected fresh-profile local demo mode; refusing to combine service-mode results.",
        );
      if (
        target.labMode === "default-2d" &&
        (entry.page.canvasCount !== 0 || !entry.page.canEnable3D)
      )
        throw new Error(
          "Lab mobile must show its default 2D view and explicit Enable 3D control; do not label a different mode as this measurement.",
        );
      entry.metrics = {
        performance:
          lhr.categories.performance.score == null
            ? null
            : lhr.categories.performance.score * 100,
        accessibility:
          lhr.categories.accessibility.score == null
            ? null
            : lhr.categories.accessibility.score * 100,
        lcpMs: lhr.audits["largest-contentful-paint"].numericValue,
        tbtMs: lhr.audits["total-blocking-time"].numericValue,
        cls: lhr.audits["cumulative-layout-shift"].numericValue,
      };
      if (Object.values(entry.metrics).some((value) => !Number.isFinite(value)))
        throw new Error("One or more requested metrics are unavailable.");
      entry.status = "passed";
      console.log(
        `  performance=${entry.metrics.performance} accessibility=${entry.metrics.accessibility} LCP=${Math.round(entry.metrics.lcpMs)}ms TBT=${Math.round(entry.metrics.tbtMs)}ms CLS=${entry.metrics.cls}`,
      );
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED: ${entry.error}`);
    } finally {
      if (browser) await browser.disconnect().catch(() => {});
      if (chrome)
        await Promise.resolve()
          .then(() => chrome.kill())
          .catch((error) => {
            entry.cleanupWarning = String(error);
          });
      entry.finishedAt = new Date().toISOString();
      runs.push(entry);
      await writeFile(
        resolve(sessionDir, "run-manifest.json"),
        JSON.stringify(
          { startedAt, settings, cases, initialDist, runs },
          null,
          2,
        ),
      );
    }
  }
}
const finalDist = await distFingerprint();
const buildUnchanged = initialDist.sha256 === finalDist.sha256;
// Preserve interrupted earlier attempts separately; never hide or blend them into this batch.
const priorInterruptedMeasurements = [];
for (const directory of await readdir(resolve(root, ".local/performance"), {
  withFileTypes: true,
})) {
  if (!directory.isDirectory() || directory.name === sessionId) continue;
  const previous = resolve(root, ".local/performance", directory.name);
  const names = await readdir(previous);
  let interruptionReason =
    "Earlier interrupted tooling attempt without a completed manifest; retained outside this batch statistics.";
  if (names.includes("run-manifest.json")) {
    const manifest = JSON.parse(
      await readFile(resolve(previous, "run-manifest.json"), "utf8"),
    );
    if (
      manifest.runs?.length === cases.length * repetitions &&
      !manifest.interruption
    )
      continue;
    interruptionReason =
      manifest.interruption?.reason ||
      "Earlier batch stopped before all planned samples completed; retained outside this batch statistics.";
  } else if (names.includes("interruption.json")) {
    const interruption = JSON.parse(
      await readFile(resolve(previous, "interruption.json"), "utf8"),
    );
    interruptionReason = interruption.reason;
  }
  for (const name of names.filter((name) => /-\d+\.json$/.test(name))) {
    try {
      const lhr = JSON.parse(await readFile(resolve(previous, name), "utf8"));
      if (!lhr.lighthouseVersion) continue;
      priorInterruptedMeasurements.push({
        reason: interruptionReason,
        rawJson: localPath(resolve(previous, name)),
        fetchTime: lhr.fetchTime,
        url: lhr.finalDisplayedUrl,
        performance: lhr.categories.performance.score * 100,
        accessibility: lhr.categories.accessibility.score * 100,
        lcpMs: lhr.audits["largest-contentful-paint"].numericValue,
        tbtMs: lhr.audits["total-blocking-time"].numericValue,
        cls: lhr.audits["cumulative-layout-shift"].numericValue,
      });
    } catch {
      /* Unrelated files are not measurement samples. */
    }
  }
}
const groups = cases.map((target) => {
  const selected = runs.filter((run) => run.caseId === target.id);
  const valid = selected.filter((run) => run.status === "passed");
  const metrics = Object.fromEntries(
    ["performance", "accessibility", "lcpMs", "tbtMs", "cls"].map((metric) => [
      metric,
      aggregate(valid.map((run) => run.metrics[metric])),
    ]),
  );
  const issues = new Map();
  for (const run of selected)
    for (const issue of run.issues || []) {
      const key = `${issue.category}:${issue.id}`;
      const existing = issues.get(key) || {
        ...issue,
        occurrences: 0,
        runs: [],
        displayValues: [],
      };
      existing.occurrences++;
      existing.runs.push(run.id);
      if (
        issue.displayValue &&
        !existing.displayValues.includes(issue.displayValue)
      )
        existing.displayValues.push(issue.displayValue);
      issues.set(key, existing);
    }
  return {
    ...target,
    validRuns: valid.length,
    expectedRuns: repetitions,
    metrics,
    below90: ["performance", "accessibility"].filter(
      (metric) => metrics[metric] && metrics[metric].median < 90,
    ),
    allSamplesAtLeast90:
      valid.length === repetitions &&
      valid.every(
        (run) =>
          run.metrics.performance >= 90 && run.metrics.accessibility >= 90,
      ),
    issues: [...issues.values()],
  };
});
const summary = {
  schemaVersion: 1,
  startedAt,
  completedAt: new Date().toISOString(),
  scope:
    "Local production-build navigation lab measurements; not real-user monitoring, production traffic, device certification, or service-flow timing.",
  status:
    runs.every((run) => run.status === "passed") && buildUnchanged
      ? "measured"
      : "incomplete-or-invalid",
  baseUrl: base.href,
  repetitions,
  executedRuns: runs.length,
  validRuns: runs.filter((run) => run.status === "passed").length,
  target: {
    performance: 90,
    accessibility: 90,
    interpretation:
      "Median target; every run and range is retained. Partial groups cannot pass acceptance.",
  },
  environment: {
    node: process.version,
    lighthouse: versions.version,
    platform: platform(),
    release: release(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    gitRevision: gitRevision(),
    note: "Working tree may contain uncommitted changes; dist SHA-256 is the measured artifact fingerprint.",
  },
  settings,
  labMobileMode:
    "default-2d; full task controls retained, explicit 3D opt-in not measured in this navigation batch",
  build: { initial: initialDist, final: finalDist, unchanged: buildUnchanged },
  storage: {
    rawDirectory: localPath(sessionDir),
    chromeProfiles: localPath(resolve(sessionDir, "profiles")),
    temporaryDirectory: localPath(tempDir),
  },
  groups,
  runs,
  priorInterruptedMeasurements,
};
const acceptance = resolve(root, "docs/acceptance");
await mkdir(acceptance, { recursive: true });
await writeFile(
  resolve(acceptance, "lighthouse-summary.json"),
  JSON.stringify(summary, null, 2) + "\n",
);
function value(metric, digits = 0) {
  if (!metric) return "不可用";
  const n = (number) => number.toFixed(digits);
  return `${n(metric.median)} [${n(metric.min)}–${n(metric.max)}]`;
}
const lines = [
  "# Lighthouse 本机性能与可访问性报告",
  "",
  `测量开始：${startedAt}；完成：${summary.completedAt}。`,
  "",
  `状态：**${summary.status}**；实际运行 ${runs.length} 次，有效 ${summary.validRuns} 次。每个固定页面 / 设备条件计划 3 次，串行执行，不自动重跑或丢弃低分。`,
  "",
  "这是本机生产构建的导航实验测量，不是公网真实访客数据、手机实测或后端业务链路耗时。H5 与商城使用全新浏览器身份的默认本地演示入口；未预填服务端模式或把 API 业务验收成绩混入 Lighthouse。",
  "",
  "本轮手机 Lab 默认使用保留完整任务流程的二维视图，并保留一键启用 3D。脚本验证初始没有 canvas 且存在启用 3D 按钮；这里的 Lab 指标只描述默认 2D 导航，不代表启用 3D 后的加载、帧率或交互性能。首批不同构建 / 默认视图的结果保存在 LIGHTHOUSE_BEFORE.md 与 lighthouse-before.json，不覆盖或混入本轮样本。",
  "",
  "## 固定条件",
  "",
  `- Lighthouse ${versions.version}，Node ${process.version}，${platform()} ${release()}；浏览器实际版本见 JSON 的 browserUserAgent。`,
  `- 基址：${base.href}；每次新建专属 Chrome profile，使用 headless Chrome，无个人浏览器数据。`,
  "- mobile：390 × 844，DPR 1；desktop：1440 × 900，DPR 1。均使用 Lighthouse simulate；mobileSlow4G / desktopDense4G 参数完整保存在摘要 settings 中。",
  "- 仅测 performance 与 accessibility；英文审计规则。保持默认页面行为，不强制减少动画、不禁用 GPU 来改变 Lab 呈现。",
  `- 构建指纹：${initialDist.sha256}（${initialDist.fileCount} 个 HTML / JS / CSS / JSON / 字体文件）；测量期间构建${buildUnchanged ? "未变更" : "已变更，本批次不能作为同构建验收"}。`,
  `- 原始 JSON / HTML 与逐次 manifest：\`${localPath(sessionDir)}\`；Chrome profile / TEMP 同置该 D 盘工作区目录。`,
  "",
  "## 中位数与范围",
  "",
  "方括号为三次有效样本的最小值–最大值；缺少样本时明确列出，不按完整三次验收。Performance / Accessibility 目标均为中位数至少 90；范围中的低分也保留。",
  "",
  "| 页面 | 有效 / 计划 | Performance | Accessibility | LCP ms | TBT ms | CLS | 90 分目标 |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];
for (const group of groups)
  lines.push(
    `| ${group.label} | ${group.validRuns}/3 | ${value(group.metrics.performance, 1)} | ${value(group.metrics.accessibility, 1)} | ${value(group.metrics.lcpMs)} | ${value(group.metrics.tbtMs)} | ${value(group.metrics.cls, 3)} | ${group.validRuns !== 3 || !buildUnchanged ? "未形成有效验收" : group.below90.length ? `未达标：${group.below90.join("、")}` : group.allSamplesAtLeast90 ? "三次均达标" : "中位数达标，存在单次低于 90"} |`,
  );
lines.push(
  "",
  "## 路由与具体问题",
  "",
  "每次验证 Lighthouse 最终 URL、页面 URL 及 hash；Enterprise / Lab 额外校验主标题。原始文件保留完整审计详情，以下不以高总分隐藏失败项目。",
  "",
);
for (const group of groups) {
  lines.push(`### ${group.label}`, "", `实测 URL：${group.url}`, "");
  const issues = group.issues;
  if (!issues.length)
    lines.push(
      "没有返回低于满分或执行错误的类别审计；仍不代表人工可访问性验证完成。",
      "",
    );
  for (const issue of issues) {
    const hint = issue.nodes
      .map((node) => node.selector)
      .filter(Boolean)
      .slice(0, 3)
      .join("；");
    lines.push(
      `- **${issue.category} / ${issue.id}**：${issue.title}；出现 ${issue.occurrences}/3 次${issue.displayValues.length ? `；${issue.displayValues.join(" / ")}` : ""}${hint ? `；位置：\`${hint.replaceAll("`", "'")}\`` : ""}${issue.errorMessage ? `；审计错误：${issue.errorMessage}` : ""}。`,
    );
  }
  for (const run of runs.filter(
    (run) => run.caseId === group.id && run.status !== "passed",
  ))
    lines.push(`- 运行失败 ${run.id}：${run.error}`);
  const warnings = [
    ...new Set(
      runs
        .filter((run) => run.caseId === group.id)
        .flatMap((run) => run.warnings || [])
        .map((warning) =>
          typeof warning === "string" ? warning : JSON.stringify(warning),
        ),
    ),
  ];
  for (const warning of warnings) lines.push(`- Lighthouse 警告：${warning}`);
  lines.push("");
}
if (priorInterruptedMeasurements.length) {
  lines.push(
    "## 先前中断尝试（单列保留）",
    "",
    "以下真实测量在批次中断前已产生原始报告，不纳入本批三次统计，也未因低分删除。每项记录具体中断原因；需要修复真实页面问题并重建时，不将构建前后的样本混合统计。",
    "",
  );
  for (const previous of priorInterruptedMeasurements)
    lines.push(
      `- ${previous.fetchTime} ${previous.url}：Performance ${previous.performance} / Accessibility ${previous.accessibility}；LCP ${Math.round(previous.lcpMs)}ms，TBT ${Math.round(previous.tbtMs)}ms，CLS ${previous.cls}。原始 JSON：\`${previous.rawJson}\`（同名 HTML 同目录）。中断原因：${previous.reason}`,
    );
  lines.push("");
}
lines.push(
  "## 复现",
  "",
  "先构建生产资源并在独立终端启动本机预览。确保未同时运行构建、E2E 或其他性能测量。",
  "",
  "```powershell",
  "npm run build",
  "$env:PORT = '4177'",
  "npm run preview",
  "```",
  "",
  "随后在另一终端的仓库根目录运行：",
  "",
  "```powershell",
  "node scripts/measure-lighthouse.mjs --plan",
  "node scripts/measure-lighthouse.mjs --run",
  "```",
  "",
  "可通过 LH_BASE_URL 指定其他回环地址及构建基路径，通过 CHROME_PATH 指定已安装的 Chrome。脚本不安装浏览器，不调用真实模型或支付服务。每次运行生成新的原始目录并更新本报告；运行异常返回 1，完整测量存在中位数低于 90 返回 2，完整达标返回 0。",
  "",
  "模拟节流结果受本机负载和浏览器版本影响，三次范围体现本轮波动。Accessibility 分数仅含自动规则，不替代键盘、屏幕阅读器、真实设备与人工视觉验收。",
  "",
);
await writeFile(resolve(acceptance, "LIGHTHOUSE_REPORT.md"), lines.join("\n"));
console.log(
  `Summary: ${localPath(resolve(acceptance, "lighthouse-summary.json"))}`,
);
console.log(
  `Report: ${localPath(resolve(acceptance, "LIGHTHOUSE_REPORT.md"))}`,
);
process.exitCode =
  summary.status !== "measured"
    ? 1
    : groups.some((group) => group.below90.length)
      ? 2
      : 0;
