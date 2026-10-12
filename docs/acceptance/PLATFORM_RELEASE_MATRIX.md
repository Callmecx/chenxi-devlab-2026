# 业务应用跨端验收矩阵

记录日期：2026-10-12（北京时间）。范围仅为蓉城周末 Lab 与巷集 Select 的本次本机验收，不代表根站整体验收、V2 公网部署或商店发布完成。

本次实际运行环境为 Windows、Node.js 24、npm 与桌面 Chrome。390px 检查是浏览器视口验证，不等于手机设备验证。商品、活动、库存、地址、付款及物流均为模拟业务数据。

## 当前状态

| 应用 / 平台              | 实际完成                                                                                           | 产物与入口                                                                  | 尚未验证 / 不可据此宣称                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 蓉城周末 Lab / Web H5    | 类型检查、Lint、单元测试、生产构建；真实 Chrome 预约、查询、取消及恢复流程；390px / 1440px 检查    | `apps/campaign-h5/dist/`；开发入口 `http://127.0.0.1:5175/pulse/`           | 移动 Safari、Android WebView、真实手机、V2 公网 API 可用性                                                           |
| 巷集 Select / uni-app H5 | 类型检查、Lint、单元测试、H5 生产构建；真实 Chrome 报价、下单、模拟付款及履约；390px / 1440px 检查 | `apps/commerce-mini/dist/build/h5/`；开发入口 `http://127.0.0.1:5174/shop/` | 微信内置浏览器、真实手机及 V2 公网 API 可用性                                                                        |
| 巷集 Select / 微信小程序 | `build:mp-weixin` 资源构建通过                                                                     | `apps/commerce-mini/dist/build/mp-weixin/`                                  | 当前为 `touristappid`，无真实 AppID 验收；未导入微信开发者工具验证、未真机预览、未验证合法请求域名、未提交审核或上线 |
| 巷集 Select / App        | `build:app` 资源构建通过                                                                           | `apps/commerce-mini/dist/build/app/`                                        | 未在 Android / iOS 运行；未打包或签名 APK / AAB / IPA；未验证权限、原生网络与设备兼容；未云打包、上传商店或发布      |
| 公开静态入口             | 保留显式本地演示，以及服务未连接时的错误状态                                                       | 部署后的 `/pulse/`、`/shop/` 路径                                           | 静态托管不会运行 Fastify / SQLite；本次文档不证明公开入口已更新到本次源码或可连接本机服务                            |

微信配置的 `urlCheck: true` 只保留域名校验要求，不能证明网络请求已经在微信中成功。App 资源目录也不等同于可安装包。现有占位应用标识需在正式平台工作开始时由所有者配置。

## 已执行的客户端检查

在仓库根目录执行，均为本次真实结果。两个应用的现有测试均保留，未跳过断言。

| 检查                   | 命令                                                                    | 本轮结果                                  |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| H5 类型                | `npm run typecheck --workspace @chenxi/campaign-h5`                     | 通过                                      |
| 商城类型               | `npm --prefix apps/commerce-mini run typecheck`                         | 通过                                      |
| 客户端单测             | `npx vitest run apps/campaign-h5/src apps/commerce-mini/tests`          | 8 个文件，54 项通过                       |
| 范围 Lint              | 下方完整命令                                                            | 通过                                      |
| 预约 H5 构建           | `npm run build --workspace @chenxi/campaign-h5`                         | 通过                                      |
| 商城 H5 构建           | `npm --prefix apps/commerce-mini run build:h5`                          | 通过                                      |
| 微信资源构建           | `npm --prefix apps/commerce-mini run build:mp-weixin`                   | 通过                                      |
| App 资源构建           | `npm --prefix apps/commerce-mini run build:app`                         | 通过                                      |
| 本地开发入口浏览器流程 | `npx playwright test --config apps/campaign-h5/playwright.v2.config.ts` | 7 / 7 通过；0 跳过、0 重试后通过；14.4 秒 |

```powershell
npx eslint apps/campaign-h5/src apps/campaign-h5/tests apps/campaign-h5/playwright.v2.config.ts apps/commerce-mini/src apps/commerce-mini/tests tests/e2e/server-flows.spec.ts
```

浏览器报告记录开始时间为 `2026-10-12T12:56:05.965Z`，即北京时间 20:56:05。原始报告保存在忽略目录 `.local/evidence/client-v2/results.json`。截图在 `.local/evidence/client-v2/screenshots/`，包含以下六个页面各 390px / 1440px 的全页与视口图，共 24 张：

- `weekend-home`、`weekend-book`、`weekend-cancelled`。
- `select-home`、`select-quote`、`select-completed`。

检查包含页面横向溢出断言与主流程浏览器异常断言。截图可说明被拍摄状态的布局，不等于覆盖全部页面、辅助技术或设备。

七条浏览器用例分别验证：

1. H5 三题偏好 → 推荐路线 → 场次 → 预约 → 刷新持久查询 → 确认取消。
2. H5 服务端已经提交、响应丢失 → 刷新 → 原请求重试 → 仅一条预约。
3. 商城 12 个商品 → SKU → 购物袋 → 领券与报价 → 下单 → 模拟付款失败 / 成功 → 发货 → 收货 → 刷新保留状态。
4. 商城已创建订单、响应丢失 → 刷新 → 原请求重试 → 仅一条订单 → 取消。
5. API 不可达时明确报错；仅在用户主动选择后进入本地演示。
6. H5 原提交结果未知、Cookie 丢失 → 禁止新身份重放 → 401 仍保留原请求 → 用户明确确认后归档 UNKNOWN。
7. 商城原提交结果未知、token 丢失 → 禁止新建身份 → 用户明确确认后归档 UNKNOWN。

响应丢失用例先让真实 API 完成写入，再中断浏览器收到的响应；它们不是仅用假成功 JSON 替代服务器。不可达用例有意阻断请求。业务正常用例使用真实本机 Fastify / SQLite。

## 复现本地服务端演示

先在当前仓库根目录准备 Node.js 24 和依赖。新检出使用现有两份锁文件分别安装：

```powershell
npm ci
npm --prefix apps/commerce-mini ci
```

随后开三个终端，均以仓库根目录为工作目录，分别执行：

```powershell
# 终端 1：API，默认 127.0.0.1:4016
npm run dev:api
```

```powershell
# 终端 2：蓉城周末 Lab，默认 127.0.0.1:5175
npm run dev:pulse
```

```powershell
# 终端 3：巷集 Select H5，默认 127.0.0.1:5174
npm run dev:shop
```

健康检查为 `http://127.0.0.1:4016/api/v1/health`。数据库默认为 `.local/data/demo.sqlite`，重启服务保留数据库；这不延长 24 小时演示身份有效期。Vite 将两个页面的同源 `/api/v1` 请求代理到 4016。请统一使用 `127.0.0.1`，不要在演示过程中改成 `localhost` 后期望复用原浏览器身份。

打开 `/pulse/` 后点顶部“连接本地服务”，等待“服务端演示已连接”。点击“找到我的周末”，完成三题偏好，查看推荐路线和可预约场次，选择 1–4 人、填写可选虚构代号并确认规则，提交模拟预约；刷新后查看“我的预约”，再通过确认框取消。

打开 `/shop/` 后点“连接本地服务”。选择商品与有库存 SKU，加入购物袋，进入报价页，领取并选择适用优惠券，使用演示地址获取服务端报价。确认创建模拟订单后，分别体验“模拟付款失败”“模拟付款成功”“模拟发货”“确认模拟收货”；也可对另一张待付款订单执行取消。价格、名额、库存与订单状态以返回的 API 数据为准。

可直接在第四个终端运行上表的本地浏览器命令；该应用级配置不会自行启动以上三个服务，需要本机 Chrome。连续大量重复执行可能触发演示会话创建限流；应等待限流窗口，不应删除防护或以新请求标识绕过未决写入。

聚合生产资源的集成复现入口另有 `tests/e2e/server-flows.spec.ts`：

```powershell
npm run build
npx playwright test tests/e2e/server-flows.spec.ts
```

根 Playwright 配置会启动独立 API 4116（`.local/e2e/demo.sqlite`）与生产资源预览 4176；端口应空闲。此处提供集成复现命令，不将上述开发入口 7 / 7 结果冒充为根站全部用例或公网验收结果。根任务的最终验收以其另行生成的报告为准。

## 接入真实托管环境前

服务端模式仍是模拟业务，但必须有实际运行且可达的 API。部署需配置 HTTPS、允许的站点 Origin、反向代理、持久数据库目录和会话隔离；不能仅上传静态构建目录。H5 当前同源 Cookie 协议以及商城非 H5 的 HTTPS API 配置要求详见 [客户端恢复机制](../architecture/CLIENT_RECOVERY.md#api-对接与部署前提)。任何微信 / App 发布声明还需补齐真实平台标识、平台网络配置、开发工具与设备实测、签名产物及发布记录。
