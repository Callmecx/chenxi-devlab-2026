import research from "../../../../docs/research/project-evidence.json";
export interface Project {
  slug: string;
  name: string;
  subtitle: string;
  category: string;
  number: string;
  summary: string;
  tags: string[];
  tone: string;
  goal: string;
  flow: string[];
  architecture: string[];
  challenge: string;
  solution: string;
  evidence: string;
  github?: string;
  sourceLabel?: string;
  demo?: string;
  screenshot?: string;
  screenshotCaption?: string;
  limitations?: string[];
  features?: string[];
  status: string;
  role?: string;
  reviewedAt?: string;
  historicalAcceptanceDate?: string | null;
  evidenceSources?: string[];
  verifiedScope?: string[];
  pendingScope?: string[];
  screenshotAlt?: string;
  decisions?: { title: string; trigger: string; choice: string; tradeoff: string; evidence: string }[];
  interactiveRoute?: string;
  interactiveLabel?: string;
  simulationNotice?: string;
}
export const siteBase = import.meta.env.BASE_URL;
export const demoUrl = (path: string) => `${siteBase}${path}/`;
export const projects: Project[] = [
  {
    slug: "shop-pilot",
    name: "ShopPilot",
    subtitle: "把一笔订单的每一步，认真做好。",
    category: "前端体验",
    number: "01",
    summary:
      "从 SKU 库存到优惠计算，再到订单状态：一个可完整操作的 uni-app 电商实验。",
    tags: ["uni-app", "Vue 3", "TypeScript"],
    tone: "shop",
    goal: "用可运行的购买流程展示跨端 UI、业务状态与边界处理能力。所有商品、地址与订单均为演示数据，无支付与物流服务。",
    flow: ["检索商品", "选择 SKU", "购物车结算", "演示地址", "模拟订单"],
    architecture: [
      "uni-app 跨端页面",
      "TypeScript 业务规则",
      "本地持久化状态",
      "模拟订单服务",
    ],
    challenge:
      "购物车数量、SKU 库存、优惠门槛和订单快照需要在页面切换与重复提交时保持一致。",
    solution:
      "金额以整数分运算；提交时重新校验库存；订单保存独立快照；持久化状态恢复时校验结构。",
    evidence: "验收结果见仓库 TEST_REPORT.md。演示数据仅保存于当前浏览器。",
    demo: demoUrl("shop"),
    status: "交互演示",
  },
  {
    slug: "pulse-campaign",
    name: "PulseCampaign",
    subtitle: "让一次城市相遇，从指尖开始。",
    category: "前端体验",
    number: "02",
    summary:
      "城市创意活动 H5。从场次选择到多步骤预约，兼顾视觉节奏与交互反馈。",
    tags: ["Vue 3", "Pinia", "H5"],
    tone: "pulse",
    goal: "用虚构城市活动展示移动端布局、表单校验与可恢复的预约流程。不采集手机号、身份证或真实地址。",
    flow: ["探索活动", "选择场次", "填写演示信息", "确认预约", "查看记录"],
    architecture: [
      "Vue Router 页面层",
      "可复用表单组件",
      "Pinia 草稿与记录",
      "Mock 异步提交",
    ],
    challenge:
      "多步骤流程需要保留输入，处理返回修改、校验失败、提交失败和再次提交。",
    solution:
      "显式步骤状态与校验规则；本地保存草稿；提供可控的失败演示与重试反馈。",
    evidence: "验收结果见仓库 TEST_REPORT.md。活动品牌和数据均为原创演示。",
    demo: demoUrl("pulse"),
    status: "交互演示",
  },
  {
    slug: "enterprise-flow",
    name: "EnterpriseFlow",
    subtitle: "让企业业务流转，有迹可循。",
    category: "全栈系统",
    number: "03",
    summary: "企业管理系统实践，关注业务流程、权限边界与前后端协作。",
    tags: ["Vue", "Java", "Spring Boot"],
    tone: "enterprise",
    goal: "将企业管理需求拆解为可维护的模块与业务流程。",
    flow: ["业务建模", "管理界面", "接口协作", "权限控制"],
    architecture: ["Vue 管理前端", "Spring Boot 服务", "业务领域模块"],
    challenge: "管理系统需要在多个业务模块中保持组件、权限和接口约定一致。",
    solution: "根据可核实项目资料补充具体实现。",
    evidence: "旧项目源码不包含于此仓库；仅展示经核实的脱敏项目摘要。",
    status: "项目档案",
  },
  {
    slug: "agent-workbench",
    name: "AI Agent Workbench",
    subtitle: "把 AI 能力，组织成可检查的工作流。",
    category: "AI 应用",
    number: "04",
    summary: "围绕 AI 应用工作流的工程实践，关注任务组织、工具集成与运行反馈。",
    tags: ["AI 工程", "工作流", "接口集成"],
    tone: "agent",
    goal: "将 AI 能力嵌入明确的任务流程，呈现过程和结果。",
    flow: ["定义任务", "组织工具", "运行流程", "检查结果"],
    architecture: ["任务交互层", "Agent 工作流", "工具与模型接口"],
    challenge:
      "模型输出与工具执行存在不确定性，需要可观察的状态和明确的失败反馈。",
    solution: "根据可核实项目资料补充具体实现。",
    evidence: "本次不重跑旧项目服务，不声称其线上可用性。",
    status: "项目档案",
  },
  {
    slug: "poker-replay",
    name: "PokerReplay",
    subtitle: "从原始数据，到可回溯的分析。",
    category: "数据与工具",
    number: "05",
    summary: "数据自动化项目，围绕采集、整理与复盘构建可检查的数据处理流程。",
    tags: ["Python", "数据处理", "自动化"],
    tone: "poker",
    goal: "降低重复整理数据的成本，并保留可追溯的处理过程。",
    flow: ["输入数据", "解析转换", "整理记录", "复盘检查"],
    architecture: ["数据输入层", "自动化处理", "结果与日志"],
    challenge: "数据来源与格式差异要求明确的解析规则和错误处理。",
    solution: "根据可核实项目资料补充具体实现。",
    evidence: "本仓库不包含历史原始数据或第三方平台内容。",
    status: "项目档案",
  },
  {
    slug: "solana-radar",
    name: "Solana Radar",
    subtitle: "让链上信号，变成可读的信息。",
    category: "数据与工具",
    number: "06",
    summary: "链上数据监控与预警实践，关注数据获取、事件处理与可观察性。",
    tags: ["Python", "Solana", "事件监控"],
    tone: "radar",
    goal: "围绕链上事件建立数据处理与预警流程。项目展示不提供投资建议。",
    flow: ["读取事件", "识别信号", "规则处理", "呈现预警"],
    architecture: ["链上数据接口", "规则处理", "监控输出"],
    challenge: "外部数据源延迟、重复事件与异常响应影响监控可靠性。",
    solution: "根据可核实项目资料补充具体实现。",
    evidence: "无收益、交易成功率或生产规模承诺。",
    status: "项目档案",
  },
  {
    slug: "rust-tools",
    name: "Rust 链上工具",
    subtitle: "关注边界，也关注运行效率。",
    category: "数据与工具",
    number: "07",
    summary: "Rust 链上工具实践，探索类型约束、异步任务与系统边界。",
    tags: ["Rust", "异步任务", "链上工具"],
    tone: "rust",
    goal: "用明确的类型与错误处理承载链上数据工具需求。",
    flow: ["输入校验", "异步处理", "错误分类", "结果输出"],
    architecture: ["命令入口", "类型化核心", "外部 RPC 接口"],
    challenge: "异步系统与外部接口需要清晰区分输入错误、网络错误与执行结果。",
    solution: "根据可核实项目资料补充具体实现。",
    evidence: "仅记录经过源码核实的技术事实，不公开私钥或客户数据。",
    status: "项目档案",
  },
];
const evidenceIds: Record<string, string> = {
  "agent-workbench": "ai-agent-workbench",
  "rust-tools": "rust-chain-tools",
};
projects[0].screenshot = 'screenshots/shop-checkout-390.png';
projects[0].github = 'https://github.com/Callmecx/chenxi-devlab-2026/tree/main/apps/commerce-mini';
projects[0].sourceLabel = '查看本项目源码';
projects[0].screenshotCaption = '既有 Chrome 验收截图：ShopPilot 演示地址、优惠与订单金额确认；不是本轮 V2 重新截图。';
projects[0].limitations = ['本地 Mock 商城，无真实支付、物流或跨设备库存服务。', '微信小程序已编译为游客 AppID 产物，未做微信审核上线或真机验收。'];
projects[1].screenshot = 'screenshots/pulse-390.png';
projects[1].github = 'https://github.com/Callmecx/chenxi-devlab-2026/tree/main/apps/campaign-h5';
projects[1].sourceLabel = '查看本项目源码';
projects[1].screenshotCaption = '既有 Chrome 验收截图：PulseCampaign 移动端活动选择首页；不是本轮 V2 重新截图。';
projects[1].limitations = ['活动品牌、地点和名额均为虚构演示；记录只保存于当前浏览器。', '不采集真实手机号或身份证，不提供正式活动报名服务。'];
for (const project of projects) {
  const evidence = research.projects.find(
    (p) => p.id === (evidenceIds[project.slug] ?? project.slug),
  );
  if (!evidence) continue;
  Object.assign(project, {
    name: evidence.title,
    category: evidence.category,
    status: evidence.status,
    subtitle: evidence.subtitle,
    summary: evidence.description,
    tags: evidence.tags,
    goal: evidence.goal,
    flow: evidence.workflow,
    architecture: evidence.architecture,
    challenge: evidence.challenge,
    solution: evidence.solution,
    evidence: evidence.evidence.join(" "),
    github: evidence.sourceUrl ?? undefined,
    sourceLabel: evidence.sourceLabel ?? undefined,
    screenshot:
      evidence.screenshot?.replace("docs/research/assets/", "evidence/") ??
      undefined,
    screenshotCaption: evidence.screenshotCaption,
    limitations: evidence.limitations,
    features: evidence.features,
    reviewedAt: research.reviewDate,
    historicalAcceptanceDate: evidence.historicalAcceptanceDate,
    evidenceSources: evidence.sourceRefs,
    screenshotAlt: evidence.id === 'solana-radar'
      ? 'Solana Radar V23 已脱敏历史运行报告摘录，PAPER ONLY，非实时界面'
      : evidence.screenshotCaption,
  });
}

const details: Record<string, Partial<Project>> = {
  'enterprise-flow': {
    role: '个人开发、AI 辅助：梳理模拟业务流程，完成 Vue / Java 工程实现与验收资料整理；不量化独立代码占比。',
    verifiedScope: ['资料支持销售审批、部分预留、缺口采购、全量收货出库与分次结算。', '历史 README 记录 19/19 回归、七角色业务链和重启持久化；本轮只核对资料，没有重跑原服务。'],
    pendingScope: ['历史验收具体执行日期未在结构化材料中确认，不以资料审阅日期替代。', '无公网业务部署；整套 Docker 部署及生产压力表现未验收。'],
    interactiveRoute: '/labs/enterprise-flow',
    interactiveLabel: '打开独立业务仿真',
    simulationNotice: '本轮另写的浏览器仿真解释 50 台需求、30 台库存与 20 台采购缺口；不连接原 Java 服务，不代替其历史验收。',
    decisions: [
      { title: '库存不足时，先预留可用部分', trigger: '模拟销售需要 50 台，仓库只有 30 台；若把审批简单等同出库，会丢失需求缺口与采购关系。', choice: '审批预留 30 台，保留 20 台缺口；关联采购到货后补足预留，再全量出库。原项目使用事务、库存预留和采购覆盖规则。', tradeoff: '范围明确为单仓销售、全量收货与全量出库；不把它描述为跨仓调拨或多租户 ERP。', evidence: '既有 README、SalesService / PurchaseService 源码锚点、七角色浏览器业务链；模拟数字不是客户交易规模。' },
      { title: '重复操作与分次结算保持一致', trigger: '审批、收货与财务操作可能重复触发；分次收款不能超出剩余应收。', choice: '原服务包含事务与 IdempotencyService 引用，金额采用 BigDecimal，后端校验权限和余额。用库存与账款结果核对业务正确性。', tradeoff: '不据此声称完整会计总账、真实支付或分布式吞吐保证；本轮独立仿真使用整数分，不能冒称原 Java 实现。', evidence: '历史 19 项回归及服务审计；20 个订单争抢 10 台的历史用例是正确性验证，不是性能基准。' },
    ],
  },
  'agent-workbench': {
    role: '个人求职作品：AI 交互工作流、Node BFF 与协议边界；采用 AI 协同，独立贡献比例不作量化。',
    verifiedScope: ['真实 HTTP / SSE、停止重试、TXT / MD 分块与词法检索有源码及历史验收。', '2026-09-20 记录 34/34 单元/集成和 10/10 smoke；本轮未重跑。'],
    pendingScope: ['未联调真实付费模型供应商，未验证语义向量检索或自主 LLM 工具循环。', '本地单用户应用；没有公网安全沙盒与多租户验收。'],
    decisions: [
      { title: '流式输出不等于完整消息', trigger: 'SSE 可以被拆帧或截断，页面不能把一次网络 chunk 当成一次完整模型事件。', choice: '增量 parser 处理 UTF-8 拆分、帧边界与终止事件；请求状态与渲染状态分开。', tradeoff: '兼容协议经本地伪上游验证，真实付费供应商行为仍需独立联调。', evidence: 'OpenAICompatibleProvider、共享 SSE parser 与 2026-09-20 ACCEPTANCE_REPORT。' },
      { title: '旧请求不能覆盖新会话', trigger: '切换会话、停止或重新生成后，旧请求仍可能迟到。', choice: 'AbortController 配合请求序列隔离，组件卸载时清理请求和图表；失败与取消分别反馈。', tradeoff: '本地单用户工作流，不等于服务端多租户任务调度。Mock 回答走真实传输，仍须标明模型回答为模拟。', evidence: 'Composables、Chat 截图与历史浏览器 smoke 记录。' },
    ],
  },
  'poker-replay': {
    role: '采集、规则加工与 Excel 定制交付；交付及验收为本人确认，未获得独立客户验收文件。',
    verifiedScope: ['资料支持网页响应监听、JSON 整理、玩家视角规则与 Excel 输出链路。', '保留数据身份与报告行统计口径，不把工作簿数当作客户数。'],
    pendingScope: ['没有标准断言测试套件，本轮未重新采集或生成客户报告。', '完整断点恢复、统一任务编排与通用准确率未验证。'],
    decisions: [
      { title: '区分牌局身份与报告行', trigger: '不同房间可存在相同 ID，玩家明细行也不等于独立牌局数量。', choice: '用房间与牌局复合键理解数据身份，将采集、规则与报告输出分开说明。', tradeoff: '当前快照不足以独立重建全部历史大表；不宣称完整幂等 ETL。', evidence: '既有 VERIFIED_RESULTS 与 ARCHITECTURE 审计。' },
      { title: '把规则变成可阅读的交付物', trigger: '嵌套 JSON 需要按玩家、位置与行动过程组织，原始明细难以直接复盘。', choice: '以独立规则函数生成摘要，再用 pandas / openpyxl 组织工作表和筛选排序。', tradeoff: '脚本仍需人工串联，All-in 等边界保留为限制；原客户工作簿不公开。', evidence: '采集 / 规则 / Excel / 后处理链路审计，交付事实来源为本人确认。' },
    ],
  },
  'solana-radar': {
    role: '市场数据与时间语义研究；核心源码、运行数据库保持私有，不量化独立贡献比例。',
    verifiedScope: ['公开概览与历史审计支持闭合数据、串行 Writer、PAPER 状态及右删失处理。', '历史记录 8 项隔离离线测试；本轮没有采集、交易或重跑。'],
    pendingScope: ['无真实收益、生产交易或公开通知服务验收。', '历史运行版本与当前源码版本分别记录，不能合并成当前运行结果。'],
    interactiveRoute: '/labs/market-replay',
    interactiveLabel: '体验独立合成事件回放',
    simulationNotice: '回放样例为本轮原创合成数据实验，不使用 V23 私有源码、行情、策略或运行库，也不代表原研究复验。',
    decisions: [
      { title: '在当时可用的数据上判断', trigger: '事后补齐的 K 线可能错误地被视为事件发生时就已知的信息。', choice: '区分事件、可用与评估时间，只使用闭合数据；缺失保持未知，未结束样本保留 RIGHT_CENSORED。', tradeoff: '研究结果不等于当时可执行的交易收益，也不能删除未结束样本美化统计。', evidence: 'V23 治理说明与脱敏时间语义审计。' },
      { title: '把持久化与停止路径收敛', trigger: '多个异步任务同时写入或不受控退出，会让运行状态难以解释。', choice: '单进程、单 SQLite、单串行 Writer 与统一 stop_event；通知 outbox 区分失败和不确定状态。', tradeoff: '这是受控研究架构，不宣称无限吞吐、公开商业服务或真实订单执行。', evidence: '发行清单、store / app 源码锚点与历史运行报告摘录。' },
    ],
  },
  'rust-tools': {
    role: '异步事件、幂等与恢复研究；公开展示脱敏工程说明，个人职责比例未独立核实。',
    verifiedScope: ['资料支持 Tokio 接入、事件身份、事务幂等、GAP 与模拟账本隔离。', '历史审计记录 346 通过、2 忽略；本轮未重跑当前提交。'],
    pendingScope: ['当前签名 / 执行代码存在不证明真实资金路径通过验收。', '实盘延迟、收益、跟单成功率与商业用户数量没有可发布证据。'],
    decisions: [
      { title: '重新看到事件，不等于重新执行', trigger: '断线重连和进程重启后，相同事件可能再次进入处理链。', choice: '按事件身份去重，使用 SQLite 事务幂等与重启恢复，显式保留 GAP 状态。', tradeoff: '研究与 DRY RUN 证据不升级为真钱端到端保证。', evidence: 'engine / gap / runtime 源码锚点与脱敏历史测试记录。' },
      { title: '签名者不必然是经济归属者', trigger: '只看 signer 可能误判行为归属，并把模拟账本与执行路径混为一体。', choice: '单独做归属分类与对账，将模拟账本和执行路径隔离。', tradeoff: '不公开原始日志、钱包身份或私有源码；实际资金路径仍需专门验收。', evidence: 'ownership 模块锚点与 README / 历史验收的边界记录。' },
    ],
  },
  'shop-pilot': {
    name: '巷集 Select',
    subtitle: '从商品选择，到有依据的订单结果。',
    summary: 'ShopPilot 的 V2 原创升级：保留公开本地演示，新增本机服务报价、库存事务、优惠与订单恢复。',
    status: 'V2 本机服务已验证 · 公开本地演示',
    role: '本仓库原创跨端交互作品，AI 协同开发；负责业务建模、uni-app 界面、API 契约、数据库约束与验证记录。',
    tags: ['uni-app', 'TypeScript', 'Fastify', 'SQLite'],
    goal: '把 SKU、优惠、订单状态和重复请求连接成可解释的购买流程。业务数据与支付均为模拟；不收集真实地址或发生实物交易。',
    flow: ['分类与 SKU', '购物车版本', '服务报价', '原请求创建订单', '模拟支付 / 取消', '订单与操作查询'],
    architecture: ['uni-app 页面与 Pinia 状态', '本地演示 / 显式 server-demo 双模式', 'Fastify 共享 DTO 与服务规则', 'SQLite 会话隔离、库存与幂等事务'],
    evidence: 'V1 记录见 TEST_REPORT.md；本轮 V2 客户端、服务测试及本机 Chrome 真实 API / 丢响应恢复已经执行，命令与范围见 docs/upgrade/CONTENT_EVIDENCE.md。公网 Pages 仍为本地演示，不含 SQLite 服务。',
    limitations: ['公开静态体验为本地演示；服务报价、库存事务与服务端恢复已在本机验证，后端尚未公网部署。', '无真实支付与物流；微信小程序仅游客 AppID 构建，未微信审核上线或真机验收。'],
    reviewedAt: '2026-10-12', historicalAcceptanceDate: '2026-10-12',
    evidenceSources: ['apps/commerce-mini/src/v2/client.ts', 'apps/commerce-mini/src/v2/store.ts', 'services/demo-api/src/shop.ts', 'services/demo-api/src/server.test.ts', 'tests/e2e/server-flows.spec.ts', 'TEST_REPORT.md（V1 历史验收）'],
    screenshotAlt: 'ShopPilot 既有 Chrome 验收截图：演示地址、优惠与模拟订单确认',
    verifiedScope: ['本轮客户端与服务测试覆盖整数分、购物车版本、库存约束、优惠和订单状态；本机 Chrome 验证真实 API 与丢响应后的原请求恢复。', 'V2 H5 与微信小程序编译通过；游客 AppID 产物不等于微信正式上线。'],
    pendingScope: ['服务仅本机 SQLite；没有公网持久化后端、生产负载或真实支付验收。', '全站最终集成回归仍由统一报告记录；小程序真机、微信审核和生产部署未完成。'],
    decisions: [
      { title: '报价和库存，由同一侧守住', trigger: '用户选择 SKU 或优惠后，购物车版本、库存和报价时效都可能改变。', choice: 'V2 服务用整数分计算报价，在创建订单事务中再次验证版本、时效、库存与优惠；报价本身不预占库存。', tradeoff: '每位访客拥有隔离的演示库存池，不模拟公共商业库存规模。服务能力已在本机验证，公开静态模式仍只作用于当前浏览器。', evidence: 'services/demo-api/src/shop.ts、服务测试与 V2 Chrome 真实 API 流程。' },
      { title: '响应丢失时，保留同一业务意图', trigger: '服务已经创建订单而客户端没有收到响应时，生成新操作键可能重复下单。', choice: '发送前保存原键与原请求体；失败显示结果未知，支持查询已完成操作并用原键重试，再读取当前订单状态。', tradeoff: '查询暂未找到不证明此前请求未执行；不会用假成功或自动切换本地模式掩盖服务故障。', evidence: 'v2/client.ts、server-client.test.ts、server-store.test.ts 和浏览器写入后丢响应恢复。' },
    ],
  },
  'pulse-campaign': {
    name: '蓉城周末 Lab',
    subtitle: '选择周末，也看见预约背后的规则。',
    summary: 'PulseCampaign 的 V2 原创升级：偏好解释、路线与场次、本机服务名额校验、预约查询和取消恢复。',
    status: 'V2 本机预约闭环已验证 · 公开本地演示',
    role: '本仓库原创移动活动作品，AI 协同开发；偏好规则、预约交互、API 状态恢复、服务名额与验收记录。',
    tags: ['Vue 3', 'TypeScript', 'Pinia', 'SQLite'],
    goal: '让活动浏览、偏好取舍、场次名额与预约结果相互一致，并在重复提交和响应不确定时仍可解释与恢复。路线、地点、名额全部为原创模拟数据。',
    flow: ['活动与偏好', '推荐理由 / 取舍', '路线与场次', '人数与规则确认', '服务名额检查', '预约查询 / 取消'],
    architecture: ['Vue 3 移动界面与 Pinia 状态', '共享确定性偏好评分与类型契约', 'HttpOnly 独立会话与 Fastify API', 'SQLite 名额事务、一次有效预约与幂等记录'],
    evidence: 'V1 记录见 TEST_REPORT.md；V2 客户端、服务测试及本机 Chrome 预约闭环、写入后丢响应恢复已执行。公开静态 H5 仍为本地演示，服务能力不冒称公网开放。',
    limitations: ['路线、品牌、场次与名额均为模拟；不采集手机号、身份证或提供正式活动服务。', '真实 API 与 SQLite 名额池仅本机运行；公网默认仍是本地演示，没有生产公共席位或跨设备身份同步。'],
    reviewedAt: '2026-10-12', historicalAcceptanceDate: '2026-10-12',
    evidenceSources: ['apps/campaign-h5/src/v2/client.ts', 'apps/campaign-h5/src/v2/store.ts', 'packages/shared/src/api.ts', 'services/demo-api/src/h5.ts', 'tests/e2e/server-flows.spec.ts', 'TEST_REPORT.md（V1 历史验收）'],
    screenshotAlt: 'PulseCampaign 既有 Chrome 验收截图：虚构活动与场次选择',
    verifiedScope: ['本轮客户端与服务测试验证推荐规则、服务名额、一次有效预约、取消和会话边界。', '本机 Chrome 已走通真实 API 预约流程和提交成功后丢响应恢复；H5 构建通过。'],
    pendingScope: ['尚未部署公网持久化 API，公开静态模式不拥有服务端名额池。', '全站最终回归另行记录；真实活动运营、短信、跨设备账号体系不在范围。'],
    decisions: [
      { title: '推荐理由可解释，名额以服务判定为准', trigger: '偏好相符不代表场次仍有名额；页面展示之后也可能超过截止时间。', choice: '共享确定性评分给出主题、环境与时长的加减分和取舍；提交时按服务时钟检查状态、人数、规则版本与名额。', tradeoff: '不是 LLM 推荐或真实活动运营；每个演示会话隔离名额池，公开静态模式没有跨访客席位保证。', evidence: 'shared/api.ts、services/demo-api/src/h5.ts 与客户端 / 服务测试。' },
      { title: '取消与丢响应都保留可核对路径', trigger: '写入已成功而响应丢失、重复点击取消，都可能让界面与服务记录不一致。', choice: '保留原请求与幂等键，区分 unknown、明确拒绝和完成；通过操作与预约查询恢复，取消事务只释放一次名额。', tradeoff: '过期会话不会自动换身份并假装找回旧记录；本机服务验收不能替代公网可用性。', evidence: 'v2/client.ts、v2/store.test.ts、服务测试及 Chrome API 丢响应恢复场景。' },
    ],
  },
};
for (const project of projects) Object.assign(project, details[project.slug]);
export const projectCategories = ['全部', ...new Set(projects.map(project => project.category))];
