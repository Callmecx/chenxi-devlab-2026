# V4 视觉与交互依赖声明

核对日期：2026-10-13。来源为本仓库锁定安装包的 `package.json` 与 `LICENSE`，不是推测的最新版本。V4 主体没有导入第三方舰船、空间站、天体模型、外部位图、生成背景、音乐或商业字体。原创源码资产清单见 [ASSET_MANIFEST.md](ASSET_MANIFEST.md)。

| 依赖            | 核对版本 | 用途                                               | 许可                                |
| --------------- | -------- | -------------------------------------------------- | ----------------------------------- |
| Three.js        | 0.186.1  | WebGL 渲染、基础几何、BufferGeometryUtils 合并工具 | MIT                                 |
| Vue             | 3.5.43   | 响应式界面及组件生命周期                           | MIT                                 |
| Vue Router      | 4.6.4    | 主站/旗舰路由                                      | MIT                                 |
| Pinia           | 3.0.4    | 已有应用状态依赖；不作为3D主体资产                 | MIT                                 |
| Zod             | 4.6.6    | 运行时数据校验                                     | MIT                                 |
| Lucide Vue Next | 0.577.0  | 页面功能图标；不作为舰船模型                       | ISC；含 Feather 来源部分的 MIT 声明 |

系统字体仅由浏览器调用，不打包或再分发字库。程序生成音效没有采样文件来源。Playwright、Vite、TypeScript 等属于工具链，本表不是仓库全部传递依赖的软件物料清单；完整安装版本以锁文件为准。

## MIT notices

The following copyright notices apply to their respective packages:

- Three.js: Copyright © 2010–2026 three.js authors.
- Vue: Copyright (c) 2018-present, Yuxi (Evan) You.
- Vue Router and Pinia: Copyright (c) 2019-present Eduardo San Martin Morote.
- Zod: Copyright (c) 2025 Colin McDonnell.
- Feather-derived portions of Lucide: Copyright (c) 2013–2026 Cole Bemis.

The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Lucide ISC notice

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013–2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

本文保留依赖的许可声明，不为仓库新增统一授权，也不将第三方基础库著作权归为项目原创。
