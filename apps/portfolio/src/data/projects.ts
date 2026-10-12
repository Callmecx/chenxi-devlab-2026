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
projects[0].screenshotCaption = '本次真实 Chrome 截图：ShopPilot 演示地址、优惠与订单金额确认。';
projects[0].limitations = ['本地 Mock 商城，无真实支付、物流或跨设备库存服务。', '微信小程序已编译为游客 AppID 产物，未做微信审核上线或真机验收。'];
projects[1].screenshot = 'screenshots/pulse-390.png';
projects[1].github = 'https://github.com/Callmecx/chenxi-devlab-2026/tree/main/apps/campaign-h5';
projects[1].sourceLabel = '查看本项目源码';
projects[1].screenshotCaption = '本次真实 Chrome 截图：PulseCampaign 移动端活动选择首页。';
projects[1].limitations = ['活动品牌、地点和名额均为虚构演示；记录只保存于当前浏览器。', '不采集真实手机号或身份证，不提供正式活动报名服务。'];
for (const project of projects) {
  const evidence = research.projects.find(
    (p) => p.id === (evidenceIds[project.slug] ?? project.slug),
  );
  if (!evidence) continue;
  Object.assign(project, {
    name: evidence.title,
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
  });
}
