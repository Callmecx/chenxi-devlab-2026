# 星域智航 V4 · 三分钟演示与源码追问

截至2026-10-13，最新源码399项单元/API测试通过，候选 `c69eb4b` 的第三轮完整生产浏览器回归123/126、3失败，无跳过或重试。默认远征G01、提案G02和完整导览G04已在生产包通过；G04整条测试100.020秒，导览达到真实完成的观测时间96.807秒。Worker/图形10项及40轮生命周期通过，三项失败随后定向复验通过，新增源码仍需整包回归，性能、最终媒体、CI及公开部署尚未完成。本页操作与证据范围见[测试报告](TEST_REPORT.md)，模式边界见[模式说明](MODE_AND_RELEASE_STATUS.md)。

候选 `c69eb4b` 的12个性能样本已经完成；它们属于新图层合入前的候选测量，最终源码仍需复测，不能作为最终性能指标。单元/API最新运行开始于12:35:25，耗时4.15秒，24文件、0失败/跳过/todo。

## 演示准备

在仓库根目录执行 `npm run build`，然后 `npm run preview`。默认本机生产入口为 `http://127.0.0.1:4173/#/intelligence`；自定义 `PORT`/`BASE_PATH` 时以终端输出为准。开发临时服务与测试端口不是公开链接，V4公网入口须以实际部署报告确认。

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

若只演示30秒：选择4×速度并启动默认远征，展示任务依赖和能源/载荷，再切二维说明同一快照；只讲页面当时实际状态，不承诺30秒内完成。

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

## 验收入口

最终命令、范围与失败修复见[TEST_REPORT](TEST_REPORT.md)，真实采样见[PERFORMANCE](PERFORMANCE.md)，视觉判断见[VISUAL_REVIEW](VISUAL_REVIEW.md)。本页不重复开发阶段的固定Tick、测试小计或临时视频；正式演示应使用最终构建，并以其实际状态和媒体清单讲述。
