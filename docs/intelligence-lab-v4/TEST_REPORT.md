# V4 测试结果与需求映射

记录日期：2026-10-13，Asia/Shanghai。本文依据实际源码、独立定向测试，以及主任务保留的两轮生产浏览器原始结果编写。当前是集成阶段记录，**不能据此宣布最终整包、CI、公开部署或全部生命周期验收完成**。最终统一运行、提交及发布结果由集成负责人补充。

## 已运行结果与当前截点

| 运行 | 实际结果 | 证据与限制 |
| --- | --- | --- |
| G0 干净基线 `4d2a85f` | 类型、Lint、308 项单元/API、三站构建、微信/App资源构建及 95/95 浏览器通过 | 本轮实际重新运行的升级前基线，不能算作 V4 通过数。见 [基线说明](BASELINE_AND_SCOPE.md)。 |
| V4 整仓单元/API | **398/398**，24文件，0失败/跳过/todo；11:58:21开始，8.74秒 | V4领域90项包含在总数内（49适配器、19运行时、13记录、9对抗）；既有308项保留。上一轮397/398的截止时间输入假设失败仍保留，下述修正后本轮完整重跑通过。公开摘要：[vitest-results.json](../testing/vitest-results.json)。 |
| 独立适配器与首批对抗测试 | 54/54 通过，2026-10-13 11:25:27，3.94 秒 | 当时为适配器 49 项与对抗测试 5 项；不代表最新全部 90 项。 |
| 新增领域边界 | 截止时间、等待老化、同策略同故障、取消救援 4/4 通过，11:49:32，0.457 秒 | 定向选择四项，其余五项未被选中；没有向源码添加 `.skip`。适配器合成值标记修订后，11:54:04 再次 49/49 通过，0.637 秒。 |
| 第一轮 V4 生产浏览器 | **12/21**，9 失败，0 跳过、0 flaky；11:32:16 开始，194.188 秒 | 原始结果 `.local/v4/browser-first/results.json`。失败包括测试仍假设默认单任务、减弱动效默认二维入口，以及真实异步资源重试问题，不能改写为首轮全绿。 |
| 第二轮 V4 生产浏览器 | **24/26**，2 失败，0 跳过、0 flaky；11:46:17 开始，169.962 秒 | 原始结果 `.local/v4/browser-second/results.json`。12 项主流程、9 项 Worker/图形故障、3 项生命周期通过；导航监听计数和切场景资源计数失败，修复后待复验。 |
| 生命周期要求 | 五类各 10 轮；当前仅三类完整通过，共 30 轮 | 镜头往返、导入回放返回实时、世界重置通过。导航及切场景未完整通过；不能写“50 轮通过”。 |
| 新增 Worker 世界版本测试 | 已实现并通过类型检查、Lint；浏览器未运行 | 修改请求快照 `worldVersion` 而保留旧 `sourceKey`，要求真实 Worker 拒绝后可重新计算。未计入上面的 26 项。 |

上述 `.local/` 为被忽略的本地原始诊断目录，不是公开站点附件。原始 trace、运行数据库、会话及测试临时数据不会因本文成为发布候选。浏览器测量为桌面 Chrome 的真实网页执行，不是手机真机或物理 GPU 内存测量。

## 逻辑需求 T01–T24

编号采用用户 V4 附件原编号。下表说明实际断言，不以测试名称中的编号或数量替代覆盖。领域用例的最终合并结果仍以上述统一运行截点为准。

| 需求 | 实际检查 | 测试依据与状态 |
| --- | --- | --- |
| T01 单任务交付/账本 | 从标准补给场景逐步执行，真实交付、任务终态；每步检查库存、载荷、舰能量与消耗守恒 | [runtime.test.ts](../../packages/intelligence/src/dominion/runtime.test.ts)：正常场景参数化用例；领域已覆盖。 |
| T02 同一库存争用 | 两任务争 3 箱物资，不重复预留；取消只释放未装载预留，另一任务真实完成 | `runtime.test.ts`：finite resource conflict；领域已覆盖。 |
| T03 四任务/六舰资格 | 四任务完成，运输/勘测/维修各两舰；步骤角色、容量及资源约束在每步校验 | `runtime.test.ts`：four-missions、three regions；生产 B02 已运行。 |
| T04 未来边关闭 | 世界版本变化使旧路径失效，随后航段检查许可并走真实可行路线 | `runtime.test.ts`：closures；[dominion.spec.ts](../../tests/e2e/dominion.spec.ts) B03 检查实际后续 departures。 |
| T05 已进入航段关闭 | 保留原 transit，安全到其目标节点才检查新路径；不瞬移或倒退 | `runtime.test.ts`：closures；领域已覆盖。 |
| T06 全封闭 | 明确 `UNREACHABLE`，能耗不凭空增加，有限结束 | `runtime.test.ts`：sealed；B03 全封闭生产流程已运行。 |
| T07 恢复及 attempt | 开放路径后显式重试；保留失败历史。截止时间失败也保留装载进度/预留，重试不重复装货 | `runtime.test.ts`：failure retry；[adversarial.test.ts](../../packages/intelligence/src/dominion/adversarial.test.ts)：deadline、half-load；新增期限边界定向通过。 |
| T08 泊位容量 | 不挤走在站或已预约舰；全部可用泊位被占时等待并有限失败，释放后显式恢复 | `runtime.test.ts`：dock exclusion；每步 dock invariant。 |
| T09 能量与救援 | 能量不足不能发车；救援实际转移 18 EU、消耗维修件，不生成免费能量。半装载故障、救援、重试及取消救援均保持账本 | `runtime.test.ts`：low-energy、rescue；`adversarial.test.ts`：半装载恢复、取消已装载救援，已定向验证。 |
| T10 前置依赖 | 勘测完成后才能维修，维修完成后才能运输；实际维修消耗零件且不会覆盖用户关闭许可 | `runtime.test.ts`：relay sequence、closures；生产 B04 已运行。 |
| T11 优先级/公平等待 | 紧急任务插入保留已有 transit/cargo；等待老化 32 tick 后，旧低基础优先级任务先获得释放库存 | `runtime.test.ts`：urgent insertion；`adversarial.test.ts`：age-weighted inventory waiting 已定向通过。此策略有等待上限，不声称任意持续新任务下永不饥饿。 |
| T12 无进展有限终止 | 合成泊位阻塞触发等待/无进展上限；不会无限循环，允许改变环境后显式恢复 | `runtime.test.ts`：dock exclusion；资源约束和 `MAX_WAIT` 实际断言。 |
| T13 重复命令/事件/工具 | 同键同参数无重复动作；同键不同参数拒绝；重复/乱序事件和命令导入拒绝；迟到工具输出不再具备提交权 | `runtime.test.ts`：idempotent commands；`adversarial.test.ts`：conflicting command；[recording.test.ts](../../packages/intelligence/src/dominion/recording.test.ts)、[model-adapter.test.ts](../../packages/intelligence/src/dominion/model-adapter.test.ts)。运行时没有假装存在外部异步航行动作。 |
| T14 Worker 来源 | UI 拒绝错误 generation/sourceKey；Worker 校验 sourceKey 与快照；过期版本不可采用 | [dominion-worker.spec.ts](../../tests/e2e/dominion-worker.spec.ts)：两个错误信封测试第二轮通过；新增真实请求 `worldVersion` 错配测试等待浏览器运行。 |
| T15 迟到结果隔离 | 重置、切场景、取消任务后，旧 Worker 的真实计算结果和迟到 onerror 均不污染新任务，也不终止新比较 | `dominion-worker.spec.ts`：三种 intervention 第二轮通过，比较前后导出完整记录一致。 |
| T16 终态不复活 | completed/cancelled 不能重试回 running；关闭会话不可写；新建其他任务不改旧交付；取消救援不迟到加油 | `runtime.test.ts`、`adversarial.test.ts` 对终态、取消和新任务逐项断言。 |
| T17 同源可复现 | 两个隔离副本保留相同 seed/faults/parentSessionId/forkSeq；相同策略的路径、能耗、结果及确定性状态一致 | `runtime.test.ts`：same constrained future；`adversarial.test.ts`：same-policy-faults 已定向通过。真实墙钟耗时不作为确定性世界事实。 |
| T18 采用仅改政策 | 比较不改原世界；采用不复制预测终点、交付和库存；世界变化后旧结果不能提交 | `runtime.test.ts`：same snapshot branches；生产 B06 检查采用前后真实账本、时钟和后续执行。 |
| T19 有害/损坏导入 | 超过 16 MiB、循环、访问器、原型、非法版本、伪造库存/交付/位置、乱序和缺失记录均拒绝；原有效世界保留 | `recording.test.ts`；生产 B07。访问器测试检查 getter 没有执行。 |
| T20 严格回放 | 标准 initial + 完整命令在隔离运行时重演；事件及 final 一致后才冻结索引帧；seek 不执行命令或网络工具；保留原工具实测耗时 | `recording.test.ts`：immutable read-only seeking；生产 B07；10 轮合法导入/seek/返回实时生命周期第二轮通过。 |
| T21 已知信息边界 | 扫描前不生成样本；发现带站点、舰、mission、tick；工具不返回未来故障时序，勘测结果来自当前已知 facts | `runtime.test.ts`：discovery precedes generated samples；`model-adapter.test.ts`：isolated current facts and feasible route。 |
| T22 通信恢复 | 断开暂停且拒绝执行；重连保留身份和命令事实，不自动重新建任务，必须显式继续 | `runtime.test.ts`：connection loss；生产 B08。这里只是本地断连命令，不是公网网络恢复证明。 |
| T23 日志分页 | 最近 40 条工具展示不丢完整事件；50 次工具事件仍能导出重演；1024 命令边界安全关闭且最后一帧可严格回放 | `recording.test.ts`：tool pagination；`adversarial.test.ts`：history boundary。达到总历史上限会明确关闭，不声称无限执行。 |
| T24 模型适配器 | 严格 Zod、只读白名单、世界来源、人工批准、预算预留/去重、单并发、超时/取消/迟到、恶意文本惯性数据、服务端能力校验 | `model-adapter.test.ts` 最新 49/49 定向通过。所有 caller 均为明确替身；无真实提供方调用、SDK、收费或持久化账单证明。 |

## 浏览器需求 B01–B10

| 需求 | 当前证据 | 剩余边界 |
| --- | --- | --- |
| B01 默认远征/检查/结果/重置 | 主流程生产用例显式选择 supply 验证实际交付、对象、账本、新 session；开发环境另有默认 expedition 事件导览 | 默认导览最新生产复验由根任务补充，不能把显式 supply 当作默认 expedition 的证明。 |
| B02 多舰/四任务 | 第二轮主流程四任务、六舰角色、真实样本、维修与救援结果通过 | 不声称多 LLM Agent。 |
| B03 关闭/恢复/重规划 | 实际关闭未来航道、核对后续航段，封闭失败、开放及新 attempt 通过 | 所有世界为隔离合成数据。 |
| B04 扫描与维修 | four-missions 流程包含完整扫描→维修→运输；动作和消耗来自导出记录 | 视觉画面品质单列 [视觉报告](VISUAL_REVIEW.md)。 |
| B05 镜头及二维往返 | 生产相机用例比较各模式及原世界不变；体验舱镜头往返 10 轮生命周期通过 | 平台资源计数不等于手机 GPU 测量。 |
| B06 比较/采用/继续 | 真实 Worker 两分支结果、航迹、约束，采用仅改变未来政策；原世界随后实际执行通过 | 不把分支预测作为实况交付。 |
| B07 回放/JSON恢复 | 正常 seek、损坏导入拒绝、返回实时；10 轮合法导入/回放/返回实时通过 | 记录是确定性一致性校验，不是外部签名或身份认证。 |
| B08 手机/键盘/减弱动效 | 360/390/768/1440/1920 视口、可达控制、溢出及键盘对象控制主流程通过；真实 context loss 用例在用户启用三维后执行 | 浏览器视口不是手机真机；最新 UI 源码需同构建最终复验。 |
| B09 故障不崩溃 | 第二轮 9 项 Worker/图形故障通过：同步构造/postMessage异常、错误信封、迟到回调、真实 WebGL 丢失与资源失败恢复 | 新增 worldVersion 请求错配测试未运行；两项生命周期修复仍待生产复验。 |
| B10 原站回归 | G0 95/95 是本轮升级前真实重跑，旧业务断言保留；V3 路由移至 `/intelligence/v3` | 当前 V4 主入口下的全站 9 路由、既有 4 业务流程须由最终统一浏览器运行确认，不能复用 G0 成绩。 |

## 真实失败与修复历史

1. **历史预算让运行世界无法再暂停。** 原预算耗尽后只拒绝命令，世界仍 running。现预留最后一个命令和事件余量，安全关闭、释放未装载预留、保留事实；拒绝的原请求及 `session.history-budget` 写入记录，之后所有写入不改变归档。独立测试已在 1024 命令边界导出并严格重演。
2. **规划成本与展示公式不一致。** 四跳路线声明 balanced 得分 12，却因隐藏每跳 `+1` 输给得分 14 的直达路线。已移除隐藏成本；回归保持精确路径和分数断言，已通过。
3. **同一命令 ID 换参数误报成功。** 先关闭航道再用相同 ID 请求打开，旧代码返回 accepted=true 而世界未打开。现对规范化参数比对，冲突拒绝且无新增历史；回归已通过。
4. **回放显示了验证器新测耗时。** 严格重演允许墙钟波动，但展示不能把验证器耗时当原执行耗时。现完整事件记录原 duration，验证事件与 final 对齐并回填冻结回放帧；末帧严格相等断言保留。
5. **首轮浏览器测试使用了旧默认任务数。** 默认现为 expedition 两任务，测试仍要求一任务。Worker 测试改为通过可见设置显式选择 supply；切场景仍精确要求 expedition 两任务，没有改为模糊“至少完成一项”。减弱动效默认二维的场景，也先明确点击三维再注入真实 context loss，没有取消故障断言。
6. **异步场景资源失败后不能真实恢复。** 第一轮保留失败证据，UI 修复加载与重试路径；第二轮仍使用真实资源请求失败、二维继续、三维恢复及源世界相等断言，并已通过。
7. **导航资源探针计入 Playwright 自身监听。** 第二轮第二次挂载发现 `window:__playwright_global_listeners_check__:bubble` 增加。已从本机 Playwright `InjectedScript._setupGlobalListenersRemovalDetection()` 源码确认来源，仅将这个精确内部事件排除应用增长判定，原始 ledger 仍记录它；业务监听无新增容差。修订后的十轮导航尚待重跑。
8. **切场景资源增长。** 第二轮第六轮 supply 的活动 GL Buffer 从 357 增至 373。没有增加阈值或预热掩盖；渲染负责人已让新 session 清理重建资源，并补齐 InstancedMesh 实例矩阵/VAO dispose、renderLists 和旧引用清理。修复源码的类型/Lint检查与生产十轮复验应分开，当前仍待后者确认。
9. **新增期限测试的时钟假设错误。** 实际固定场景 T5 刚开始装载、elapsed=0，原测试误认 elapsed=1。测试输入期限改为 T6，明确断言 T6 半装载、T7 才失败、重试期限 T13，以及一次装载。该单项曾使统一运行成为 397/398；修订后的四项边界定向已通过，全仓结果待更新。
10. **合成非法策略字段触发发布扫描。** 适配器测试使用无来源的假 `apiKey` 字符串，但外观被扫描器命中。现改为显式 `demo-` 测试值，仍断言额外凭据字段被严格 schema 拒绝；未改扫描器，49 项适配器测试再次通过。发布候选扫描须由根任务重跑确认。

## 尚未验收的范围

最终全仓 398 项结果、当前全部浏览器用例和五类完整 50 轮、最新生产截图/完整视频、性能、CI、Release、Pages 公网及匿名访问由各自最终证据补充。当前无真实模型调用、公网模型后端、手机真机、VR/XR设备或真实航天/物流运行验收。保留这些边界，不以构建、源码存在或历史版本成绩替代。
