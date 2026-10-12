# 既有项目证据与公开边界

核对日期：2026-10-12（Asia/Shanghai）。本文件是作品集内容的事实依据，不是旧项目的重新验收报告。结构化内容见 [project-evidence.json](./project-evidence.json)。

本轮只读查看既有研究报告、指定项目的 README、依赖清单、验收文档与选定截图。没有修改旧工程、启动旧应用、调用采集/交易入口、读取真实配置或复制私有源码、客户数据。表中的相对路径以对应原项目仓库为根，避免在公开仓库暴露用户私有目录。

| 项目 | 可公开叙述 | 本次核对的核心材料 | 本次重跑 |
|---|---|---|---|
| EnterpriseFlow | 企业业务模拟；销售到库存采购与结算闭环 | `README.md`、`frontend/package.json`、既有证据索引和经营看板截图 | 否 |
| AI Agent Workbench | 本地单用户 AI 交互与 Node BFF；真实 SSE / Mock 回答 | `README.md`、`package.json`、`docs/ACCEPTANCE_REPORT.md`、Chat 截图 | 否 |
| PokerReplay | 回放网页 → 结构化数据 → 规则摘要 → Excel 定制工具 | `docs/resume_audit/ARCHITECTURE.md` 与既有脱敏审计 | 否 |
| Solana Radar V23 | Python 异步采集、时间语义、PAPER / SHADOW 工程研究 | `AGENTS.md`、`pyproject.toml`、公开概览 README、历史报告截图 | 否 |
| Rust 链上事件工具 | Tokio 异步事件、事务幂等、重启恢复与模拟账本研究 | `Cargo.toml`、既有脱敏研究审计 | 否 |

## 公开链接核实

2026-10-12 使用 GitHub 官方公开 API 查询 `Callmecx` 的公开仓库，并读取有关 README。核实到以下入口：

- [EnterpriseFlow 公开源码](https://github.com/Callmecx/enterprise-flow)：主分支 `main`。
- [AI Agent Workbench 公开源码](https://github.com/Callmecx/ai-agent-workbench)：主分支 `master`。
- [Solana Radar 公开项目概览](https://github.com/Callmecx/solana-early-token-risk-radar)：主分支 `main`。README 明确核心源码私有，因此按钮不能标成“完整源码”。
- [GitHub 个人主页](https://github.com/Callmecx)：可用的公开联系入口。后续用户明确授权公开邮箱 `496684212@qq.com`；电话和其他即时通信账号未提供，不作推测。

未确认 PokerReplay 和 Rust 工具的可公开源码入口，也未核实上述五项的公网应用地址；`demoUrl` 保持 `null`。网址为空时前端应显示说明，而不是生成失效或猜测的链接。

## 测试记录的口径

| 项目 | 可引用的历史结果 | 必须紧邻显示的边界 |
|---|---|---|
| EnterpriseFlow | 既有 README 记录 V1 最终业务回归 19/19、七角色浏览器链与重启持久化核对 | 本次未重跑；有限库存并发场景是正确性验证，不是生产性能基准 |
| AI Agent Workbench | 2026-09-20 验收报告记录 34/34 单元/集成、10/10 smoke、类型/Lint/构建通过 | 本次未重跑；无真实付费模型联调、向量检索或自主 Agent 闭环 |
| PokerReplay | 既有源码与产物审计，未发现标准断言测试套件 | 不将名为 test 的联网脚本计为单元测试；交付验收为本人确认，缺独立验收材料 |
| Solana Radar V23 | 既有脱敏审计记录 8 项隔离离线测试通过 | 历史结果；本次不重新采集或执行交易；公开图为历史摘录 |
| Rust 链上事件工具 | 既有脱敏审计记录 346 通过、2 忽略 | 历史结果；当前提交未重跑，DRY RUN 不是实盘交易验收 |

不使用这些历史数量为新建 DevLab 的测试数量背书。新应用验收需由本仓库的测试报告单独记录。

## 案例内容要点

**EnterpriseFlow。** 难点是审批、采购、到货、取消和财务之间的一致性。用后端事务、幂等、库存预留与采购覆盖规则解释实现。所有业务数据为模拟，不表述为真实企业客户或个人收入。

**AI Agent Workbench。** 难点是 SSE 拆帧、终止检测、取消与过期响应。实际 TXT/MD 分块、词法检索、安全算术和本地请求记录与模拟回答、PDF、Embedding 明确区分。真实传输不代表调用了真实模型。

**PokerReplay。** 难点是将网页接口与嵌套 JSON 转为按玩家阅读的报告。脚本之间仍需人工串联，当前审计不支持高并发、完整断点恢复、100% 准确或量化节省时间的说法。原客户工作簿、名字、房间标识均不公开。

**Solana Radar V23。** 难点是事件时间、数据可用时间和评估时间的区分。显示闭合数据、缺失状态、串行 Writer、受控停止与右删失处理；不把未来数据倒灌历史，不将价格路径指标解释为真实可执行收益。仅提供已公开概览。

**Rust 链上事件工具。** 难点是重复、断流、恢复与 signer / 经济归属的差异。说明异步接入、去重、事务幂等、GAP 和模拟账本隔离；存在签名/执行模块不证明真实资金路径已验收。

## 已核对图片

本轮逐张视觉查看以下三张既有截图副本：未见真实密钥、Cookie、电话、客户身份或钱包地址。复制仅发生在这些选定图像上，不复制旧项目目录。

| 本仓库文件 | 内容与性质 | 使用说明 |
|---|---|---|
| [enterpriseflow-dashboard.png](./assets/enterpriseflow-dashboard.png) | 已有真实本地经营看板截图，明确“演示环境” | 模拟金额不可当个人收入；截图拍摄日期未单独核实 |
| [workbench-chat.png](./assets/workbench-chat.png) | 已有真实 Chat 页面截图，明确 Demo Mode / Mock | 不暗示接通真实外部模型 |
| [solana-v23-run-excerpt.png](./assets/solana-v23-run-excerpt.png) | 已脱敏历史运行报告摘录，非实时界面 | 保留 PAPER ONLY、真实订单 0 和历史摘录说明 |

PokerReplay 原客户截图未导入；Rust 原日志未导入。对应页面可以使用原创流程/架构图，但必须说明图是实现结构解释，不是假造的运行截图。

## 本次文件快照指纹

指纹用于定位读到的文件版本，不代表这些旧项目已经通过本轮测试。

| 原项目内文件 | SHA-256 |
|---|---|
| `enterprise-flow/README.md` | `747A8D676F59F3689460BFA89AB7F0ADFD7B33D472CA81062471E6E706F3D9B3` |
| `ai-agent-workbench/docs/ACCEPTANCE_REPORT.md` | `E87E43A0BAA939D8FE9DEA3EE90FF5C896789ABFAB6189411FBE10E6BDB842CA` |
| `ai-agent-workbench/package.json` | `D4E8676901D966B7F26FDAAD2C5B9ACB2DE677128531B3E32714134CC5C98596` |
| `Solana_Smart_Money_Radar/pyproject.toml` | `A64D33D3E048581B4B81214CBDCAC687987CBBA9A054CAA34B986EDA4C2E7EE1` |
| `DECU_COPYBOT/Cargo.toml` | `1C37C50D0EC581AFF993EBAA11ACC2DD8403EEFF306DCBE82DCB153FC3E112F4` |
| `PokerReplay/docs/resume_audit/ARCHITECTURE.md` | `35D28ADB61EB9F1AD23CF0322F83AEF3DF6A4C48D89AFC0D3771D4C2658EB9C9` |

没有公开第三方客户数据、旧项目私有源码、原始数据库、策略阈值、运行配置或凭据。公开源码链接不等于允许复制整套源码，也不等于项目已授予某项开源许可证。
