# 星域智航 V4 · 三分钟演示与源码追问

V4功能已于2026-10-13 15:20:21（+08）通过匿名线上验收，页面精确匹配干净功能提交 `01afff76`，主分支CI及Pages部署成功。可直接打开[星域智航](https://callmecx.github.io/chenxi-devlab-2026/#/intelligence)。本地407/407单元/API、157e5f6完整127/127浏览器及五类50轮生命周期通过；25张画面、101.640秒原片、96.913643秒业务完成观测及12样本性能仍绑定媒体源码157e5f6。结果见[测试报告](TEST_REPORT.md)，范围见[模式说明](MODE_AND_RELEASE_STATUS.md)。

## 演示准备

在仓库根目录执行 `npm run build`，然后 `npm run preview`。默认本机生产入口为 `http://127.0.0.1:4173/#/intelligence`；自定义 `PORT`/`BASE_PATH` 时以终端输出为准。开发临时服务与测试端口不是公开链接；已验证公网入口为[星域智航](https://callmecx.github.io/chenxi-devlab-2026/#/intelligence)，仍使用浏览器本地仿真。

默认场景是“远征接力 · 勘测与维修”，种子4217，同时包含常规补给和中继接力。需要重新开始时，打开“世界设置”，选择场景后点“重置并应用场景”，该操作创建新会话；重要记录先导出保存。默认声音关闭，本地运行不依赖公网API或真实模型。开启减弱动效时优先二维，仍可进入事件导览。

## 三分钟工程路线

| 时间预算    | 实际操作                                                           | 检查事实                                                                                     | 源码与测试依据                                                                                                                                             |
| ----------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15   | 指出“本地仿真”模式、三类六舰与默认两任务；点击“远征导览 · 约100秒” | 新建远征会话；没有预先交付                                                                   | [StarCommand](../../apps/portfolio/src/pages/StarCommand.vue) `startGuide`；[guide测试](../../tests/e2e/dominion-guide.spec.ts) G01/G04                    |
| 0:15–约1:55 | 讲述导览，不点击其他操作                                           | 实际扫描完成后才关闭直达航道；维修实际完成后才暂停比较；分支预测不写入实况；之后运输实际交付 | `advanceGuide`；G04逐阶段读取状态并核对扫描、封路、维修件消耗与真实交付事件                                                                                |
| 约1:55–2:15 | 完成后点“回放这次远征”，拖到起点再看后段，随后返回实时             | 起点无未来交付，历史只读；实时世界没有因seek而变化                                           | `beginReplay`、`seek`；[recording测试](../../packages/intelligence/src/dominion/recording.test.ts) T20与[主流程测试](../../tests/e2e/dominion.spec.ts) B07 |
| 2:15–2:45   | “任务编排 → 添加沙箱任务 → 生成受控提案”，查看工具输入/输出后拒绝  | “规划替身（不调用模型）”；生成和拒绝均不增加任务                                             | `planMission`、`approveProposal`；guide G02及[adapter测试](../../packages/intelligence/src/dominion/model-adapter.test.ts)                                 |
| 2:45–3:00   | “工程档案”展示资源账本、事件与源码链接                             | 世界事实、分支预测、原始工具耗时和模式边界分别可解释                                         | `located`、`compare`；[不变量](../../packages/intelligence/src/dominion/invariants.ts) `assertDominionInvariants`                                          |

时间是讲述预算，不是任务完成保证。导览的停顿用于看清场景，推进仍由实际事件和Worker结果决定；发生失败、断连或超时会保留原因并停止，不能按墙钟宣告成功。任何主动控制都会接管并安全暂停，因而不要在完整导览中途切视图来“补画面”。

## 30秒看亮点

1. **0–8秒：**速度选4×，点击“启动远征”，指出默认两任务与三类六舰。
2. **8–20秒：**打开“任务编排”，查看扫描、维修、运输的实际依赖与进度。
3. **20–30秒：**打开“工程档案”看库存/舰载/耗能，或切“全息星图”核对同一会话。

只讲页面当时实际状态，不承诺30秒内完成；需要完整过程时使用“远征导览 · 约100秒”。

## 六视图、五体验与四链的补充演示

- **六视图：**指挥中枢控制执行；全息星图检查实体；舰队协同显示角色、载荷与能源；任务编排管理四类任务；体验舱改变观察位置；工程档案检查账本、比较和回放。切视图不换世界会话。
- **五体验：**跟随、指挥桥、靠港、天体、扫描，另有全域总览。暂停后切镜头，核对同一个Tick与世界版本；相机变化不能完成任务。主流程B05和生命周期测试覆盖相机往返，实际画面另由视觉审阅判断。
- **四链：**世界设置选择“四任务协同”，启动后观察补给、勘测—维修—运输、救援、采样—样本转运。通过任务步骤与事件确认运输/勘测/维修资格、救援能源来源和样本生成来源，不把四个任务名称当作多模型能力。主流程B02/B04核对真实结果。

完整对应见[贡献映射](CONTRIBUTION_MAP.md)。

## 两个可现场触发的失败

### 过期提案：批准不等于无条件执行

暂停世界，生成受控提案但不批准；记住任务数。点“单步”让世界变化，再点“批准一个任务”，应收到 `STALE_APPROVAL`，任务数不增加。重新生成并批准才增加一个待执行任务，仍不能直接宣布交付。

追踪[model-adapter.ts](../../packages/intelligence/src/dominion/model-adapter.ts)的 `approve`：核对proposal、session、worldVersion、sourceKey和有效期，再由运行时接受或拒绝。guide G02保留拒绝、过期及重复确认断言。这是人为构造的回归场景，不是生产事故。

### 全封闭：失败、恢复与新attempt

选择“全航道封闭”并启动，查看明确的不可达原因和失败attempt。打开“世界设置 → 重新开放所有航道”，回到任务页显式重试，再继续执行。核对原失败历史仍在，后续航段合法且交付只发生一次。

追踪[运行时](../../packages/intelligence/src/dominion/runtime.ts)的 `apply`、`schedule`、`act` 与[路径规划](../../packages/intelligence/src/dominion/planner.ts) `feasiblePath`。主流程B03保留失败→开放→重试的断言。导览中的单条禁行是合法绕行，不能把它冒充此处的全封闭失败演示。

额外10秒可验证人工接管：导览开始推进后点击“暂停世界”，等待3秒，检查Tick与导出命令不变；由演示者明确继续才恢复。guide G03检查这一语义，并检查360/390触控尺寸、SVG焦点和减弱动效首屏不加载重型场景。

## 五个源码追问

1. **表现层为什么不能把动画完成写成业务成功？** 看 `createDominionRuntime → apply → tick → schedule/act → finishStep`；[DominionScene](../../apps/portfolio/src/components/dominion/DominionScene.vue)的 `updateFacts` 只读取快照。任务完成必须有合法动作、资源转移和事件；runtime T03/T10及guide G01验证结果。
2. **预留、舰载、交付为什么不重复记账？** 看 `releaseReservation`、`act`、`finishStep`、`assertDominionInvariants`。预留是库存的子集，交付进入目标站库存，`mission.delivered` 只是审计投影；取消已装载任务仍保留资源归属。runtime T02、T13/T16与对抗测试有对应断言。
3. **旧Worker结果或旧导入为什么覆盖不了新世界？** 页面 `compare` 核对generation/sourceKey和当前快照，[Worker](../../apps/portfolio/src/workers/dominion.worker.ts)再验证请求来源；`reset`撤销旧任务，`importJSON`用importEpoch保护迟到读取，规划另有planningEpoch与dispose。[Worker测试](../../tests/e2e/dominion-worker.spec.ts)包含同步异常、错误信封及重置/切场景/取消后的迟到响应。
4. **比较为何必须从同一个快照开始，采用又为什么不复制终点？** [comparison.ts](../../packages/intelligence/src/dominion/comparison.ts)的 `compareStrategies` 从同源状态运行隔离副本，`findPath`/`feasiblePath`使用时效、能耗、稳健或平衡成本。页面 `adopt`只提交未来策略；runtime T17/T18、主流程B06与guide G04核对实况不变和分支结果。启发式比较不证明动态调度全局最优。
5. **导入记录和模型输出为什么不能直接信任？** [recording.ts](../../packages/intelligence/src/dominion/recording.ts)的 `validateRecording`先做结构/大小限制，再隔离完整重演；`replayFrame`只读取已验证前缀。适配器 `plan`/`approve`还需要只读工具、结构化合同、人工批准及来源绑定。记录一致性不认证作者，替身测试不证明真实LLM质量。

## 正式录屏与验收入口

当前干净源码 `157e5f6f9261ee8f7ed61f6688c2c1562166b374` 的原始影片编码时长101.640秒，业务完成观测96.913643秒；实际到达T67/W4、两任务完成，导出记录已由同构建页面严格重新导入验证。14张主图与11张补图的来源、状态、字节数与SHA256见[媒体清单](media-manifest.json)，桌面/手机S1–S6见[视觉报告](VISUAL_REVIEW.md)。原始影片索引以文末最终交付Release为准；旧3c及8b影片不能代表当前修正后的构建。

当前命令、范围与失败修复见[TEST_REPORT](TEST_REPORT.md)，[PERFORMANCE](PERFORMANCE.md)已更新为157e5f6的12样本实测；视觉判断见[VISUAL_REVIEW](VISUAL_REVIEW.md)。同一桌面主机的1440/390视口，V4实际绘制P95分别为16.8–16.9ms/16.8ms；预热后10秒活动窗口无长任务，冷加载单项最长分别430ms/210ms。它不是手机真机、全程零长任务或性能翻倍证明。正式演示以实际构建、实时状态与对应媒体清单讲述，不把历史完整回归当作当前整包通过。

最终交付记录（交付SHA、最终CI、匿名验收JSON与原始影片索引）统一见[v4.0.0 Release](https://github.com/Callmecx/chenxi-devlab-2026/releases/tag/v4.0.0)。本文的01afff76用于本次功能上线验收，不声明为永久最新交付提交。
