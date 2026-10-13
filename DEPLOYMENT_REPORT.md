# GitHub 发布与线上验收

## V4 功能发布与匿名验收（2026-10-13）

功能发布提交：`01afff76df0ae76bd62bf16839fdff182c2827cb`。[PR #3](https://github.com/Callmecx/chenxi-devlab-2026/pull/3) 在[第二轮完整PR CI](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38356930003)通过后合并；[主分支 CI 与 Pages](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38359501057)完整成功。类型、Lint、407项单元/API、127项生产浏览器、三个网页与微信/App资源构建、仓库子路径业务、发布扫描和部署均通过；逐步骤证据：[PR](docs/testing/ci-v4-pr-second.json)、[主分支](docs/testing/ci-v4-main-functional.json)。首轮CI的4个失败及修复保留，不合并累计成通过数。

**2026-10-13 15:20:21 +08**，全新未登录Chrome对部署进行了实际操作：10路由×390/1440，正确HTTP200/标题/无横溢出；V4真实单步→全封路→不可达→同会话显式新attempt→勘测维修运输与补给均完成，V3双载体失败恢复后交付3份，实用工具审批拒绝，商城SKU/购物袋/结算/返回，H5选择与预约入口；9证据资产可访问。页面错误和失败资源均为0，检查前后`build-meta`完全相同、`sourceTreeDirty:false`，源码SHA精确匹配。机器结果：[online-smoke.json](docs/testing/online-smoke.json)。这是公网静态模式验收，不是公网API/模型验收。

[V4旗舰](https://callmecx.github.io/chenxi-devlab-2026/#/intelligence)、[主站](https://callmecx.github.io/chenxi-devlab-2026/#/)、[商城](https://callmecx.github.io/chenxi-devlab-2026/shop/#/)和[H5](https://callmecx.github.io/chenxi-devlab-2026/pulse/#/)保留原路径；V3和实用任务库仍可直接进入。后续纯证据提交不改变上述功能树；最终交付提交、其完整CI/Pages、精确版本匿名验收及原片附件另随[v4.0.0 Release](https://github.com/Callmecx/chenxi-devlab-2026/releases/tag/v4.0.0)提供；最终交付的精确版本以该Release附件为准，本段保留首次功能发布的实际验收。

正式媒体和12样本性能锁定干净源码`157e5f6`：25张原图、101.640秒原始WebM，32,567,750bytes，SHA256 `381e704c1945ace82eccc04bc234a949b21d71c176bdbbd9ff82a83ffdedcff8`。以[媒体清单](docs/intelligence-lab-v4/media-manifest.json)的完整哈希为准；原片不进入Git，仅审阅后作为Release附件。回退保留`v3.0.0` / `4d2a85f2908cc5b202bc104707ec9a00947af47c`，不移动旧标签、不force push、不声称已演练线上回滚。无仓库可见性、旧仓、其他项目或费用变更。

## V3 已发布并通过匿名业务复验（2026-10-13）

功能发布提交：`da9b6337be81f7d6650785071984d1d2eb73fb47`；[PR #2](https://github.com/Callmecx/chenxi-devlab-2026/pull/2) 在完整 [PR CI](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38281209887) 通过后合并，主分支首次失败由静止减弱动效按需绘制修复。[主分支 CI 与 Pages](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38286209858) 于 **2026/10/13 01:58:05（Asia/Shanghai）** 成功。两套依赖安装、类型、Lint、308项单元/API、95项完整生产浏览器、网页/微信/App资源构建、最终仓库子路径业务与发布扫描全部通过。逐步骤证据：[PR CI](docs/testing/ci-v3-pr.json)、[主分支CI](docs/testing/ci-v3-release.json)。

**2026/10/13 02:02:26** 使用全新未登录 Chrome 154.0.8037.94 完成线上复验：9路由分别在390/1440下HTTP200、标题正确、无横溢出；轨道港真实单步→全部封路→不可达→开路重试→双载体实际交付3份、实用任务商品审批拒绝、商城SKU→购物袋→结算与返回、H5预约入口均通过；4证据资产可访问，页面异常和失败资产均为0。`build-meta.json.sourceRevision` 与上述功能发布提交完全一致，`sourceTreeDirty:false`。机器证据：[V3 online-smoke.json](https://github.com/Callmecx/chenxi-devlab-2026/blob/v3.0.0/docs/testing/online-smoke.json)。

真实录屏：[v3.0.0 Release](https://github.com/Callmecx/chenxi-devlab-2026/releases/tag/v3.0.0)，75.720秒、16,000,955 bytes；GitHub附件返回的SHA-256与本机原片一致：`ef0a69e7d2429a47664ab29813d4437f9c231ab2996f792c48c457324c915af7`。它来自ec20eaf的实际浏览器操作，后续Worker恢复修复没有改变正常场景；不倒写影片源版本。

三个既有公开入口及原实验室URL不变，旧私有仓和其他项目未修改。Pages为本地算法与模拟业务，未部署公网API或模型服务。后续验收文档提交保留这次带日期的功能发布记录；最新部署SHA另以build-meta和对应工作流核对。`v2.0.0`仍指向8059fb9，回退流程见[说明](docs/acceptance/DEPLOYMENT_AND_ROLLBACK.md)，不重写历史。

## V3 历史本地发布前检查（2026-10-13 00:35）

功能检查点 `dc336f17d672dc061e90c4a1b40966f1244ce4da`，分支 `feature/intelligence-lab-v3-rebuild`。完整本地93项生产浏览器、308项单元/API、类型、Lint及各端资源构建通过。

**00:35:31（Asia/Shanghai）** 完成实际仓库路径 `/chenxi-devlab-2026/` 的生产构建与浏览器验证：9个路由分别在390/1440下检查，4个业务流程、4个证据资产通过；页面异常/失败资产均0，`sourceTreeDirty:false`，构建SHA与功能检查点一致。星港实际单步→全封路→不可达→开路重试→3份送达经过验证。机器证据：[V3 deployment-path-check.json](https://github.com/Callmecx/chenxi-devlab-2026/blob/v3.0.0/docs/testing/deployment-path-check.json)。这是当时的本机子路径验证；后续真实公开发布和匿名线上结果已在本报告顶部单列。

远端 `v2.0.0` 标签已读回核对，指向 `8059fb954e089a7880a4d1cea52941f03deb5c54`，保留为上个正式版本的恢复目标。无仓库可见性、自定义域名或旧仓变更。

## V2 历史发布状态（2026-10-12）

V2 已通过本地和远端验收并发布。功能发布提交：`e946a67b00dd103ead319b68af64300f35f14228`；[PR #1](https://github.com/Callmecx/chenxi-devlab-2026/pull/1) 在完整 [PR CI](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38259667428) 成功后合并。

[主分支 CI 与 Pages 发布](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38260520649) 于 **2026-10-12 22:14（Asia/Shanghai）** 成功。两套依赖安装、类型检查、Lint、247 项单元/API、64 项生产 E2E、网页/微信/App资源构建、最终仓库子路径业务检查和发布扫描全部通过；逐步骤记录见 [ci-v2-release.json](docs/testing/ci-v2-release.json)。

**22:15:31** 使用全新未登录 Chrome 154 上下文完成线上复验：8 个核心路由分别在 390/1440px 下 HTTP200、正确标题、无横向溢出；商品计划执行至审批后拒绝、商城 SKU→购物袋→结算与返回、H5 选择活动→预约入口均通过；4 个证据资产可访问，页面异常和失败资产均为0。`build-meta.json.sourceRevision` 与上述发布提交完全相同。机器证据：[V2 online-smoke.json](https://github.com/Callmecx/chenxi-devlab-2026/blob/v2.0.0/docs/testing/online-smoke.json)。这不是只检查首页 HTTP200，也不是公网后端验收。

- [主站](https://callmecx.github.io/chenxi-devlab-2026/#/) / [智能演化实验室](https://callmecx.github.io/chenxi-devlab-2026/#/intelligence)
- [巷集 Select](https://callmecx.github.io/chenxi-devlab-2026/shop/#/) / [蓉城周末 Lab](https://callmecx.github.io/chenxi-devlab-2026/pulse/#/)
- [金融事件回放](https://callmecx.github.io/chenxi-devlab-2026/#/labs/market-replay) / [企业业务仿真](https://callmecx.github.io/chenxi-devlab-2026/#/labs/enterprise-flow) / [三个工程实验](https://callmecx.github.io/chenxi-devlab-2026/#/labs/engineering)

Pages 沿用 workflow 发布、HTTPS 和原仓库路径，无自定义域名变更。后续交付文档提交保留本次已验证功能版本的日期记录；实际线上版本可继续通过 build-meta 与工作流核对。

目标仅 `Callmecx/chenxi-devlab-2026`。公开 Pages 提供本地算法、模拟业务及回放；Fastify/SQLite API 为本机演示，未部署公网。三个既有入口保持不变。详细验收见 [V2 矩阵](docs/upgrade/ACCEPTANCE_MATRIX.md)，回退办法见 [发布与回退](docs/acceptance/DEPLOYMENT_AND_ROLLBACK.md)。

## V1 历史发布记录

首次部署成功：**2026-10-12 13:43:22（Asia/Shanghai）**。

- 公开仓库：[Callmecx/chenxi-devlab-2026](https://github.com/Callmecx/chenxi-devlab-2026)
- 主站：[Chenxi DevLab](https://callmecx.github.io/chenxi-devlab-2026/)
- 作品一：[ShopPilot H5](https://callmecx.github.io/chenxi-devlab-2026/shop/)
- 作品二：[PulseCampaign H5](https://callmecx.github.io/chenxi-devlab-2026/pulse/)
- 首轮成功工作流：[Actions 38208920874](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38208920874)
- 首次部署提交：`e374e3c737a7f6029fd42bd5bb2e7f91f0283210`
- GitHub deployment ID：`7007324565`，API 状态 `success`。

### V1 远端构建证据

GitHub Actions 在 Ubuntu runner 中完成两套 `npm ci`、TypeScript、Lint、35 项单元/状态测试、三个 H5 构建、微信小程序编译、17 项 Playwright 测试和发布文件扫描。首轮 build job 用时 3 分 12 秒，Pages deploy 用时 11 秒。浏览器测试用时 29.3 秒。

工作流保留 `test-evidence` 与 `wechat-mini-build` 产物。下载小程序产物后可用微信开发者工具尝试游客导入；没有微信审核、真机或支付上线结论。

### V1 线上实际检查

2026-10-12 13:45（北京时间），以 Chrome 154.0.8037.94 访问生产地址并验证：

| 对象                                         | 结果                     |
| -------------------------------------------- | ------------------------ |
| 主站、ShopPilot、PulseCampaign               | HTTP 200，标题与应用相符 |
| 三个入口 390px 宽度                          | 无横向溢出               |
| 主站项目详情 → ShopPilot → 返回主站          | 保持正确仓库子路径       |
| `evidence/TEST_REPORT.md`                    | HTTP 200                 |
| 历史企业管理系统截图、ShopPilot 本次结算截图 | HTTP 200                 |
| 页面异常                                     | 0                        |
| 第三方请求来源                               | 0                        |

历史机器记录：[V1 online-smoke.json](https://github.com/Callmecx/chenxi-devlab-2026/blob/b62db8d0beb9d55c59649767a7281b500a07020d/docs/testing/online-smoke.json)。这是当时的线上冒烟验证，不计入本轮V2结果。

### 公开范围

只发布本次新建源码、明确授权邮箱、原创新作品与脱敏证据。没有修改或上传用户其他私有工程。已知 uni-app 构建工具上游限制继续在 [安全报告](docs/testing/SECURITY_REVIEW.md) 中公开，不宣称绝对零风险。
