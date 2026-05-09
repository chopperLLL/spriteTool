# spriteTool

视频转精灵图工具。它把 AI 生图 / AI 生视频、视频拆帧、抠图、精灵图合成和 GIF 导出放进一个浏览器端工作流里，适合做像素动画、角色帧素材和小型内容生产。

## 功能概览

- AI 生图：文生图 / 图生图
- AI 生视频：支持首帧 / 尾帧控制
- 导入视频并拆帧
- 抠图：
  - `imgly` 前端抠图
  - `RMBG-2` 本地 Python 后端抠图
- 精灵图合成
- PNG / JSON / GIF 导出
- 结果库持久化到本地 `results/`

## 快速开始

### 1. 纯前端模式

直接用浏览器打开：

- `sprite-tool.html`

适合只使用：

- 导入视频
- 选帧
- 颜色抠图
- 精灵图合成
- GIF 导出

### 2. 含 AI 的本地服务模式

启动：

```bash
node server.js
```

然后打开：

- `http://localhost:3000`

本地服务会负责：

- 启动静态页面
- 管理 `jimeng-free-api-all`
- 代理 `/api/jimeng/*`
- 提供 `/api/rmbg/probe` 给 RMBG-2 后端抠图使用
- 把结果保存到 `results/`

## RMBG-2 CUDA 后端抠图

当前项目已经接入 RMBG-2 的本地后端抠图链路，优先走 PyTorch CUDA。

### 目录约定

RMBG-2 放在：

- `model/RMBG-2/`

代码侧会使用这些文件：

- 已纳入 git：
  - `model/RMBG-2/config.json`
  - `model/RMBG-2/birefnet.py`
  - `model/RMBG-2/BiRefNet_config.py`
  - `model/RMBG-2/infer.py`
  - `model/RMBG-2/infer_pytorch.py`
- 本地模型文件，不纳入 git：
  - `model/RMBG-2/model.onnx`
  - `model/RMBG-2/model.safetensors`

临时推理目录也不纳入 git：

- `model/RMBG-2/tmp-*/`

### Python 解释器

`server.js` 里保留了 `RMBG_PYTHON` 环境变量覆盖能力。

默认会使用当前机器上的 Python 3.14：

- `C:\Users\chenlei\AppData\Local\Python\pythoncore-3.14-64\python.exe`

如果你的 Python 路径不同，启动前设置 `RMBG_PYTHON` 即可。

PowerShell 示例：

```powershell
$env:RMBG_PYTHON = "C:\path\to\python.exe"
node server.js
```

### PyTorch 路径依赖

如果走 RMBG-2 PyTorch CUDA，当前 Python 环境至少需要这些依赖：

```bash
python -m pip install torch transformers pillow numpy timm kornia
```

如果只想保留 ONNX 回退链路：

```bash
python -m pip install onnxruntime pillow numpy
```

### 使用方式

启动 `node server.js` 后，在抠图节点中：

1. 选择 `AI 抠图`
2. 方法切到 `RMBG-2（后端）`
3. 可直接导入单图，或使用上游输入
4. 点击开始 AI 抠图

前端会展示：

- 后端类型
- Python 路径
- runtime 版本
- 可用 provider
- 当前 provider

如果服务端终端出现这些字段，说明 CUDA 已经真正跑通：

- `[RMBG] backend=pytorch`
- `[RMBG] selectedProvider=cuda`
- `[RMBG] activeProviders=["cuda"]`

## 测试

当前仓库使用 Node 原生测试：

```bash
node --test "tests/frontend.test.js"
node --test "tests/server.test.js"
```

## 目录说明

- `sprite-tool.html`：单文件前端，包含 HTML / CSS / JS
- `server.js`：本地 Node 服务，零外部依赖
- `tests/frontend.test.js`：前端静态结构测试
- `tests/server.test.js`：服务端静态行为测试
- `model/RMBG-2/`：RMBG-2 模型相关代码与本地权重
- `results/`：结果库输出目录

## Git 忽略约定

当前已忽略：

- `node_modules/`
- `.venv-rmbg/`
- `results/`
- `model/RMBG-2/tmp-*/`

注意：`model.onnx` 和 `model.safetensors` 目前是本地文件，不应直接提交到仓库。

## 已知说明

- `jimeng-free-api-all/` 是项目内使用的即梦服务目录。
- 纯前端流程不依赖 Python。
- RMBG-2 CUDA 是否可用，取决于当前机器的 Python / torch / CUDA 环境是否匹配。
