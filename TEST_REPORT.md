# Chenxi DevLab 验收报告

验收日期：2026-10-12（Asia/Shanghai）。环境：Windows、Node.js 24.18.0、npm 11.16.0、真实安装的 Chrome，通过 Playwright 执行。

## 验证范围

三个原创应用独立检查 TypeScript、ESLint 和生产构建。金额、库存、状态、重复提交、异步失败与缓存恢复通过 Vitest；核心用户流程通过真实 Chrome 执行。历史项目测试数量不计入本次结果。

最终回归：**35/35 单元与状态测试、17/17 Playwright 测试通过**，未跳过用例。浏览器运行用时 35.4 秒。原始证据：[Vitest JSON](docs/testing/vitest-results.json)、[Playwright JSON](docs/testing/playwright-results.json)。

| 检查 | 结果 |
|---|---|
| 三个应用 TypeScript | 通过 |
| 根 ESLint（含三个应用、共享包、测试、脚本） | 通过，0 error / 0 warning |
| 共享工具 Vitest | 2/2 |
| ShopPilot 领域与状态 Vitest | 16/16 |
| PulseCampaign 领域与状态 Vitest | 17/17 |
| 主站浏览器流程与响应式 | 6/6 |
| ShopPilot 浏览器流程与响应式 | 5/5 |
| PulseCampaign 浏览器流程与响应式 | 6/6 |
| 主站、PulseCampaign、ShopPilot H5 生产构建 | 全部通过 |
| ShopPilot 微信小程序 CLI 编译 | 通过（touristappid） |
| 根与 uni-app 锁文件安装验证 | npm ci --dry-run 通过 |

响应式用例自动断言无横向溢出；流程用例覆盖真实浏览器点击、输入、刷新与状态恢复。另已人工查看桌面、移动、小屏截图，检查布局与信息层级。页面截图见 [docs/screenshots](docs/screenshots)。

GitHub Actions 首轮 Linux 独立验收也全部通过，17 项浏览器测试用时 29.3 秒；构建与部署成功记录见 [DEPLOYMENT_REPORT.md](DEPLOYMENT_REPORT.md)。2026-10-12 13:45（北京时间）线上 Chrome 检查通过：三个入口 HTTP 200、主站与商城往返正确、测试说明及两类截图资源可用，无页面异常或第三方网络请求。

## 必验流程

- 主站：导航、项目分类与搜索、空结果、主题持久化、项目详情锚点、真实截图弹窗、邮箱链接、移动菜单及键盘跳转。
- ShopPilot：搜索、SKU 售罄、库存约束、增减删除与勾选、优惠门槛、运费、虚拟地址、失败重试、重复提交、状态推进与历史恢复。
- PulseCampaign：场次与冲突、人数与容量、分步校验、草稿持久化、模拟失败重试、回执、取消及统计。
- 响应式：1440、768、390、320px，检查主要页面横向溢出、导航与表单交互，保存截图。

## 已发现并修复的实际问题

1. hash 路由的普通页内锚点会误改路由：改为受控滚动，增加浏览器回归。
2. uni-app 默认 H5 按钮语义和键盘操作不完整：统一跨端 AppButton，补按钮角色、焦点、Enter / Space 和禁用状态。
3. 订单异步等待期间结算数据可变化：捕获提交时指纹，变化时中止并保留最新编辑，复验库存；增加状态测试。
4. 活动缓存逐条恢复不检查累计名额：累计验证有效预约，去重并排除取消记录占额；增加损坏缓存回归。
5. Lighthouse 检查暴露小字对比度与 favicon 问题：修正后复测，保留真实报告。

## 构建与运行边界

H5 产物汇总到 `dist/`，主站 `/`，ShopPilot `/shop/`，PulseCampaign `/pulse/`。部署仓库子路径通过 `BASE_PATH` 构建。

微信小程序通过 CLI 生成 `apps/commerce-mini/dist/build/mp-weixin/`，AppID 为 `touristappid`；可供开发者工具导入尝试。本次未进行微信开发者工具、真机、支付或平台审核验收。

## 性能与安全

Lighthouse 13.5.0、Chrome 154.0.8037.94，本地生产构建实验室测量；不是线上真实用户数据。详见 [性能报告](PERFORMANCE_REPORT.md) 和 `docs/testing/lighthouse/` 原始 HTML/JSON。

| 页面 / 模式 | 性能 | 可访问性 | 最佳实践 | SEO |
|---|---:|---:|---:|---:|
| 主站 / 移动模拟 | 92 | 100 | 100 | 100 |
| Pulse / 移动模拟 | 95 | 100 | 100 | 100 |
| Shop / 移动模拟 | 96 | 100 | 100 | 100 |
| 主站 / 桌面 | 100 | 95 | 100 | 100 |

桌面主站仍有两处装饰性海报文字对比度改进项，保留实际 95 分，不隐去限制。四次测量 CLS 均为 0；单次实验室结果会随环境波动。

GitHub Pages `/chenxi-devlab-2026/` 子路径已通过真实 Chrome 冒烟检查：三个页面、主站→商城→返回、报告及截图资源均成功，无页面异常和第三方网络请求。证据见 `docs/testing/deployment-path-check.json`。

安全检查未发现匹配的密钥、Token、私钥或私有源码。根依赖审计为零已知告警；uni-app 构建链仍受无上游补丁的 braces glob DoS 公告影响，当前静态应用无对应输入入口。具体依赖图与范围分析见 [安全报告](docs/testing/SECURITY_REVIEW.md)，这不等于绝对没有风险。

## 未覆盖事项

未验收真实支付、服务器可信库存、多用户跨设备同步、微信审核、Safari 真机、商业负载或付费 AI API。旧项目只读核查与脱敏展示，不重新运行旧业务服务。
