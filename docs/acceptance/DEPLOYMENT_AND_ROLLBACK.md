# V2 发布与回退流程

目标仅 Callmecx/chenxi-devlab-2026。旧私有仓及其他项目不变。

## 受控验收

1. 两套锁文件安装，类型/Lint/单元接口检查，三个静态应用构建、微信/App资源构建。
2. 独立本机API和生产包完整E2E，保存脱敏摘要与实际截图。
3. BASE_PATH=/chenxi-devlab-2026/ 再构建；node scripts/check-built-path.mjs 启动4186执行最终子路径浏览器检查。
4. 扫描Git发布候选；公开工件仅应用、脱敏摘要和已审核图片。原始HTML trace、会话令牌及SQLite不上传。
5. 分支PR通过相同CI后合并main；Pages工作流从验证后的dist发布。
6. node scripts/verify-deployment.mjs https://callmecx.github.io/chenxi-devlab-2026/ 使用无登录浏览器复验三入口、新路由、业务交互与证据资产。

## 回退

上一公开版本基线 b62db8d0beb9d55c59649767a7281b500a07020d 在Git历史保留。V2开发首先保存功能检查点 e3357f3。若发布回归失败，优先停止继续合并；通过针对V2发布提交的 git revert 生成新恢复提交，经CI重新发布，避免force push或删除历史。也可从基线新建回退分支复建并PR恢复，保持同仓与同Pages路径。不要操作旧私有仓。

本机API和数据库与Pages发布分开，静态版本回退不会删除本机SQLite。数据库只有初始化版本1，本轮无破坏性迁移；将来需要迁移时先停写、私有备份、验证副本恢复。公网后端尚未部署，不声称已有线上容灾或生产回滚演练。

## 外部条件

真实微信AppID/开发者工具登录、真机、Android签名/HBuilderX云打包、商店账户、HTTPS后端和模型凭据须独立配置与验收。本轮不购买、不自动开户、不伪造通过。发布与回退命令本身不是已经成功执行的证据，实际状态见根部署报告及GitHub Actions。
