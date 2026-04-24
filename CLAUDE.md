# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

视频转精灵图工具 (Video to Sprite Sheet Tool) - 浏览器端工具，支持 AI 生成图片/视频、视频拆帧、抠图、精灵图合成和 GIF 导出的完整工作流。

## Running

```bash
# Phase 1（纯前端）: 直接浏览器打开 sprite-tool.html
# Phase 2（含 AI）: node server.js  -> 自动安装即梦服务 -> 打开浏览器 http://localhost:3000
```

## Architecture

- `sprite-tool.html` (~3300 行): 全部前端代码（CSS + HTML + JS）
- `server.js`: Node.js 后端，零外部依赖。自动管理 jimeng-free-api-all 子进程 + API 代理 + 静态服务

### Workflow (6 steps)

1. **AI 生图** (可选) - 文生图/图生图，调用即梦 API via `/api/jimeng/images/generations`
2. **AI 生视频** (可选) - 首帧/尾帧控制，异步生成 + 轮询 via `/api/jimeng/videos/generations/async`
3. **导入视频** - 上传/URL/接收 AI 生成的视频
4. **选择帧** - Canvas 逐帧提取，网格预览，Shift 范围选
5. **抠图** - AI 抠图 (`@imgly/background-removal` CDN) 或颜色抠图 (Euclidean color distance)
6. **导出** - 精灵图合成 + PNG/JSON/GIF 导出

每个 AI 步骤可跳过，直接进入下一步。Phase 1 流程完全不受影响。

### Key Data Flow

- `state` 全局对象: `frames[]`, `processedFrames[]`, `generatedImages[]`, `selectedImage`, `generatedVideo`, `sessionid`
- AI API 调用通过 `fetchJimengAPI(path, options)` 统一处理，自动带 `X-Session-Id` header
- sessionid 存 localStorage (`jimeng_sessionid`)

### Core Algorithms (Phase 1, unchanged)

- **Background removal**: per-pixel Euclidean color distance with tolerance/feathering
- **Pixel art**: downscale -> quantization -> outline detection -> nearest-neighbor upscale
- **GIF encoding**: GIF89a + Median Cut quantization + LZW compression

### server.js

- 纯 Node.js 内置模块 (http/child_process/fs/path)，零外部依赖
- 自动 clone/install/build `jimeng-free-api-all/` 到项目子目录
- 子进程启动 jimeng-free-api-all (端口 18000)，Express 替代用 http.createServer (端口 3000)
- API 代理: `/api/jimeng/*` -> `localhost:18000/v1/*`，自动注入 Authorization Bearer token

## Code Style

- 前端: 单文件 HTML，CSS 变量深色主题，原生 ES6+，无框架
- 后端: Node.js 纯内置模块，无 npm 依赖
- 所有提示用 toast，不用 `alert()`
