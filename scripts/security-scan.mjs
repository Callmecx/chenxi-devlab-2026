import { spawnSync } from 'node:child_process';
import { lstat, readFile, realpath, writeFile, mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';

// Findings intentionally contain locations and rule names only, never secret values.
const secretRules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['openai-style-key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['jwt-token', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
  ['credential-url', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?):\/\/[^\s:/@]{2,}:[^\s/@]{8,}@/i],
  ['wallet-mnemonic', /\b(?:mnemonic|seed[_ -]?phrase)\s*[=:]\s*["'][a-z]+(?: [a-z]+){11,23}["']/i],
  ['hardcoded-credential', /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|database[_-]?password|db[_-]?password)\s*["']?\s*[:=]\s*["'](?!demo|mock|example|placeholder|your[-_]|<|\$)[A-Za-z0-9_+/.=-]{16,}["']/i],
  ['cookie-header', /\b(?:cookie|authorization)\s*:\s*["'](?:Bearer\s+)?[A-Za-z0-9+/_.=-]{24,}["']/i],
];
const excludedDirs = new Set(['.git', 'node_modules', 'dist', '.tools', '.local', 'coverage', 'test-results', 'playwright-report', 'unpackage', '.idea', '.vscode']);
const approvedRoots = new Set(['apps', 'packages', 'docs', 'scripts', 'tests', '.github']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2']);
const forbiddenFile = /(?:^|\/)(?:\.env(?:\..+)?|id_rsa|id_ed25519|credentials(?:\.[^/]+)?|project\.private\.config\.json)$|\.(?:pem|key|p12|pfx|sqlite|sqlite3|db|dump|zip|7z|rar|exe)$/i;
const privateSource = /\.(?:java|class|jar|rs|py|pyc|xlsx|xls|parquet)$/i;
const privatePath = /\b[A-Z]:[\\/](?:Users[\\/]|PokerReplay|AIAgentWorkbench|DECU_COPYBOT|GateQuant|V23(?:_|[\\/ ])|企业级JAVA开发项目)/i;
const root = resolve(process.cwd());
const args = process.argv.slice(2);

function detect(text) {
  return secretRules.flatMap(([rule, pattern]) => {
    const match = pattern.exec(text);
    return match ? [{ rule, line: text.slice(0, match.index).split('\n').length }] : [];
  });
}

if (args.includes('--self-test')) {
  const synthetic = [
    ['github-token', 'ghp_' + 'a'.repeat(36)],
    ['openai-style-key', 'sk-proj-' + 'b'.repeat(40)],
    ['private-key', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ')],
    ['aws-access-key', 'AKIA' + 'A'.repeat(16)],
    ['wallet-mnemonic', 'mnemonic = "' + Array(12).fill('example').join(' ') + '"'],
    ['hardcoded-credential', 'api_key = "' + 'realLookingValue'.repeat(2) + '"'],
  ];
  for (const [rule, text] of synthetic) assert(detect(text).some(item => item.rule === rule), rule);
  assert.equal(detect('api_key = "demo-placeholder-value"').length, 0);
  assert.equal(detect('const apiKey = process.env.API_KEY;').length, 0);
  assert.equal(detect('github: https://github.com/Callmecx; contact: 496684212@qq.com').length, 0);
  console.log('Security scanner self-check: 6 synthetic secret types rejected; 3 safe examples accepted.');
  process.exit(0);
}

const git = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (git.status !== 0) {
  console.error('Security scan requires a Git workspace to determine publishable files.');
  process.exit(2);
}
const files = [...new Set(git.stdout.split('\0').filter(Boolean))].sort();
const findings = [];
let textFiles = 0;
let binaryAssets = 0;
for (const file of files) {
  const segments = file.replaceAll('\\', '/').split('/');
  const excluded = segments.some(segment => excludedDirs.has(segment)) || /\.log$/i.test(file);
  if (excluded) {
    // Untracked ignored files are absent already. A tracked excluded file must be removed from Git.
    findings.push({ file, rule: 'excluded-artifact-is-tracked' });
    continue;
  }
  if (segments.length > 1 && !approvedRoots.has(segments[0])) findings.push({ file, rule: 'unexpected-top-level-directory' });
  if (segments[0] === 'apps' && !['portfolio', 'campaign-h5', 'commerce-mini'].includes(segments[1])) findings.push({ file, rule: 'unexpected-application-directory' });
  if (segments[0] === 'packages' && segments[1] !== 'shared') findings.push({ file, rule: 'unexpected-package-directory' });
  if (forbiddenFile.test(file) && !/(?:^|\/)\.env\.example$/.test(file)) findings.push({ file, rule: 'private-or-binary-artifact' });
  if (privateSource.test(file)) findings.push({ file, rule: 'unapproved-legacy-source-or-data' });
  const absolute = resolve(root, file);
  let info;
  try { info = await lstat(absolute); } catch { findings.push({ file, rule: 'missing-candidate-file' }); continue; }
  if (info.isSymbolicLink()) { findings.push({ file, rule: 'symlink-not-publishable' }); continue; }
  if (!info.isFile()) continue;
  const resolvedRelative = relative(root, await realpath(absolute));
  if (isAbsolute(resolvedRelative) || resolvedRelative === '..' || resolvedRelative.startsWith(`..${sep}`)) { findings.push({ file, rule: 'file-outside-workspace' }); continue; }
  if (info.size > 10 * 1024 * 1024) { findings.push({ file, rule: 'oversized-artifact-needs-review' }); continue; }
  const content = await readFile(absolute);
  if (imageExtensions.has(extname(file).toLowerCase())) { binaryAssets += 1; continue; }
  if (content.includes(0)) { findings.push({ file, rule: 'unreviewed-binary-content' }); continue; }
  textFiles += 1;
  const text = content.toString('utf8');
  findings.push(...detect(text).map(finding => ({ file, ...finding })));
  if (file !== 'scripts/security-scan.mjs' && privatePath.test(text)) findings.push({ file, rule: 'private-local-project-path' });
}

const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Git tracked and untracked non-ignored publication candidates; no secret values included in findings.',
  result: findings.length ? 'FAIL' : 'PASS',
  candidateFiles: files.length,
  textFiles,
  binaryAssets,
  findings,
  limitations: ['Pattern scanning cannot prove absence of all secrets or private copied code.', 'Images and fonts require separate provenance and visual review.', 'Ignored local files are not publication candidates; tracked ignored artifacts are rejected.', 'Dependency vulnerabilities are reviewed separately with npm audit.'],
};
const reportIndex = args.indexOf('--report');
if (reportIndex >= 0) {
  if (!args[reportIndex + 1]) throw new Error('--report needs a relative output path');
  const target = resolve(root, args[reportIndex + 1]);
  const targetRelative = relative(root, target);
  if (isAbsolute(targetRelative) || targetRelative.startsWith('..')) throw new Error('Report must remain inside the workspace');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = findings.length ? 1 : 0;
