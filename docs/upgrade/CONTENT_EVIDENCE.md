# V2 工程案例、交互实验与证据边界

记录日期：2026-10-12，Asia/Shanghai。本记录只覆盖以下内容模块及其实际检查，不表示整站 V2 最终验收或公网后端发布完成。

## 内容依据与公开范围

既有项目事实来自 `docs/research/PROJECT_EVIDENCE.md`、`docs/research/project-evidence.json` 与用户提供的产品、设计、实施及本地审计规格。原项目内文件名仅作为证据定位；没有复制其私有源码、数据库、客户资料或运行配置。案例统一说明个人职责、资料审阅日期、历史验收日期、已有证据、待验证范围及至少两条工程选择。

- EnterpriseFlow 的 19/19、七角色业务链和有限库存并发是既有记录，本轮没有重跑 Java 项目。历史验收日期未独立确认，界面不会用本轮审阅日期代替。金额、账号与客户均为模拟。
- AI Agent Workbench 的 2026-09-20 验收记录属于历史材料。真实 SSE 与 Mock 回答分别说明；没有新声明真实付费模型、向量检索或自主 LLM 执行验收。
- Solana Radar V23 只链接既有公开概览，核心源码保持私有；历史运行报告图片的 alt 明确为脱敏报告摘录，不是实时行情界面。
- PokerReplay 的交付来源为本人确认，缺独立客户验收文件；Rust 的历史测试不升级为真钱路径验收。不量化未经核实的个人贡献占比、节省时间或收益。
- 每个已提供图片的旧案例仅展示一张已审阅图，不捏造多页面证据或拍摄日期。无截图的项目使用明确标注的原创结构示意。

`data/projects.ts` 及 `ProjectDetail.vue` 分开呈现历史材料和本轮独立实验。`Writing.vue` 两篇文章直接说明本轮前缀重算、缺口和取消隔离，以及业务库存、整数分与请求重放的实现和限制；没有编写虚构项目经历或未执行的通过率。

## 本轮实现及入口

路径以下均相对于本站 hash 路由；正式 Pages 入口需要保留仓库的既有 base。

| 页面 | 实际能力 | 执行边界与源码 |
|---|---|---|
| `/#/labs/market-replay` | 播放、暂停、单步、倍速、拖动/键盘 seek、重置；缺口注入、重复投递、回补与前缀重算；报价、五档合成簿、成交 K 线；切换标的取消旧准备请求 | `pages/MarketReplay.vue`、`domain/market/replay.ts`。72 条原创合成事件，不接行情、不调用 V23 或 Rust 工程。图表只从连续已应用前缀生成，最后一根 K 线标明未闭合。 |
| `/#/labs/enterprise-flow` | 50 台需求、30 台现货、20 台缺口：审批、采购、收货、出库、分次收款；非法状态和超额拒绝；同键重放不重复记账；重置 | `pages/EnterpriseFlowLab.vue`、`domain/enterprise/workflow.ts`。本轮独立浏览器仿真，无原 Java 服务与数据库。金额为整数分，非完整财务账本。 |
| `/#/labs/engineering` / 库存竞态 | 真正并发发出 A/B 请求，各自不同操作键，随后 GET 实际竞态终态 | `pages/EngineeringExperiments.vue`、`domain/experiments/client.ts`、`services/demo-api/src/server.ts`。SQLite 演示服务中的隔离库存，单次样本不代表吞吐基准。断连时禁用写入，不展示预设赢家。 |
| 同页 / 订单故障 | 商品 `book-clay` × 2、真实报价与订单；发送前保存原键和请求体；主动丢弃成功响应，保持 unknown；查询原操作、同键重试、核对订单列表；刷新恢复和本会话重置 | 页面明确区分“受控客户端丢弃响应”与实际网络故障。操作查询暂未找到不证明原请求没执行。不会自动换新键或回退成本地成功。 |
| 同页 / 十万行 | Worker 真实生成、筛选和数值排序；传输结果索引；虚拟窗口渲染；旧 Worker terminate 与代次校验；切换场景取消；当前机器实测计时 | `domain/experiments/list.ts`、`list.worker.ts`。全部数据合成。Worker 计时不包括 DOM 绘制，含启动/传输计时不是端到端渲染基准。 |
| `/#/writing` | 两篇与上述源代码相符的工程文章、锚点导航、案例与实验互链 | `pages/Writing.vue`，不依赖外部内容或虚构发布日期。 |

上述 `pages/`、`domain/` 均位于 `apps/portfolio/src/`。

## 实际验证

2026-10-12 执行以下检查通过；初次范围检查于 20:45（+08:00），身份恢复修复后于 20:52 再次通过类型检查、变更范围 Lint 与以下领域测试：

```powershell
npm run typecheck --workspace @chenxi/portfolio
node node_modules/vitest/vitest.mjs run apps/portfolio/src/domain/market/replay.test.ts apps/portfolio/src/domain/enterprise/workflow.test.ts apps/portfolio/src/domain/experiments/experiments.test.ts
node node_modules/eslint/bin/eslint.js apps/portfolio/src/pages/MarketReplay.vue apps/portfolio/src/pages/EnterpriseFlowLab.vue apps/portfolio/src/pages/Writing.vue apps/portfolio/src/pages/EngineeringExperiments.vue apps/portfolio/src/pages/ProjectDetail.vue apps/portfolio/src/domain/market apps/portfolio/src/domain/enterprise apps/portfolio/src/domain/experiments apps/portfolio/src/data/projects.ts tests/e2e/content.spec.ts tests/e2e/engineering.spec.ts
```

领域单元测试为最新命令的 **22/22**，三组包括未来事件污染不能改变当前投影、缺口/回补与成交量、重复事件、迟到响应隔离、库存守恒、部分结算及超额、同键异体拒绝、原请求恢复、错误响应不得充当成功证据、十万行实际筛选排序、虚拟窗口边界和 Worker 取消。身份恢复新增测试验证保留原请求时禁止创建新会话，以及明确放弃时有界归档及存储失败的保护。

正式可复用浏览器用例为 `tests/e2e/content.spec.ts` 与 `tests/e2e/engineering.spec.ts`。2026-10-12 **20:51:55–20:52:37（+08:00）**，Chrome 154、390×900 与 1440×900、Vite `127.0.0.1:5176` 代理真实 API `4016`，执行：

```powershell
node node_modules/@playwright/test/cli.js test -c .local/qa/content-preview.config.ts
```

结果 **11/11，通过耗时 41.3 秒**，无跳过、无重试通过、无未处理页面错误。该轮使用 `reducedMotion: no-preference`，保留实际平滑滚动。截图先等待用户滚动稳定，再回到顶部，保留 `scrollY === 0` 与横向溢出断言。

浏览器断言覆盖：

- 两个尺寸的回放键盘 seek、缺口阻塞与回补、重复报价不变、快速切换标的、播放暂停和倍速、重置。
- 两个尺寸的企业非法提前出库、采购收货发货、10 万元部分收款、同键重放账目不增加、15 万元结清、重置。
- 实际服务 A/B 并发、不同幂等键、两次尝试一次成功与库存归零；订单主动丢响应后的 unknown、刷新原键恢复、操作查询、原键重试仍只有一单、重置读取零单。
- 另一个故障场景使用 Playwright `route.fetch()` 让服务实际完成订单写入，再 `route.abort()` 丢失网络响应；随后查询与原键重试仍核对一单。未用本地假数据替代 API。
- 订单结果未知时禁止重置服务记录；浏览器移除会话令牌后，保留原请求且拒绝发出新会话创建。明确放弃时，先将原键、原内容和原日期归档到本标签页独立缓存（最多五条、不含令牌），再清除恢复入口；归档不能跨身份重放。之后新会话订单列表为零，没有删除旧服务记录。
- 服务不可达时连接不成功、写入按钮禁用；十万行滚动到最后一条、快速换查询、真实降序、空结果、切换取消与重新进入。
- 文章导航、案例两条难点、历史日期边界、图片放大与 Esc、Solana 图片准确 alt，以及案例进入独立仿真。

本地原始报告及截图在已忽略的 `.local/qa/content/`：`playwright-results.json`、`market-{390,1440}.png`、`enterprise-{390,1440}.png`、`engineering-{race,order,list}-{390,1440}.png`、`writing-390.png`。已人工查看手机与桌面代表截图。`virtual-performance-{390,1440}.json` 记录当前机器样本、浏览器与实际渲染行数；不把该数字写死成产品性能承诺。

验证过程中修复了浏览器原生 `fetch` 被作为实例方法调用时的 Illegal invocation，并补全平滑滚动尚未结束时截图回顶被覆盖的检查时序。领域逻辑断言、真实 API 与视口断言均保留。

## 商城与活动案例的 V2 口径

ShopPilot 升级展示为 **巷集 Select**，PulseCampaign 升级展示为 **蓉城周末 Lab**；原 slug 与 `/shop/`、`/pulse/` 入口保留。元信息描述 V2 共享 DTO、Fastify、SQLite、会话隔离、服务报价/名额与原请求恢复，同时保留 V1 图片和历史报告标签。

集成验证已实际走通两应用的 Chrome 真实 API 与写入后丢响应恢复，客户端和服务单元/集成测试、H5 与游客 AppID 小程序构建已执行。最终新增失会话与完整生产产物回归仍由整体验收记录汇总；本文不把中间批次写成最终全部通过，也不以本页的领域测试替代两应用测试。

公开 Pages 仍默认本地演示；真实持久化后端仅本机 SQLite。没有宣称公网数据库、真实支付、微信审核上线、真机验收或生产负载表现。不能用本机 API 成功推断公网服务已部署。

## 仍需由最终交付核对

当前最终源代码的生产构建与全站浏览器回归由集成流程重跑；本次模块报告不代替其结果。公开发布前核对实际部署模式、路由 base、断连反馈及最新元信息。旧项目历史测试不因本轮新仿真通过而改变状态。
