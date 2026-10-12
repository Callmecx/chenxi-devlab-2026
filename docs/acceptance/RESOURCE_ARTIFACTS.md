# V2 开发资源与校验和

2026-10-12，源码提交 `f17260b781ba25d09a20a5942b0a516373ddafec`。分别实际重新运行 `npm run build:mini` 与 `npm run build:app` 成功后打包，未包含本机数据库、会话资料、签名或真实 AppID。压缩包仅含对应构建目录。

| 文件                                   |   字节 | 状态                                                           |
| -------------------------------------- | -----: | -------------------------------------------------------------- |
| chenxi-v2-wechat-resources-f17260b.zip |  79654 | 微信开发资源，游客 AppID，未经开发者工具/真机验收              |
| chenxi-v2-app-resources-f17260b.zip    | 356597 | HBuilderX 输入资源，不是 APK/AAB/IPA，未经设备、签名、商店验收 |

实际 SHA256 见 [resource-sha256.json](resource-sha256.json)。压缩包交付在本机忽略目录 `.local/delivery/`；成功 CI 同时提供 `wechat-mini-build` 与 `app-resources-not-installable` 工件。重新编译或重新压缩可能改变字节和校验和；这两个哈希只证明此处具名压缩包的完整性，不是签名或安全认证。

当前没有实际生成的可安装 APK/IPA，因此没有可安装包的下载或安装成功声明。完整平台状态见 [PLATFORM_RELEASE_MATRIX.md](PLATFORM_RELEASE_MATRIX.md)，发布记录见 [DEPLOYMENT_REPORT.md](../../DEPLOYMENT_REPORT.md)。
