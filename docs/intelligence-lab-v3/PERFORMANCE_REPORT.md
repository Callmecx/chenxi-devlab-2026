# 星域智航 V3 · 实际渲染性能与生命周期

2026-10-13 00:02（Asia/Shanghai）完成 6 个串行活动场景样本。此次本机标准档实际渲染 P50：桌面 16.7ms，手机视口 33.3ms；分别接近约 60Hz、30Hz 的设计目标。所有窗口结束时任务仍在运行，未触发二维降级，页面错误和长任务均为 0。手机数据来自桌面 Chrome 的视口模拟，不能据此宣称真实手机达到 30FPS，更不能将页面 RAF 的 60Hz 误写为手机三维渲染 60FPS。

原始完整数据：[performance.json](performance.json)。采样程序：[scripts/measure-orbit.mjs](../../scripts/measure-orbit.mjs)。

## 固定条件与构建身份

| 项目 | 实际条件 |
| --- | --- |
| 地址 | `http://127.0.0.1:4173/#/intelligence`，本机生产预览 |
| 源码版本 | `3e2f0c3d0445bc66a2de985ce8832118a6027770` |
| 构建元信息 | `sourceTreeDirty: false`；`builtAt: 2026-10-12T15:57:30.042Z` |
| 构建入口 SHA-256 | `CFDBD5E0246E52461622F518CE94B0D20610BCB03920F09F1006E9533DF58C8F`；采样前后相同 |
| 主机 | Windows `win32 / 10.0.26200`；13th Gen Intel Core i5-13500H；16 个逻辑核心 |
| 浏览器 | 已安装 Chrome `154.0.8037.94`，Playwright 启动的 headless 桌面浏览器 |
| 画质 | 标准 WebGL，DPR 1；未配置 CPU 或网络节流 |
| 场景 | 固定 seed 4217，7 个站点、9 条双向航道、2 艘载体，默认全景 |
| 业务 | 通过真实设置界面选 0.5×，点击“开始补给任务”，持续采集 10 秒；六组结束均为 `running / tick 6` |
| 视口 | 1440×900 三次，390×844 三次；每次新建浏览器上下文 |
| 隔离 | 等独立 QA 浏览器退出后开始，六组串行；期间没有并行构建或其他验收浏览器 |
| 临时数据 | Chrome 临时目录指向 D 盘 `.local/v3/performance/temp`；构建元信息副本保留在同级目录 |

采样在 canvas 已显示且累计渲染超过 100 帧后开始，不包含冷启动、资源下载或首屏加载时间。没有连接真实手机，也没有采集 GPU 型号或 GPU 时间戳。

## 六组原始结果

所有时间单位为 ms；为便于阅读显示到一位小数，原始浮点值仍完整保存在 JSON。

| 视口 / 次数 | 页面 RAF P50 / P95 | 实际渲染 P50 / P95 | 长任务数 | Draw calls | 几何 / 纹理 | Canvas 像素 | 末态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1440 / 1 | 16.7 / 16.8 | 16.7 / 16.8 | 0 | 109 | 66 / 3 | 892,800 | running，T6 |
| 1440 / 2 | 16.7 / 16.8 | 16.7 / 16.8 | 0 | 109 | 66 / 3 | 892,800 | running，T6 |
| 1440 / 3 | 16.7 / 16.8 | 16.7 / 16.8 | 0 | 109 | 66 / 3 | 892,800 | running，T6 |
| 390 / 1 | 16.7 / 16.8 | 33.3 / 33.5 | 0 | 107 | 65 / 1 | 183,300 | running，T6 |
| 390 / 2 | 16.7 / 16.8 | 33.3 / 33.5 | 0 | 107 | 65 / 1 | 183,300 | running，T6 |
| 390 / 3 | 16.7 / 16.8 | 33.3 / 33.5 | 0 | 107 | 65 / 1 | 183,300 | running，T6 |

三次样本中位数及范围：

| 指标 | 桌面中位数 [最小, 最大] | 手机视口中位数 [最小, 最大] |
| --- | --- | --- |
| 实际渲染 P50 | 16.7 [16.7, 16.7] | 33.3 [33.3, 33.3] |
| 实际渲染 P95 | 16.8 [16.8, 16.8] | 33.5 [33.5, 33.5] |
| 页面 RAF P95 | 16.8 [16.8, 16.8] | 16.8 [16.8, 16.8] |
| 长任务数 | 0 [0, 0] | 0 [0, 0] |

桌面 canvas 为 1440×620，手机 canvas 为 390×470。页面 RAF 观察的是浏览器动画回调；渲染器在手机标准档主动限制约 30Hz，因此两种间隔不同。`renderer` 数据是组件最近最多 240 个实际绘制间隔的滚动统计，每 3 秒上报一次；`timing` 是独立的完整 10 秒 RAF 窗口。两者均不是 GPU 执行耗时。JSON 的 `renderer.frames` 是本次挂载累计数，不能直接当成 10 秒内帧数。

六组都没有 `pageerror`，canvas 数量均为 1，`fallback` 全为 false。长任务观察器只覆盖本次窗口；“0 长任务”不代表冷启动、任意操作或所有设备都不会阻塞。

## 生命周期：实现与真实证据

源码审查：

- [OrbitScene.vue](../../apps/portfolio/src/components/orbit/OrbitScene.vue) 限制标准 DPR≤1.5 / 160 万像素，精细 DPR≤2 / 210 万像素；此次 DPR 1 没有触及上限。隐藏标签取消 RAF 并清空旧帧样本；上下文丢失停止绘制并通知页面切换二维。卸载取消 RAF、断开 ResizeObserver、移除集中登记的 DOM 监听，释放场景资源、renderer render lists 和 renderer，调用 `forceContextLoss()` 后移除 canvas。
- [assets.ts](../../apps/portfolio/src/components/orbit/assets.ts) 用集合保留几何、材质和纹理引用，统一 dispose；合并几何后的临时副本立即 dispose。
- [OrbitLab.vue](../../apps/portfolio/src/pages/OrbitLab.vue) 在隐藏页面时暂停本地步进；卸载清除 interval、终止分支 Worker、移除 visibility / 动效偏好监听并关闭音频上下文。持续三个较慢统计窗口后逐级降档或切换二维，保留业务状态。

独立浏览器证据来自 [orbit.spec.ts](../../tests/e2e/orbit.spec.ts)：

| 检查 | 已取得的证据与边界 |
| --- | --- |
| 十次进入退出 | `.local/v3/e2e/round-3-production-26.json` 中对应检查通过；同一 document 内 hash 切换，10 次旧 canvas 均 `isConnected:false` 且 `gl.isContextLost():true`，每次重新进入只出现一个 canvas 和新 runId |
| WebGL 上下文丢失 | 同轮独立检查通过；真实 `WEBGL_lose_context` 后切换二维，暂停世界事实保持，仍能继续完成任务 |
| 同镜头恢复 | 首次整轮受截图内提示浮层影响失败；实际关闭提示后保留原阈值复测，全景与跟随的真实 canvas 像素比较通过，见 `.local/v3/e2e/camera-restoration-pass.json` |
| 实际拾取与录屏草稿 | 旧草稿 `.local/v3/final-video/manifest.json` 中的 65.013 秒是录制脚本经过时间，不是视频编码时长。该草稿记录通过可见甲板坐标触发 Raycaster 选中港口及绕行演示，未覆盖实际失败与恢复，不能作为最终影片验收；最新录屏、编码时长、构建身份和覆盖范围统一以 [VIDEO.md](VIDEO.md) 为准。也不能据此宣称三类对象的全部拾取路径都已覆盖 |

上述旧整轮为 25 通过、1 个镜头截图采样问题；镜头修正后定向通过。本报告不把这两次拼接写成一次 26/26 整轮通过，最终整轮结果由整体验收报告补充。十次上下文释放证明了所测卸载路径，不是 JS 堆、驱动或全部 GPU 内存完全无泄漏的证明；本轮未做堆快照、长时压力或真实手机发热测试。

## 复现

保持该源码版本的生产预览运行在 4173，停止其他验收浏览器与构建，再从仓库根目录执行：

```powershell
$perfTemp = Join-Path (Get-Location) '.local/v3/performance/temp'
New-Item -ItemType Directory -Path $perfTemp -Force | Out-Null
$env:TEMP = $perfTemp
$env:TMP = $perfTemp
node scripts/measure-orbit.mjs http://127.0.0.1:4173/
```

脚本自动执行两视口各三次，输出原始 JSON；若页面出现错误、没有推进或结束时已不在运行状态，会失败而不报告该批成功。再次测量前应另存已有 JSON，不应为了较高分数删除失败或较慢样本。

本次脚本 SHA-256：`455A6CAA790FDB07369CD2C246AB53E62FFA2900FBF5E5C9C0C8735A092B64F1`。原始结果 SHA-256：`8AC1E6607B9C4DEC53CAC6A5F55C89C46808D9831DA1BDD0AE8037C717D8DD7C`。

本报告验证本机生产预览中的动态绘制，不代表公开部署验收、真实访客数据、所有浏览器或手机真机性能，也不替代视觉与业务正确性验收。
