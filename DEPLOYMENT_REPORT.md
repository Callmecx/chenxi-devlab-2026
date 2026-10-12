# GitHub 发布与线上验收

## V3 本地发布前检查（2026-10-13）

功能检查点 `dc336f17d672dc061e90c4a1b40966f1244ce4da`，分支 `feature/intelligence-lab-v3-rebuild`。完整本地93项生产浏览器、308项单元/API、类型、Lint及各端资源构建通过。

**00:35:31（Asia/Shanghai）** 完成实际仓库路径 `/chenxi-devlab-2026/` 的生产构建与浏览器验证：9个路由分别在390/1440下检查，4个业务流程、4个证据资产通过；页面异常/失败资产均0，`sourceTreeDirty:false`，构建SHA与功能检查点一致。星港实际单步→全封路→不可达→开路重试→3份送达经过验证。机器证据：[deployment-path-check.json](docs/testing/deployment-path-check.json)。这还是本机子路径验证；公开发布和匿名线上结果在实际完成后补入。

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
