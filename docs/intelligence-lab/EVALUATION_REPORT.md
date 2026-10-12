# 智能演化实验室：独立评估记录

记录时间：2026-10-12 20:56（Asia/Shanghai）。对象为当前 V2 工作树的领域包和 `/#/intelligence`，浏览器连接本机开发预览。没有将以下结果外推为生产发布、真机或完整安全审计。

## 实际运行结果

| 层级 | 命令/入口 | 真实结果 |
| --- | --- | --- |
| 领域单测 | `node node_modules/vitest/vitest.mjs run packages/intelligence/src` | 121/121，通过；3 文件：engine 29、A* 38、recording 54 |
| 已分配 TS 与浏览器 spec 静态检查 | ESLint；strict、noUncheckedIndexedAccess TypeScript | exit 0 |
| Chrome 完整实验室 suite | `tests/e2e/intelligence.spec.ts`，临时预览配置 | 17/17，2026-10-12 20:43:49 开始，70.772 秒；0 skipped、0 flaky |
| 手机画布修复后定向复验 | 390/1440 布局、手机闭环、fault/seed、10 次导航释放、减弱动效 | 6/6，20:49:40 开始，26.163 秒；0 skipped、0 flaky |
| 独立 API/client 缺陷回归 | `.local/qa/review.vitest.config.ts`，内存数据库或受控网络响应 | 4/4，20:49 复验通过 |
| 固定种子功能评测 | `node scripts/evaluate-intelligence.ts` | 450/450 预期结果通过；实际墙钟 18.679 秒 |

17 项是完整浏览器 suite 的独立用例数；随后 6 项是其中相关用例的重跑并增加画布边界断言，不计成 23 个不同用例。完整 17 项运行早于最后的手机布局修复；修改后的 6 项用于定向验证，最终整站 snapshot 回归由集成负责人执行。本报告不填入尚未由本角色执行的构建、性能或发布数字。

## 固定种子功能评测

2026-10-12 补充运行 [evaluate-intelligence.ts](../../scripts/evaluate-intelligence.ts)，实际结果保存在 [evaluation.json](evaluation.json)。命令为 `node scripts/evaluate-intelligence.ts`，使用已安装的 Vite 加载领域 TypeScript；不启动 HTTP 监听，不新增依赖。脚本本身 ESLint 与 strict/noUncheckedIndexedAccess 类型检查通过。

固定 seed 0–49，`delayMs=0`，每次最多 5 个相互隔离的 seed 同时执行。每个 seed 运行 9 个场景，共 450 次：商品、活动、仓储基线；商品/活动拒绝；商品/活动预算不可行；仓储增加障碍后重规划；机器人全封闭后解除一格障碍并恢复。输出仅保留每次的状态、计数和错误码，没有大快照、凭据或机器绝对路径。

| 指标 | 实际值 | 判定方式 |
| --- | --- | --- |
| 基线完成率 | 150/150，100% | 三个预设各 50 次均满足领域成功条件 |
| 全部场景预期结果 | 450/450 | 拒绝应 cancelled、不可行应 failed；不把这些场景误计为任务成功 |
| 约束违规 | 0 | 核对价格×数量、预算、可用量、剩余名额、机器人移动/碰撞/载荷及交付坐标 |
| 审批前写入 | 0 | 每步检查审批前 `writes=0`，批准本身不写入，确认后重复执行仍为 1 |
| A* 路径对照 | 950/950 | 每次实际规划长度与脚本内独立 BFS 最短距离相同，并逐格检查邻接与碰撞 |
| 新障碍重规划 | 50/50 | 世界版本增加、旧路径清空、重规划数大于零并最终完成三货 |
| 全封闭识别/恢复 | 50/50、50/50 | `UNREACHABLE` 且原地不动；开通道后完成三货 |

这是确定性规则的有限功能评测，不是模型 benchmark。当前 `createWorld` 用 `seed % 3` 选择货架开口，因此 50 个 seed 只有 3 种货架布局；商品品类与数量、活动场次与人数另按 seed 变化。18.679 秒是该批次实际耗时，包含调度、快照复制与校验，不代表用户设备渲染或单工具性能。判定依据与领域测试的审批边界、BFS 对照、不可达恢复一致。

## 验证了哪些真实结果

领域层验证：审批前零写入、拒绝零写入、批准后恰好一次、合成库存/名额约束、整数分金额、部分查询重查、超时与失败、三次重试上限、并发 step 串行化、取消/新计划后的迟到响应无效、世界变化使旧路径失效、缺货物失败、三货真实投递、负载不被优先级替换、有限重规划，以及严格记录验证与纯回放。

A* 使用独立 BFS 作为可达性和最短长度的对照：24 个 seeded 障碍图 × 每图 96 个目标，共 2,304 组对照。这些对照位于单测内，不额外计入 121 个用例。

Chrome 用例只通过 DOM 可见交互与输出验证业务，不读取 runtime 内存。技术性 evaluate 仅用于 DOM 几何、滚动、WebGL context loss 和已卸载画布上下文检查。完整 suite 的逐用例 `pageerror` 均为空。

| 浏览器路径 | 观察到的结果 | 测试源码 |
| --- | --- | --- |
| 商品与活动确认、拒绝、预算改变 | 工具参数/来源可见；批准后一次写入；拒绝零写入；`slot-print` 两人后余 2 名额 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L53):53 |
| 超时、部分结果与取消 | 失败保留证据；解除后重试；在途取消并等实际响应后仍取消、零写入 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L110):110 |
| 仓储绕行、全封闭、目标变化与缺货物 | 新版本清旧路径，绕行完成三件；不可达后开通道真实移动；缺货物明确失败 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L139):139 |
| 保存、导出、导入、step/seek | IndexedDB 与 JSON 保留 events/input/seed；回放不提供批准或新增事件 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L182):182 |
| 3D 与降级 | 实际 canvas；切二维；context loss 降级并保留领域节点 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L211):211 |
| 390/1440 与手机抽屉 | 无横向溢出；画布不进入操作栏；手机改预算、审批、折叠后继续 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L235):235 |
| 种子、导航与减弱动效 | seed 99 进入真实来源；10 次旧 context 释放；reload 后减弱动效生效，单步仍可执行 | [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts#L275):275 |

## 两个实际失败案例

### 1. 迟到查询覆盖较新的取消状态

独立 H5 状态审查构造两个预约记录查询，先返回新的 `USER_CANCELLED`，再放行旧的 `CONFIRMED`。原实现只检查整体模式 generation，旧请求仍被接受，原始断言失败。这是已执行的失败复现，不是推测。

修复引入 `recordsGeneration`，每次读取递增序号，写操作提前使旧读取失效；结果只有在模式与读取序号都匹配时才能更新。原始断言未放宽，修复后通过。实验室采用相同边界原则：`execute` 检查 epoch/worldVersion；切回放先取消在途任务；UI 的 `single` 不允许旧运行刷新新模式。

证据位置：`apps/campaign-h5/src/v2/store.ts:124` 的 `refresh` 与 `:139` 的 `write`；复现 `.local/qa/h5-state.review.test.ts`。实验室对应取消/迟到守卫见 `packages/intelligence/src/engine.test.ts:153` 和浏览器 spec `:110`。

### 2. 手机 3D 画布覆盖操作栏

390px 视觉检查发现舞台高度 320px，而子组件残留 `min-height:350px`，画布比舞台多出 30px 并进入控制区。原来的“无横向滚动”断言无法发现垂直重叠。

修复将场景组件最小高度设为 0 并限制 overflow，移动端场景同样约束在舞台内。新增断言 `canvas.bottom <= controls.top + 1`。复核实际 DOM：stage/scene/canvas 均为 320px，canvas 底边与 controls 顶边相等；390/1440 定向测试通过。更新后的 390 首屏与完成截图已实际打开检查。

修复位置：`apps/portfolio/src/components/IntelligenceScene.vue:315` 与 `apps/portfolio/src/intelligence.css:820`。验证位置：`tests/e2e/intelligence.spec.ts:235`。

## 证据留存与限制

原始完整 JSON：`.local/qa/intelligence-results-full17.json`；修复后定向 JSON：`.local/qa/intelligence-results.json`；HTML：`.local/qa/intelligence-report/index.html`。该目录为忽略的本机运行证据，不含公网测试结论。

真实截图位于 `.local/qa/intelligence-screenshots/`，包括两宽度首屏、审批详情、二维仓库、绕行、不可达和手机完成状态。已实际查看两宽度首屏、390 审批与完成图、1440 仓库/绕行/不可达图；截图仅含本次原创页面及合成数据。

此处未测试真实手机、Safari/Firefox、微信设备、真实模型、实体设备、长时间资源耗尽、完整渗透测试或公开部署。独立审查发现的问题及对应修复状态见 [INDEPENDENT_REVIEW.md](../acceptance/INDEPENDENT_REVIEW.md)。
