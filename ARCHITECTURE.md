# Chenxi DevLab 架构

本工程包含三个独立应用，以静态部署和本地模拟业务为边界。它用于展示组件、状态、类型、交互与可验证交付，不依赖数据库、付费 API、真实支付或自建服务端。

```text
apps/
  portfolio/       Vue 3 + TypeScript 开发者品牌站
  campaign-h5/     Vue 3 + TypeScript 活动预约 H5
  commerce-mini/   uni-app + Vue 3 + TypeScript 电商 H5 / 微信小程序
packages/shared/   小型纯函数与类型安全存储工具
scripts/           独立构建整合、本地静态预览、发布内容扫描
tests/             浏览器业务与响应式验收
docs/research/     旧项目证据、历史截图、内容边界
docs/testing/      实际测试、依赖审计和安全扫描结果
docs/screenshots/  本次实际运行截图
```

## 应用和依赖边界

Portfolio、PulseCampaign 和 shared 由根 npm workspaces 管理。ShopPilot 保留独立 `package.json` 和锁文件：uni-app 编译器对 Vue / Vite / 插件版本有配套要求，独立安装避免与普通 Vue 应用互相抬升或覆盖依赖。所有版本以锁文件为准。

三个应用分别构建，`scripts/build.mjs` 只负责串行调用构建和汇总静态产物。部署目录约定为：

| 目录 | 应用 |
|---|---|
| `/` | Chenxi DevLab 主站 |
| `/shop/` | ShopPilot H5 |
| `/pulse/` | PulseCampaign H5 |
| `/evidence/` | 明确可公开的证据资料 |

`BASE_PATH` 支持 GitHub Pages 项目子路径。应用使用 hash 路由，避免静态托管环境刷新深层路由返回 404。构建不包含源映射；开发服务和本地预览绑定回环地址。

## 主站

Vue Router 管理首页、技术能力、项目索引、详情、联系与不存在页面。详情数据将技术目标、业务链、难点、解法、证据和边界分开，避免用旧项目名称或历史测试数量冒充本轮成果。Pinia 管理主题偏好；项目详情采用按路由加载。

视觉以暖纸色、深绿与酸橙点缀构建品牌，强调排版和项目叙述。新作品商品和活动插图由组件/CSS 原创绘制；既有截图只使用逐张核对过的脱敏副本。字体使用系统字体栈，无运行时字体 CDN。

## ShopPilot

核心规则放在 `src/domain/commerce.ts`，页面调用 Pinia store，store 使用 uni 存储 API 保存版本化状态。

```mermaid
flowchart LR
  Catalog[演示商品与 SKU] --> Detail[规格 / 库存检查]
  Detail --> Cart[购物车勾选与数量]
  Cart --> Totals[整数分金额 / 优惠券 / 运费]
  Totals --> Confirm[固定演示地址 / 订单确认]
  Confirm --> Submit[同步提交锁 + requestKey 幂等]
  Submit --> Orders[订单快照 / 状态推进]
  Orders --> Storage[版本化本地存储]
```

金额统一使用整数分。优惠券门槛、运费与库存由纯函数计算，提交时再次校验库存和地址。相同请求标识返回已有订单，已购数量计入库存消耗；成功订单只清除勾选商品。恢复本地状态时校验版本、商品身份、数量、金额和重复订单；不接受任意缓存作为可信业务事实。

订单状态由用户显式模拟推进，不代表真实物流。地址是内置虚构样例，不收集真实收件人信息；无支付 SDK、微信支付或真实下单接口。

## PulseCampaign

活动目录和规则位于 `src/domain.ts`，Pinia store 保存草稿与历史预约。可选活动具有固定时段和名额，校验时间冲突、人数范围、重复预约、昵称与确认项。提交先快照草稿，同步加锁，模拟等待后再次校验，再写入本地记录。失败保留草稿；取消释放相应名额。

活动表单只要求虚构昵称，备注不进入最终预约记录。页面显示 Mock 说明和主动故障注入入口。统计来自本机演示记录，不表示活动实际客流或商业转化。

## 测试与发布边界

纯函数测试覆盖业务边界，store 测试覆盖重复提交、失败恢复与持久化，Playwright 验证核心用户路径与断点。类型、Lint、构建和浏览器检查分别执行；构建通过不代替完整验收。实际结果见 [TEST_REPORT.md](./TEST_REPORT.md)。

公开前扫描 Git 待发布文件，检查常见凭据、私钥、助记词、原数据库/报表、越界符号链接与可疑旧源码。依赖审计单独记录；具体发现和限制见 [安全审查](./docs/testing/SECURITY_REVIEW.md)。静态部署不运行 Node BFF、采集、交易、模型调用或客户数据处理。

## 有意保留的限制

- 本地存储可被用户清除或篡改；没有跨设备同步、多用户事务或服务器可信库存。
- 模拟服务用于解释状态与恢复，不能代表真实支付、物流、活动履约或后端接口联调。
- 微信小程序构建可使用游客 AppID 导入开发者工具；编译完成不代表真机或微信审核上线。
- 旧项目只以证据和授权截图展示，未合并其私有源码或运行数据。
