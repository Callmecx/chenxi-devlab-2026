# Lighthouse 本机性能与可访问性报告

测量开始：2026-10-12T13:33:29.190Z；完成：2026-10-12T13:35:59.718Z。

状态：**measured**；实际运行 18 次，有效 18 次。每个固定页面 / 设备条件计划 3 次，串行执行，不自动重跑或丢弃低分。

这是本机生产构建的导航实验测量，不是公网真实访客数据、手机实测或后端业务链路耗时。H5 与商城使用全新浏览器身份的默认本地演示入口；未预填服务端模式或把 API 业务验收成绩混入 Lighthouse。

本轮手机 Lab 默认使用保留完整任务流程的二维视图，并保留一键启用 3D。脚本验证初始没有 canvas 且存在启用 3D 按钮；这里的 Lab 指标只描述默认 2D 导航，不代表启用 3D 后的加载、帧率或交互性能。首批不同构建 / 默认视图的结果保存在 LIGHTHOUSE_BEFORE.md 与 lighthouse-before.json，不覆盖或混入本轮样本。

## 固定条件

- Lighthouse 13.5.0，Node v24.18.0，win32 10.0.26200；浏览器实际版本见 JSON 的 browserUserAgent。
- 基址：http://127.0.0.1:4177/；每次新建专属 Chrome profile，使用 headless Chrome，无个人浏览器数据。
- mobile：390 × 844，DPR 1；desktop：1440 × 900，DPR 1。均使用 Lighthouse simulate；mobileSlow4G / desktopDense4G 参数完整保存在摘要 settings 中。
- 仅测 performance 与 accessibility；英文审计规则。保持默认页面行为，不强制减少动画、不禁用 GPU 来改变 Lab 呈现。
- 构建指纹：65b92b6013f3e37d38760cddc758f433a3d67ea6f37a455a9ac94546e9dbf03f（48 个 HTML / JS / CSS / JSON / 字体文件）；测量期间构建未变更。
- 原始 JSON / HTML 与逐次 manifest：`.local/performance/2026-10-12T13-33-29-190Z`；Chrome profile / TEMP 同置该 D 盘工作区目录。

## 中位数与范围

方括号为三次有效样本的最小值–最大值；缺少样本时明确列出，不按完整三次验收。Performance / Accessibility 目标均为中位数至少 90；范围中的低分也保留。

| 页面                               | 有效 / 计划 | Performance         | Accessibility       | LCP ms           | TBT ms        | CLS                 | 90 分目标           |
| ---------------------------------- | ----------- | ------------------- | ------------------- | ---------------- | ------------- | ------------------- | ------------------- |
| 首页 / mobile                      | 3/3         | 89.0 [88.0–91.0]    | 100.0 [100.0–100.0] | 2152 [2126–2166] | 344 [288–375] | 0.000 [0.000–0.000] | 未达标：performance |
| 首页 / desktop                     | 3/3         | 100.0 [100.0–100.0] | 100.0 [100.0–100.0] | 448 [445–450]    | 35 [32–39]    | 0.000 [0.000–0.000] | 三次均达标          |
| EnterpriseFlow 静态案例 / mobile   | 3/3         | 95.0 [95.0–95.0]    | 100.0 [100.0–100.0] | 2476 [2473–2502] | 69 [65–89]    | 0.000 [0.000–0.000] | 三次均达标          |
| 智能演化 Lab 默认 2D / mobile      | 3/3         | 95.0 [95.0–95.0]    | 100.0 [100.0–100.0] | 2460 [2453–2468] | 29 [22–45]    | 0.000 [0.000–0.000] | 三次均达标          |
| 蓉城周末 Lab 默认本地入口 / mobile | 3/3         | 93.0 [92.0–93.0]    | 100.0 [100.0–100.0] | 2103 [2096–2123] | 246 [236–289] | 0.000 [0.000–0.000] | 三次均达标          |
| 巷集 Select 默认本地入口 / mobile  | 3/3         | 90.0 [90.0–90.0]    | 100.0 [100.0–100.0] | 3041 [3038–3046] | 8 [7–35]      | 0.000 [0.000–0.000] | 三次均达标          |

## 路由与具体问题

每次验证 Lighthouse 最终 URL、页面 URL 及 hash；Enterprise / Lab 额外校验主标题。原始文件保留完整审计详情，以下不以高总分隐藏失败项目。

### 首页 / mobile

实测 URL：http://127.0.0.1:4177/#/

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.0 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.2 s / 2.1 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；370 ms / 340 ms / 290 ms。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.0 s。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.4 s / 2.3 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；420 ms / 390 ms / 340 ms。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 38 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.router-link-active；section.section-wrap > div.projects-grid > article.project-card > a.visual-link；section.section-wrap > div.projects-grid > article.project-card > a.visual-link`。

### 首页 / desktop

实测 URL：http://127.0.0.1:4177/#/

- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 40 ms。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；90 ms / 80 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 18 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 38 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.router-link-active；section.section-wrap > div.projects-grid > article.project-card > a.visual-link；section.section-wrap > div.projects-grid > article.project-card > a.visual-link`。

### EnterpriseFlow 静态案例 / mobile

实测 URL：http://127.0.0.1:4177/#/projects/enterprise-flow

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.1 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.5 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；70 ms / 60 ms / 90 ms。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.1 s。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / image-delivery-insight**：Improve image delivery；出现 3/3 次；Est savings of 102 KiB；位置：`div.detail-body > section#project-evidence > button.screenshot-button > img`。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.5 s / 2.6 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；180 ms / 170 ms / 210 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 23 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 47 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.brand；div.detail-layout > div.detail-body > section#project-evidence > button.screenshot-button`。

### 智能演化 Lab 默认 2D / mobile

实测 URL：http://127.0.0.1:4177/#/intelligence

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.2 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.5 s。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.2 s。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.5 s。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 30 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 69 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.brand；section.il-console > div.il-stage-column > div.il-controls > button.il-play`。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 1/3 次；70 ms。

### 蓉城周末 Lab 默认本地入口 / mobile

实测 URL：http://127.0.0.1:4177/pulse/#/

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.0 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.1 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；290 ms / 250 ms / 240 ms。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 450 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.3 s / 2.2 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；340 ms / 300 ms / 290 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 26 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 55 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`section#experiences > div.session-grid > article.session-card > a.session-art-link；section#experiences > div.session-grid > article.session-card > a.session-art-link；section#experiences > div.session-grid > article.session-card > a.session-art-link`。
- **performance / speed-index**：Speed Index；出现 1/3 次；2.0 s。

### 巷集 Select 默认本地入口 / mobile

实测 URL：http://127.0.0.1:4177/shop/#/pages/index/index

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.6 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；3.0 s。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.6 s。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；3.1 s。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 42 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 157 KiB。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 1/3 次；90 ms。

## 先前中断尝试（单列保留）

以下真实测量在批次中断前已产生原始报告，不纳入本批三次统计，也未因低分删除。每项记录具体中断原因；需要修复真实页面问题并重建时，不将构建前后的样本混合统计。

- 2026-10-12T13:08:20.225Z http://127.0.0.1:4177/#/：Performance 70 / Accessibility 100；LCP 2629ms，TBT 1411ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-08-05-279Z/home-mobile-1.json`（同名 HTML 同目录）。中断原因：首轮工具中断：Chrome 清理方法返回 void 与脚本 Promise 假设不符；已修复测量脚本。业务代码和构建未因该次中断修改，首页70分原始报告完整保留。
- 2026-10-12T13:29:59.054Z http://127.0.0.1:4177/#/：Performance 100 / Accessibility 100；LCP 448ms，TBT 31ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-desktop-1.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.
- 2026-10-12T13:30:09.869Z http://127.0.0.1:4177/#/：Performance 100 / Accessibility 100；LCP 448ms，TBT 37ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-desktop-2.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.
- 2026-10-12T13:30:18.618Z http://127.0.0.1:4177/#/：Performance 100 / Accessibility 100；LCP 446ms，TBT 36ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-desktop-3.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.
- 2026-10-12T13:29:27.535Z http://127.0.0.1:4177/#/：Performance 90 / Accessibility 100；LCP 2136ms，TBT 315ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-mobile-1.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.
- 2026-10-12T13:29:38.116Z http://127.0.0.1:4177/#/：Performance 92 / Accessibility 100；LCP 2121ms，TBT 281ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-mobile-2.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.
- 2026-10-12T13:29:48.756Z http://127.0.0.1:4177/#/：Performance 92 / Accessibility 100；LCP 1975ms，TBT 292ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-29-24-655Z/home-mobile-3.json`（同名 HTML 同目录）。中断原因：Integration owner identified real low-contrast text in mobile Lab 2D empty state (.il-flat-nodes > p), requested stopping measurement before CSS correction and rebuild. Not a score-based retry. Six completed home samples remain; seventh navigation was interrupted.

## 复现

先构建生产资源并在独立终端启动本机预览。确保未同时运行构建、E2E 或其他性能测量。

```powershell
npm run build
$env:PORT = '4177'
npm run preview
```

随后在另一终端的仓库根目录运行：

```powershell
node scripts/measure-lighthouse.mjs --plan
node scripts/measure-lighthouse.mjs --run
```

可通过 LH_BASE_URL 指定其他回环地址及构建基路径，通过 CHROME_PATH 指定已安装的 Chrome。脚本不安装浏览器，不调用真实模型或支付服务。每次运行生成新的原始目录并更新本报告；运行异常返回 1，完整测量存在中位数低于 90 返回 2，完整达标返回 0。

模拟节流结果受本机负载和浏览器版本影响，三次范围体现本轮波动。Accessibility 分数仅含自动规则，不替代键盘、屏幕阅读器、真实设备与人工视觉验收。
