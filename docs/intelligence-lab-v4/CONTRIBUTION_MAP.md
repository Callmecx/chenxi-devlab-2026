# 星域智航 V4 · 功能、源码、测试与贡献映射

状态截点：2026-10-13，预发布阶段。最新源码全仓399项单元/API测试通过；候选 `c69eb4b` 的第三轮完整生产浏览器回归为123/126，3失败、无跳过或重试，耗时703.003秒（约11.7分钟）。默认远征、受控提案和完整事件导览通过，Worker/图形故障10项通过，五类生命周期中四类各10轮通过；三项失败随后定向复验通过；新增修复源码仍需重新整包回归。性能、最终媒体、CI及公开部署待确认。本文映射实现和断言，实际结果与失败历史统一见[测试报告](TEST_REPORT.md)，发布边界见[模式说明](MODE_AND_RELEASE_STATUS.md)。

候选 `c69eb4b` 的12个性能样本已经完成；它们属于新图层合入前的候选测量，最终源码仍需复测，不能作为最终性能指标。单元/API最新运行开始于12:35:25，耗时4.15秒，24文件、0失败/跳过/todo。

## 三类舰与四条业务链

世界包含11站、16条航道和六艘舰：运输、勘测、维修各两艘。角色资格由运行时校验；模型、动画与相机不能授予舰船越权操作能力。

| 业务链与职责               | 实现及关键函数                                                                                                                                                                                   | 真实结果与约束                                                                        | 测试依据                                                                                                                                                               | 演示                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 常规补给：运输舰           | [fixtures.ts](../../packages/intelligence/src/dominion/fixtures.ts) `createMission('supply')`；[runtime.ts](../../packages/intelligence/src/dominion/runtime.ts) `schedule`、`act`、`finishStep` | 预留→实际装载→合法航行→目标站入库；能源与物资分别记账，预留不等于交付                 | [runtime.test.ts](../../packages/intelligence/src/dominion/runtime.test.ts) 标准场景、库存争用、取消载荷；[dominion.spec.ts](../../tests/e2e/dominion.spec.ts) B01/B03 | 选择“深空补给”，检查目的站库存与任务交付         |
| 中继接力：勘测→维修→运输   | `createMission('relay')`、`schedule`、`finishStep`                                                                                                                                               | 扫描生成有来源的发现；维修实际消耗2件；之后才运输科研载荷。修复损坏不覆盖用户禁行许可 | runtime T03/T10、T04/T05；[dominion-guide.spec.ts](../../tests/e2e/dominion-guide.spec.ts) G01/G04                                                                     | 默认“远征接力”或事件导览，观察三种角色的前置依赖 |
| 紧急救援：维修舰支援受困舰 | `createMission('rescue')`、`act`、`releaseReservation`                                                                                                                                           | 实际转移18 EU并消耗1维修件；受困舰保留中断工作，取消救援不能迟到加油或销毁已装载资源  | runtime T09；[adversarial.test.ts](../../packages/intelligence/src/dominion/adversarial.test.ts) 半装载救援、取消救援                                                  | “四任务协同”查看救援事件、双方能源和恢复后的作业 |
| 科研采样：勘测→运输        | `createMission('science')`、`act`、`finishStep`                                                                                                                                                  | 扫描前没有未来样本；样本生成带来源，之后才能装运至科研站，期限约束保留失败attempt     | runtime T21；adversarial期限用例；dominion B02/B04                                                                                                                     | “四任务协同”查看发现、生成账本和样本实际转运     |

跨链约束集中在[不变量](../../packages/intelligence/src/dominion/invariants.ts)的 `assertDominionInvariants`：站存、舰载、舰能源、生成和消耗保持归属与守恒；`mission.delivered` 是审计投影，不在总量中重复相加。泊位、航道预约、载荷、能量与有限等待同样属于业务条件。

## 六个共享视图

六个视图使用同一个 `createDominionRuntime`，由[StarCommand.vue](../../apps/portfolio/src/pages/StarCommand.vue)的 `changeView` 切换展示；切视图不重建会话。

| 视图     | 用户可操作内容                                                        | 源码入口                                                                                                                    | 对应检查                                                                                           |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 指挥中枢 | 启动、暂停、单步、速度、事件导览与接管                                | `primary`、`send`、`startGuide`、`advanceGuide`、`userTakesControl`                                                         | guide G01/G03/G04：真实完成、暂停按钮语义、接管后不再自动提交                                      |
| 全息星图 | 过滤区域、键盘选择站/舰/航道、检查许可和状态                          | [DominionMap.vue](../../apps/portfolio/src/components/dominion/DominionMap.vue)，页面 `choose`、`openDrawer`、`closeDrawer` | dominion B08；guide G03：Enter打开、Escape关闭并归还SVG焦点                                        |
| 舰队协同 | 查看角色、能源、载荷、航段与当前任务，选择跟踪对象                    | 页面 `choose`、`setCamera`；快照 `ships`                                                                                    | dominion B02/B04、B05：六舰资格、同世界相机投影                                                    |
| 任务编排 | 四类任务、优先级、取消/重试、受控提案与人工批准                       | `addMission`、`retryMission`、`planMission`、`approveProposal`                                                              | dominion B03；guide G02：拒绝、来源过期、重复确认不增任务                                          |
| 体验舱   | 切换五种观察体验、全域复位、二维/三维                                 | `setCamera`、`toggleFlat`、`cameraRequest`                                                                                  | dominion B05；[生命周期测试](../../tests/e2e/dominion-lifecycle.spec.ts)：镜头往返、离开与重新进入 |
| 工程档案 | 事件分页、资源账本、工具证据、策略比较、导出/导入与历史回放、源码报告 | `compare`、`adopt`、`exportJSON`、`importJSON`、`beginReplay`、`seek`                                                       | dominion B06/B07；[Worker测试](../../tests/e2e/dominion-worker.spec.ts)；recording严格重演         |

## 五种观察体验与原创场景

[DominionScene.vue](../../apps/portfolio/src/components/dominion/DominionScene.vue)的 `configureCamera` 管理同一相机，`updateFacts` 投影世界，`takeCamera` 处理用户接管。五种体验之外另有“全域”总览与对象检查镜头。

| 体验   | 对应实际对象与实现                                                          | 边界                                             |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------------ |
| 跟随   | 所选舰的当前位置与航段                                                      | 跟随不额外推进Tick或交付                         |
| 指挥桥 | `ensureBridge` 按需创建实体舷窗与三块控制台，显示真实导航、舰状态和任务数据 | 无VR设备；手机侧屏可能裁边，不宣称三屏均完整可读 |
| 靠港   | 港口、泊位与作业位置                                                        | 镜头停留不代表完成装卸                           |
| 天体   | 所选站/舰/航道所属区域                                                      | 原创合成尺度，不是科学航天模型                   |
| 扫描   | 勘测舰、任务和当前发现                                                      | 可视效果不生成未来业务事实                       |

[assets.ts](../../apps/portfolio/src/components/dominion/assets.ts)的几何、材质和控制台为本项目程序生成，没有下载外部模型或纹理。框架与库保留其开源许可。实际视觉品质、性能和资源释放分别依据[视觉审阅](VISUAL_REVIEW.md)、[性能报告](PERFORMANCE.md)及最终浏览器记录，不用测试数量替代画面评价。

## 工程机制与简历表达

| 功能                         | 源码/关键函数                                                                                                                                                                                                                                                            | 测试依据                                                                                                                         | 演示与保守简历表述                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 四种启发式策略，同源分支隔离 | [planner.ts](../../packages/intelligence/src/dominion/planner.ts) `findPath`/`feasiblePath`；[comparison.ts](../../packages/intelligence/src/dominion/comparison.ts) `compareStrategies`；[worker](../../apps/portfolio/src/workers/dominion.worker.ts) `self.onmessage` | runtime T17/T18；Worker同步异常、错误信封、过期版本及迟到回调；guide G04核对真实分支                                             | 暂停后比较时效/能耗/稳健/平衡，采用只改后续政策；可写“Worker策略比较与来源校验”，不写全局最优 |
| 异步隔离与可恢复资源失败     | 页面 `compare`、`reset`、`importJSON`、`loadScene`、`controlledSceneUrl`；generation、importEpoch、planningEpoch                                                                                                                                                         | Worker故障测试及生命周期测试；guide G03首屏二维/减弱动效                                                                         | 切世界后旧结果无提交权；三维异常可保持世界并在同源受控模块上重试                              |
| 严格记录与只读回放           | [recording.ts](../../packages/intelligence/src/dominion/recording.ts) `validateRecording`、`replayFrame`                                                                                                                                                                 | [recording.test.ts](../../packages/intelligence/src/dominion/recording.test.ts) T19/T20/T23；dominion B07                        | 导入后隔离重演，seek只读已验证前缀；可写“事件溯源与未来状态隔离”，不写外部身份认证            |
| 受控规划提案                 | [model-adapter.ts](../../packages/intelligence/src/dominion/model-adapter.ts) `createPlannerAdapter`、`plan`、`approve`、`executeReadTool`                                                                                                                               | [model-adapter.test.ts](../../packages/intelligence/src/dominion/model-adapter.test.ts)：来源、预算、取消、超时、幂等；guide G02 | 查看工具证据→拒绝/批准；可写“规划适配器与人工确认边界”，必须标注默认无网络替身                |
| 可接管导览                   | 页面 `startGuide`、`advanceGuide`、`stopGuide`、`primary`                                                                                                                                                                                                                | guide G03/G04：不加速真实等待、事件门控、接管后3秒命令不变                                                                       | 展示勘测→封路→维修→暂停比较→交付；不能把定时停顿或分支预测当成功                              |

个人贡献可以表述为需求判断、架构取舍、AI协同实现、调试及证据验收；这些职责必须能够回到上述源码和演示。可替换项目段落见[简历条目](RESUME_BULLETS.md)，具体讲述见[三分钟路线](DEMO_GUIDE.md)。真实模型、公网模型服务、真机与VR/XR验收均不在当前成果范围。
