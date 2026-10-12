# Performance & accessibility evidence

2026-10-12 对最终聚合生产构建执行真实 Lighthouse 测量。下面为本机单次实验室结果，不代表公网、真实手机或生产用户表现。

| 页面 / 原始 HTML 报告 | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| [主站 · 移动](docs/testing/lighthouse/portfolio-mobile-final.report.html) | 92 | 100 | 100 | 100 | 1.8 s | 2.0 s | 280 ms | 0 |
| [Pulse · 移动](docs/testing/lighthouse/pulse-mobile-final.report.html) | 95 | 100 | 100 | 100 | 1.7 s | 1.8 s | 220 ms | 0 |
| [ShopPilot · 移动](docs/testing/lighthouse/shop-mobile-final.report.html) | 96 | 100 | 100 | 100 | 2.1 s | 2.4 s | 0 ms | 0 |
| [主站 · 桌面](docs/testing/lighthouse/portfolio-desktop-final.report.html) | 100 | 95 | 100 | 100 | 0.5 s | 0.5 s | 0 ms | 0 |

表格沿用 Lighthouse 显示精度；精确值见 JSON。例如 ShopPilot TBT 为 4.5 ms，在原报告中显示为 0 ms。

## 测量环境

- Lighthouse **13.5.0**（npm 注册表核实后固定版本）；Node **v24.18.0**；Windows x64；安装版 **HeadlessChrome/154.0.0.0**。Chrome 使用独立临时会话，没有复用用户登录资料。
- 对象：根构建生成的静态产物，经独立端口 `http://127.0.0.1:4176/` 读取；主站、`/pulse/`、`/shop/`，不是 Vite 开发性能数据。
- 移动：默认 Moto G Power 模拟，412 × 823、DPR 1.75，`throttlingMethod=simulate`；RTT 150 ms、吞吐 1638.4 Kbps、CPU 4× slowdown。
- 桌面：`--preset=desktop`，1350 × 940、DPR 1，模拟 RTT 40 ms、吞吐 10240 Kbps、CPU 1×。
- 每个配置测量一次；没有取最高分、平均值或编造分位数。机器负载、浏览器版本、真实网络、缓存状态均可能导致分数变化。
- 原始 JSON 保留真实采集时间、审计详情与截图；[结构化测量汇总](docs/testing/lighthouse/measurement-summary.json) 提供精确数值与配置。公开报告已检查没有本机用户名、用户目录、凭证或私人内容。

## 实际发现与处理

首次审计发现了部分小字对比度不足、演示页 favicon 404，以及 ShopPilot 视口限制缩放与缺少主内容地标。已修复并对最终生产产物重新测量。原始基线文件保留为无 `-final` 后缀的报告；`pulse-accessibility-source.json` 是开发源的单项检查，不用作性能结论。

最终三个移动入口的加权自动可访问性评分为 100。桌面主站保留 **95**：Pulse 项目装饰海报上的两处浅色大字与橘色底的对比度为 2.51/2.64，未达到 3:1；这是明确保留的改进项，未宣称无可访问性问题。另有装饰海报文字与中文详情链接名不完全一致的零权重建议。评分 100 也不能替代键盘、读屏与人工体验检查。

首屏使用原创 CSS 几何视觉、系统字体与路由懒加载，不依赖远程素材服务。所有页面 CLS 实测为 0；TBT 为本轮模拟值，不能作为真实用户 INP 或生产 SLA。

## 复现

先执行根 `npm run build` 并通过 `PORT=4176 node scripts/serve.mjs` 启动预览。Windows PowerShell 可用 `$env:PORT='4176'` 设置端口；必要时将 `CHROME_PATH` 指向本机 Chrome 可执行文件。

```text
npx --yes lighthouse@13.5.0 http://127.0.0.1:4176/ --chrome-flags="--headless=new --disable-dev-shm-usage --no-first-run" --output=json --output=html --output-path=docs/testing/lighthouse/portfolio-mobile-final --only-categories=performance,accessibility,best-practices,seo
```

桌面另加 `--preset=desktop`；两个作品分别替换 URL 路径。命令与模拟配置依据 [Lighthouse 官方 CLI 文档](https://github.com/GoogleChrome/lighthouse#using-the-node-cli)。
