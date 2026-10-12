# Lighthouse 本机性能与可访问性报告

测量开始：2026-10-12T13:13:32.875Z；完成：2026-10-12T13:16:22.444Z。

状态：**measured**；实际运行 18 次，有效 18 次。每个固定页面 / 设备条件计划 3 次，串行执行，不自动重跑或丢弃低分。

这是本机生产构建的导航实验测量，不是公网真实访客数据、手机实测或后端业务链路耗时。H5 与商城使用全新浏览器身份的默认本地演示入口；未预填服务端模式或把 API 业务验收成绩混入 Lighthouse。

## 固定条件

- Lighthouse 13.5.0，Node v24.18.0，win32 10.0.26200；浏览器实际版本见 JSON 的 browserUserAgent。
- 基址：http://127.0.0.1:4177/；每次新建专属 Chrome profile，使用 headless Chrome，无个人浏览器数据。
- mobile：390 × 844，DPR 1；desktop：1440 × 900，DPR 1。均使用 Lighthouse simulate；mobileSlow4G / desktopDense4G 参数完整保存在摘要 settings 中。
- 仅测 performance 与 accessibility；英文审计规则。保持默认页面行为，不强制减少动画、不禁用 GPU 来改变 Lab 呈现。
- 构建指纹：da305aeb8dc1377f45ce39c1f1a27e73a111bca3c835cf40c0ab786457087a8f（44 个 HTML / JS / CSS / JSON / 字体文件）；测量期间构建未变更。
- 原始 JSON / HTML 与逐次 manifest：`.local/performance/2026-10-12T13-13-32-875Z`；Chrome profile / TEMP 同置该 D 盘工作区目录。

## 中位数与范围

方括号为三次有效样本的最小值–最大值；缺少样本时明确列出，不按完整三次验收。Performance / Accessibility 目标均为中位数至少 90；范围中的低分也保留。

| 页面                               | 有效 / 计划 | Performance         | Accessibility       | LCP ms           | TBT ms        | CLS                 | 90 分目标                   |
| ---------------------------------- | ----------- | ------------------- | ------------------- | ---------------- | ------------- | ------------------- | --------------------------- |
| 首页 / mobile                      | 3/3         | 91.0 [87.0–91.0]    | 100.0 [100.0–100.0] | 2121 [2042–2133] | 309 [285–423] | 0.000 [0.000–0.000] | 中位数达标，存在单次低于 90 |
| 首页 / desktop                     | 3/3         | 100.0 [100.0–100.0] | 95.0 [95.0–95.0]    | 448 [446–448]    | 35 [33–39]    | 0.000 [0.000–0.000] | 三次均达标                  |
| EnterpriseFlow 静态案例 / mobile   | 3/3         | 85.0 [85.0–86.0]    | 96.0 [96.0–96.0]    | 2472 [2458–2474] | 65 [54–67]    | 0.207 [0.207–0.207] | 未达标：performance         |
| 智能演化 Lab / mobile              | 3/3         | 56.0 [50.0–57.0]    | 100.0 [100.0–100.0] | 5422 [5420–5620] | 266 [239–433] | 0.207 [0.207–0.207] | 未达标：performance         |
| 蓉城周末 Lab 默认本地入口 / mobile | 3/3         | 87.0 [84.0–88.0]    | 100.0 [100.0–100.0] | 2169 [2097–2191] | 424 [380–532] | 0.000 [0.000–0.000] | 未达标：performance         |
| 巷集 Select 默认本地入口 / mobile  | 3/3         | 90.0 [90.0–90.0]    | 96.0 [96.0–96.0]    | 3049 [3036–3053] | 46 [6–49]     | 0.000 [0.000–0.000] | 三次均达标                  |

## 路由与具体问题

每次验证 Lighthouse 最终 URL、页面 URL 及 hash；Enterprise / Lab 额外校验主标题。原始文件保留完整审计详情，以下不以高总分隐藏失败项目。

### 首页 / mobile

实测 URL：http://127.0.0.1:4177/#/

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.0 s / 1.8 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.1 s / 2.0 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；290 ms / 310 ms / 420 ms。
- **performance / speed-index**：Speed Index；出现 1/3 次；2.0 s。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms / Est savings of 150 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.3 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；340 ms / 360 ms / 470 ms。
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
- **accessibility / color-contrast**：Background and foreground colors do not have a sufficient contrast ratio.；出现 3/3 次；位置：`a.visual-link > div.project-visual > div.pulse-art > span；div.projects-grid > article.project-card > a.visual-link > div.project-visual；a.visual-link > div.project-visual > div.pulse-art > b`。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.router-link-active；section.section-wrap > div.projects-grid > article.project-card > a.visual-link；section.section-wrap > div.projects-grid > article.project-card > a.visual-link`。

### EnterpriseFlow 静态案例 / mobile

实测 URL：http://127.0.0.1:4177/#/projects/enterprise-flow

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.1 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.5 s。
- **performance / cumulative-layout-shift**：Cumulative Layout Shift；出现 3/3 次；0.207。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.1 s。
- **performance / cls-culprits-insight**：Layout shift culprits；出现 3/3 次；位置：`body > div#app > footer.site-footer`。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / image-delivery-insight**：Improve image delivery；出现 3/3 次；Est savings of 104 KiB；位置：`div.detail-body > section#project-evidence > button.screenshot-button > img`。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.5 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；160 ms / 180 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 23 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 47 KiB。
- **performance / unsized-images**：Image elements do not have explicit `width` and `height`；出现 3/3 次；位置：`div.detail-body > section#project-evidence > button.screenshot-button > img`。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **performance / layout-shifts**：Avoid large layout shifts；出现 3/3 次；1 layout shift found；位置：`body > div#app > footer.site-footer；div.detail-body > section#project-evidence > button.screenshot-button > img`。
- **accessibility / color-contrast**：Background and foreground colors do not have a sufficient contrast ratio.；出现 3/3 次；位置：`section#project-process > div.flow > div > span；div.detail-body > section#project-process > div.flow > div；section#project-process > div.flow > div > span`。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.brand；div.detail-layout > div.detail-body > section#project-evidence > button.screenshot-button`。
- **performance / total-blocking-time**：Total Blocking Time；出现 2/3 次；70 ms。

### 智能演化 Lab / mobile

实测 URL：http://127.0.0.1:4177/#/intelligence

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；3.6 s / 3.7 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；5.4 s / 5.6 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；240 ms / 270 ms / 430 ms。
- **performance / cumulative-layout-shift**：Cumulative Layout Shift；出现 3/3 次；0.207。
- **performance / speed-index**：Speed Index；出现 3/3 次；3.6 s / 3.7 s。
- **performance / cls-culprits-insight**：Layout shift culprits；出现 3/3 次；位置：`body > div#app > footer.site-footer`。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；5.5 s / 5.6 s / 5.8 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；250 ms / 280 ms / 370 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 30 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 265 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **performance / layout-shifts**：Avoid large layout shifts；出现 3/3 次；1 layout shift found；位置：`body > div#app > footer.site-footer`。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`div#app > header.site-header > div.header-inner > a.brand；section.il-console > div.il-stage-column > div.il-controls > button.il-play`。
- **performance / mainthread-work-breakdown**：Minimize main-thread work；出现 1/3 次；2.1 s。

### 蓉城周末 Lab 默认本地入口 / mobile

实测 URL：http://127.0.0.1:4177/pulse/#/

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.0 s / 1.8 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；2.2 s / 2.1 s。
- **performance / total-blocking-time**：Total Blocking Time；出现 3/3 次；420 ms / 380 ms / 530 ms。
- **performance / speed-index**：Speed Index；出现 2/3 次；2.0 s。
- **performance / forced-reflow-insight**：Forced reflow；出现 3/3 次。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 450 ms / Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；2.4 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 3/3 次；470 ms / 430 ms / 580 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 26 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 55 KiB。
- **performance / bf-cache**：Page prevented back/forward cache restoration；出现 3/3 次；1 failure reason。
- **accessibility / label-content-name-mismatch**：Elements with visible text labels do not have matching accessible names.；出现 3/3 次；位置：`section#experiences > div.session-grid > article.session-card > a.session-art-link；section#experiences > div.session-grid > article.session-card > a.session-art-link；section#experiences > div.session-grid > article.session-card > a.session-art-link`。

### 巷集 Select 默认本地入口 / mobile

实测 URL：http://127.0.0.1:4177/shop/#/pages/index/index

- **performance / first-contentful-paint**：First Contentful Paint；出现 3/3 次；2.6 s。
- **performance / largest-contentful-paint**：Largest Contentful Paint；出现 3/3 次；3.0 s / 3.1 s。
- **performance / speed-index**：Speed Index；出现 3/3 次；2.6 s。
- **performance / network-dependency-tree-insight**：Network dependency tree；出现 3/3 次。
- **performance / render-blocking-insight**：Render-blocking requests；出现 3/3 次；Est savings of 300 ms。
- **performance / interactive**：Time to Interactive；出现 3/3 次；3.1 s。
- **performance / max-potential-fid**：Max Potential First Input Delay；出现 2/3 次；100 ms。
- **performance / unused-css-rules**：Reduce unused CSS；出现 3/3 次；Est savings of 42 KiB。
- **performance / unused-javascript**：Reduce unused JavaScript；出现 3/3 次；Est savings of 157 KiB。
- **accessibility / color-contrast**：Background and foreground colors do not have a sufficient contrast ratio.；出现 3/3 次；位置：`uni-view.select-mode > uni-view > uni-text.select-mode-copy > span；uni-page > uni-page-wrapper > uni-page-body > uni-view.select-mode`。

## 先前中断尝试（单列保留）

以下真实测量在工具执行中断前已产生原始报告，不纳入本批三次统计，也未因低分删除。首次中断来自 Chrome 清理方法返回 void 与脚本 Promise 假设不符；修复的只是清理脚本，业务代码及构建未因此修改。

- 2026-10-12T13:08:20.225Z http://127.0.0.1:4177/#/：Performance 70 / Accessibility 100；LCP 2629ms，TBT 1411ms，CLS 0。原始 JSON：`.local/performance/2026-10-12T13-08-05-279Z/home-mobile-1.json`（同名 HTML 同目录）。

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
