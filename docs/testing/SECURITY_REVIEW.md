# 发布前安全审查

审查日期：2026-10-12（Asia/Shanghai）。此记录描述具体检查与已知边界，不保证绝对安全。开发尚在进行时生成的扫描只覆盖当时快照；最终发布前需要对最终文件再次运行。

## 源码发布内容

`scripts/security-scan.mjs` 使用 Node 内置库，以 Git 已跟踪文件和非忽略的待加入文件作为发布候选。忽略的依赖、构建、工具、日志和浏览器临时产物不会进入候选；若已经被错误跟踪，扫描会拒绝它们。

检查包括环境文件、常见服务 Key / Token、私钥、助记词、带凭据 URL、Cookie / Authorization 字面量、旧项目私有路径、未批准的源码语言/数据文件、数据库、客户工作簿、压缩包、越界符号链接和异常目录。报告只给规则、文件与行号，不输出检测到的密钥值。

初次实际执行结果：79 个候选文件、76 个文本文件、3 张图片，未发现匹配项。6 类合成秘密样例均被拒绝，3 类安全样例被接受；扫描器自身 ESLint 通过。后续扫描以 [security-scan.json](./security-scan.json) 的时间与结果为准。

## 依赖审计

均使用 `https://registry.npmjs.org` 执行真实 npm audit，以下不是手填的推测评分：

| 范围 | 当前已保存结果 | 状态 |
|---|---|---|
| 根 workspace：完整依赖 | [audit-root-all.json](./audit-root-all.json)，0 项 | 升级测试链后重新审计通过 |
| 根 workspace：排除开发依赖 | [audit-root-production.json](./audit-root-production.json)，0 项 | 通过 |
| ShopPilot：完整依赖 | [audit-commerce-all.json](./audit-commerce-all.json)，修补后 24 项 high / 0 critical | 均由同一条 braces 未修复公告向依赖链传播 |
| ShopPilot：排除开发依赖 | [audit-commerce-production.json](./audit-commerce-production.json)，修补后 17 项 high / 0 critical | 均由同一条 braces 未修复公告向依赖链传播 |

根初始测试链曾出现 Vitest / mocker / tinypool 告警，升级后实际完整审计为 0。ShopPilot 初始完整审计为 58 项，生产依赖图为 41 项；原始记录保留在 [initial all](./audit-commerce-initial-all.json) 与 [initial production](./audit-commerce-initial-production.json)。已定向修补 Vue / SSR、Vue I18n、Vite、Vitest、ZIP、PostCSS、WebSocket、图像解码和开发服务器等依赖，并保留精确锁文件。不要运行可能切换到错误 uni-app 发行分支的 `audit fix --force`。

### 剩余 braces 公告与暴露分析

唯一剩余叶子公告为 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)：braces 3.0.3 及以前处理恶意深层嵌套 glob 模式时可能导致 Node 调用栈耗尽。2026-10-12 核对 GitHub Reviewed 公告显示没有 patched version；`npm view braces version` 也返回 3.0.3。

实际 `npm ls braces --all` 路径为：

```text
@dcloudio/uni-cli-shared
  chokidar@3.6.0 → braces@3.0.3
  fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3
```

这是编译/文件监控链。uni-app 把部分编译包从生产包间接引用，因此 `--omit=dev` 仍将其包含；17 或 24 个包告警不是 17 或 24 条独立漏洞。定向检查应用源码与 H5 JavaScript 产物未发现上述模块名称，业务没有接收 glob 模式的接口。基于依赖用途、源码与静态部署边界，判断当前公开静态页面没有可见的远程输入路径触达该 Node 工具；这是一项有证据支持的范围判断，不是“漏洞已修复”。

保留限制：只能在可信项目和可信 glob 配置上运行本地编译/监控；不对外暴露开发工具，也不新增接收不可信 glob 的服务。后续上游发布补丁或替换此依赖后，应更新锁文件并重新构建、测试及 audit。当前项目可以准确报告“根依赖审计 0；ShopPilot 仍有一条上游未修复的构建工具拒绝服务公告”，不能称“全仓库零漏洞”或“绝对无安全风险”。

## 数据与执行边界

- 新应用使用演示商品、固定虚构地址、虚构昵称与本地浏览器存储，没有真实支付、真实物流或数据接收后端。
- 表单内容通过 Vue 文本绑定显示；本轮定向搜索未见业务代码使用 `v-html`、`innerHTML`、`eval` 或任意动态执行。
- 原有 EnterpriseFlow、Workbench、PokerReplay、V23、Rust 源码与数据未被合并进本仓库。公开文案只引用核对过的事实，未启动旧采集或交易流程。
- 用户已明确授权公开邮箱 `496684212@qq.com` 与 GitHub 主页；不额外公开电话、客户标识、钱包集合或私人路径。
- 本地静态预览绑定 `127.0.0.1`。公网产物仅是静态 HTML/CSS/JS 与公开资料，不能作为可信多用户交易或预约服务。

## 素材来源

| 素材 | 来源和公开依据 |
|---|---|
| 主站品牌与布局 | 本次原创代码、排版与 CSS，无复制参考站源码、商标或页面内容 |
| ShopPilot 商品图形 | 原创 `ProductArt.vue` 与 CSS 图形，无第三方商品摄影 |
| PulseCampaign 活动图形 | 原创 `Artwork.vue` / CSS 几何图形与虚构活动目录 |
| 通用线性图标 | npm 包 `lucide-vue-next`；按其包许可证使用，不声称为本人原创图标 |
| 字体 | 系统字体栈，没有下载或重新分发商业字体 |
| 3 张既有截图 | 用户既有作品的已脱敏截图，逐张视觉检查；出处和历史性质见 [研究证据](../research/PROJECT_EVIDENCE.md) |
| 本轮运行截图 | 由本项目实际浏览器运行生成；其内容为明确的演示数据 |

发布扫描不能识别所有未知秘密、混淆文本或图片中敏感信息，不能从文件扩展名证明所有代码来源。素材人工检查、代码范围检查和依赖审计共同构成本轮审查，不替代后续维护与重新审计。
