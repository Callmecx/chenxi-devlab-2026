# GitHub 环境核查

核查日期：2026-10-12（Asia/Shanghai）。

- GitHub CLI 未在 PATH 和检查到的常用安装位置发现，因此下载官方 `cli/cli` 发行版 `v2.102.0` 的 Windows amd64 便携包，保存在本仓库忽略目录 `.tools/gh/`。
- 本机命令入口：`.tools/gh/bin/gh.exe`；执行 `--version` 返回 `gh version 2.102.0 (2026-09-30)`。
- 下载来源：[官方发行页](https://github.com/cli/cli/releases/tag/v2.102.0)。
- 包的 SHA-256：`ae64e556ecc240b200f7eba60d550e4bb60d78e860e69dd88c449405b86067f4`，与 GitHub release asset 的官方 `digest` 一致。
- 执行 `auth status` 返回未登录任何 GitHub host。没有创建仓库、提交远程、上传文件或部署 Pages。
- `.tools/` 已由 `.gitignore` 排除；便携 CLI 与压缩包不进入公开源码。

需要发布时，由用户在本机执行：

```powershell
./.tools/gh/bin/gh.exe auth login --hostname github.com --web --git-protocol https
./.tools/gh/bin/gh.exe auth status
```

不通过聊天收集 Token。用户完成授权后，发布流程仍须先完成新仓库的内容/密钥检查、构建与测试；上线地址必须由真实部署结果确认。

公开仓库 API 查询不需要登录，已确认的项目入口见 [PROJECT_EVIDENCE.md](./PROJECT_EVIDENCE.md)。

## 发布阶段复核
2026-10-12：通过官方设备授权完成 CLI 登录，账户 Callmecx，凭据存于系统 keyring。新建公开仓库 chenxi-devlab-2026；GitHub Pages 已配置 workflow 构建。正式上线结果以 Actions 和最终在线检查记录为准。

