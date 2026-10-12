# GitHub 发布与线上验收

首次部署成功：**2026-10-12 13:43:22（Asia/Shanghai）**。

- 公开仓库：[Callmecx/chenxi-devlab-2026](https://github.com/Callmecx/chenxi-devlab-2026)
- 主站：[Chenxi DevLab](https://callmecx.github.io/chenxi-devlab-2026/)
- 作品一：[ShopPilot H5](https://callmecx.github.io/chenxi-devlab-2026/shop/)
- 作品二：[PulseCampaign H5](https://callmecx.github.io/chenxi-devlab-2026/pulse/)
- 首轮成功工作流：[Actions 38208920874](https://github.com/Callmecx/chenxi-devlab-2026/actions/runs/38208920874)
- 首次部署提交：`e374e3c737a7f6029fd42bd5bb2e7f91f0283210`
- GitHub deployment ID：`7007324565`，API 状态 `success`。

## 远端构建证据

GitHub Actions 在 Ubuntu runner 中完成两套 `npm ci`、TypeScript、Lint、35 项单元/状态测试、三个 H5 构建、微信小程序编译、17 项 Playwright 测试和发布文件扫描。首轮 build job 用时 3 分 12 秒，Pages deploy 用时 11 秒。浏览器测试用时 29.3 秒。

工作流保留 `test-evidence` 与 `wechat-mini-build` 产物。下载小程序产物后可用微信开发者工具尝试游客导入；没有微信审核、真机或支付上线结论。

## 线上实际检查

2026-10-12 13:45（北京时间），以 Chrome 154.0.8037.94 访问生产地址并验证：

| 对象 | 结果 |
|---|---|
| 主站、ShopPilot、PulseCampaign | HTTP 200，标题与应用相符 |
| 三个入口 390px 宽度 | 无横向溢出 |
| 主站项目详情 → ShopPilot → 返回主站 | 保持正确仓库子路径 |
| `evidence/TEST_REPORT.md` | HTTP 200 |
| 历史企业管理系统截图、ShopPilot 本次结算截图 | HTTP 200 |
| 页面异常 | 0 |
| 第三方请求来源 | 0 |

机器记录：[online-smoke.json](docs/testing/online-smoke.json)。这是实际线上冒烟验证，完整业务边界由本地与 CI 测试覆盖；不把 HTTP 200 当作所有商业场景验收。

## 公开范围

只发布本次新建源码、明确授权邮箱、原创新作品与脱敏证据。没有修改或上传用户其他私有工程。已知 uni-app 构建工具上游限制继续在 [安全报告](docs/testing/SECURITY_REVIEW.md) 中公开，不宣称绝对零风险。
