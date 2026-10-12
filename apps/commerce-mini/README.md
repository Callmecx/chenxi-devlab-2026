# ShopPilot

Chenxi DevLab 原创生活方式电商交互作品。Vue 3 + TypeScript + uni-app + Pinia，一套业务模型输出 H5 和微信小程序构建。

所有商品、库存、优惠券、地址和订单均为明确标记的演示数据。不存在真实支付、物流、注册、云端数据上传或姓名 / 手机号输入；uniStatistics 已关闭。产品插画使用原创 CSS 几何图形，无外部商品摄影素材。

## 本地运行

需要 Node.js 22+（本次验证 Node.js 24.18.0）和 npm。

```sh
cd apps/commerce-mini
npm ci
npm run dev:h5
```

开发地址：`http://127.0.0.1:5174/shop/`。从仓库根目录也可运行 `npm run dev:shop`。

```sh
npm run typecheck
npm run lint
npm test
npm run build:h5
npm run build:mp-weixin
```

H5 输出：`dist/build/h5`。默认部署前缀为 `/shop/`，构建时可通过 `BASE_PATH` 环境变量设置，例如 `/chenxi-devlab-2026/shop/`。采用 hash 路由，商品、购物袋、确认和订单分别拥有独立 uni-app 页面。

微信小程序输出：`dist/build/mp-weixin`。微信开发者工具可导入这个目录；配置使用游客 AppID `touristappid`。本次已执行编译，未执行真实微信账号下的设备验收、审核或发布，不能称为已上线小程序。

## 业务规则

- 商品支持分类、关键词、有货筛选和双向价格排序；提供模拟加载失败和恢复入口。
- 购物袋以 SKU 为唯一键合并数量；规格独立计价，数量必须为 1–99 整数且不超过剩余库存。
- 金额统一使用整数分计算；优惠前满 ¥299 免模拟运费，否则 ¥12。
- `WELCOME30` 满 ¥199 减 ¥30，`SLOW50` 满 ¥399 减 ¥50；优惠券不能叠加，未达门槛时阻止下单。
- 只结算勾选商品。订单成功后移除对应购物袋行、扣减可用库存，未选商品保留。
- 提交按钮锁定 + 业务层请求键幂等，两层防止重复提交。请求等待期间若购物袋、地址或优惠券改变，旧确认会被取消并提示重新确认，避免悄悄提交不同订单。模拟失败会保留购物袋、地址和优惠券，可原地重试。
- 两个预设虚拟收货地址，不采集真实隐私。订单状态支持手动模拟待发货 → 运输中 → 已完成。
- Pinia 管理会话状态，uni storage 持久化。加载时校验版本、SKU、整数数量、重复行、订单金额、库存和状态；坏数据安全降级，存储写入失败有提示。
- H5 自定义按钮补充语义、键盘 Enter / Space 和禁用状态；搜索框关联真实可编辑元素的 ARIA 名称。

## 组织与设计取舍

`src/domain/catalog.ts` 是演示商品目录，`src/domain/commerce.ts` 是可单测的纯业务函数，`src/stores/shop.ts` 负责状态、Mock 延迟和持久化。`ShopApp.vue` 复用页面布局，`ProductArt.vue` 输出原创几何商品插画，`AppButton.vue` 统一跨端交互语义。`src/pages/*` 是独立可导航页面。

uni-app 官方模板的编译器依赖版本与普通 Vite 应用不同，因此本应用采用独立 package-lock，未加入根 npm workspaces。保持所有 DCloud 组件同版本 `3.0.0-5020620260917001`。官方模板旧 Vite / Vue 及若干依赖存在公告，本项目定向覆盖为 Vite 6.4.4、Vue 3.5.43 等修复版本，并重新执行类型检查、单元测试、H5 与微信编译及浏览器测试。

没有为了把审计数字变为零而降级 uni-app：截至 2026-10-12，`braces` 最新 3.0.3 仍有无上游补丁的构建工具 glob 解析 DoS 公告。剩余 npm audit 高危计数是该叶子问题的传递依赖级联；不应描述为“全部依赖零漏洞”。只处理仓库内可信 glob / 源文件，开发服务器仅绑定本机。静态发布不包含这些 Node 工具。详见仓库根 `SECURITY_REVIEW.md` 与 `docs/testing/audit-commerce-all.json`。

## 验证记录

2026-10-12 实际执行：TypeScript、ESLint、16 项 Vitest 业务测试、H5 构建、微信小程序构建均通过。根目录 `tests/e2e/commerce.spec.ts` 的 5 个 Chrome / Playwright 测试通过：一个完整业务流程和 1440 / 768 / 390 / 320 px 的商品、确认页与横向溢出检查；未出现页面 JS 异常。

```sh
# 从仓库根目录运行，需要根依赖、所有静态构建已准备好
npx playwright test tests/e2e/commerce.spec.ts
```

浏览器截图在仓库根 `docs/screenshots/shop-*.png`。截图是运行时捕获，不是设计稿。微信小程序目前只有编译证据，未有真机截图。没有进行真实付款或商业运营性能评估。

官方工程参考：[uni-app CLI](https://uniapp.dcloud.io/quickstart-cli.html)、[CLI 命令说明](https://uniapp.dcloud.net.cn/worktile/CLI.html)。仅参考平台工程方法，没有复制第三方网站设计、内容或素材。
