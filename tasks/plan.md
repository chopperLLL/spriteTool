# Plan: v3.0 节点内嵌 UI + 自由连线 + 节点增删

## 根因分析

当前架构的核心问题：节点编辑依赖侧边抽屉弹窗（DP），每次打开都重建 HTML。v3.0 要把编辑 UI 直接嵌入画布节点中，并支持节点增删和更好的连线操作。

## 文件范围

只改 `sprite-tool.html`（~882行）。`server.js` 和 `tests/` 不动。

## 依赖图

```
Slice A (基础设施) ─── 无依赖，先做
  │
  ├─ Slice B (迁移9节点) ─── 依赖 A 的内嵌渲染机制
  │
  ├─ Slice C (节点增删) ─── 依赖 A 的 NM 重构
  │    │
  │    └─ Slice D (连线改进) ─── 依赖 C 的 NodeFactory
  │
  ├─ Slice E (AI抠图逐帧) ─── 依赖 B 的 removeBg 内嵌
  │
  └─ Slice F (测试验证) ─── 依赖全部
```

Slice A 和 Slice B 是关键路径。Slice C/D/E 可在 B 之后并行。

---

## Slice A: 基础设施 -- 删除弹窗 + 节点内嵌展开

**路径**: 单击节点 -> 原位展开内嵌 UI -> 再次单击或点其他节点折叠

### T1: 删除 DP 弹窗 + CSS 重构

**文件**: sprite-tool.html

**改动**:
1. 删除 HTML: `detail-overlay` div（第169行）
2. 删除 CSS: `.detail-overlay`, `.detail-panel`, `@keyframes slideR`（第52-55行）
3. 删除 JS: `DP` 对象（363-371行）、`buildDetailHTML`（375-389行）、`bindDetailEvents`（451-464行）、所有 `xxxHTML()` 函数（391-448行）、`openDetail`（372行）
4. 删除双击事件监听（258行 `el.addEventListener('dblclick',...)`）
5. 添加 CSS: `.wf-node.expanded` 宽度过渡（200px -> 460px）
6. 添加 CSS: `.wf-node-body-content` 可滚动区域样式（max-height: 500px, overflow-y: auto）

**验收**:
- 页面加载无报错
- 不存在 `detail-overlay` DOM 元素
- 双击节点无反应
- 节点折叠/展开 CSS 过渡效果正常

### T2: NM 支持 expand/collapse 单击切换

**文件**: sprite-tool.html NM 对象

**改动**:
1. NM.nodes 数据结构增加 `expanded: false` 字段
2. 单击节点标题栏（非折叠按钮、非端口）时：
   - 如果当前节点已展开 -> 折叠
   - 如果当前节点未展开 -> 折叠其他所有节点，展开当前节点
3. 展开时：给 `.wf-node` 添加 `expanded` class，节点宽度过渡到 460px
4. 折叠时：移除 `expanded` class，恢复 200px
5. 展开/折叠后调用 `CM.update()` 刷新连线位置
6. 将当前的双击打开逻辑（258行）改为单击逻辑

**验收**:
- 单击节点展开，节点变宽并显示内容区
- 单击另一个节点，前一个折叠，新的展开
- 展开时连线位置正确跟随端口移动
- 折叠按钮仍可用

### T3: 通用内嵌渲染机制

**文件**: sprite-tool.html

**改动**:
1. 创建 `NODE_RENDERERS` 映射表：`{ typeId: { render($, nodeEl), bind($, nodeEl) } }`
2. 展开节点时：
   - 清空 `.wf-node-body` 内容
   - 调用对应 `render()` 生成内嵌 UI HTML
   - 调用对应 `bind()` 绑定事件
   - 恢复已有缓存数据
3. 折叠节点时：
   - 保存当前状态（如有需要）
   - 恢复为摘要视图
4. `render()` 和 `bind()` 的 `$` 函数作用域为当前节点元素（`nodeEl.querySelector`）
5. 端口区域（`.wf-ports`）始终显示，不随展开/折叠改变

**验收**:
- 节点展开时内部显示该类型的 UI
- `$` 选择器正确作用域到当前节点
- 端口在展开/折叠状态下都可见且可连线

---

## Slice B: 迁移全部 9 个节点类型到内嵌渲染

**路径**: 每个节点类型从 xxxHTML() + bindXxx($,p) 迁移到 inline render + bind

### T4: aiImage 内嵌迁移

**改动**: 将 `aiImageHTML()` + `bindAiImage()` 迁移为内嵌渲染
- render 返回提示词 textarea、模型选择、生成按钮、结果网格
- bind 绑定所有事件，作用域为节点元素
- 保留数据缓存恢复逻辑（`S.generatedImages`）

**验收**: 展开 aiImage 节点，输入描述，点击生成，结果直接显示在节点内

### T5: aiVideo 内嵌迁移

**改动**: 将 `aiVideoHTML()` + `bindAiVideo()` 迁移为内嵌渲染
- 首帧预览、提示词、生成按钮、视频结果
- 保留代理 URL 和 pendingVideo 逻辑

**验收**: 展开 aiVideo，看到首帧，生成视频，视频预览在节点内显示

### T6: importVideo 内嵌迁移

**改动**: 将 `importVideoHTML()` + `bindImportVideo()` 迁移为内嵌渲染
- 上传区域、URL 输入、视频预览、拆帧按钮
- 注意 video 元素 ID 需改为实例化 ID（`video-${instanceId}`）

**验收**: 展开 importVideo，上传视频，预览在节点内显示

### T7: selectFrames 内嵌迁移

**改动**: 将 `selectFramesHTML()` + `bindSelectFrames()` 迁移为内嵌渲染
- 帧网格、全选/反选按钮
- 帧网格在节点内的宽度适配

**验收**: 拆帧后帧网格在节点内正确显示

### T8: directSprite 内嵌迁移

**改动**: 迁移精灵图选项、预览 canvas、下载按钮

**验收**: 选择帧后直接合成，预览在节点内显示

### T9: img2img 内嵌迁移

**改动**: 迁移输入预览、提示词、生成按钮、结果网格

**验收**: 图生图完整流程在节点内操作

### T10: removeBg 内嵌迁移

**改动**: 迁移 AI/颜色抠图切换、颜色选择器、批量处理
- 先保留现有进度条，逐帧反馈在 Slice E 改进
- 颜色抠图的 canvas picker 需要在节点内工作

**验收**: AI 抠图和颜色抠图都在节点内完整操作

### T11: composeSprite 内嵌迁移

**改动**: 迁移精灵图选项、像素画选项、预览、下载

**验收**: 抠图后合成精灵图，预览在节点内显示

### T12: export 内嵌迁移

**改动**: 迁移预览、PNG/JSON/GIF 下载按钮

**验收**: 精灵图数据传入后可导出各格式

**Checkpoint 1**（T4-T12 完成后）: 所有 9 个节点都能单击展开内嵌 UI，完整工作流可执行，无弹窗出现。

---

## Slice C: 节点添加与删除

**路径**: 右键画布添加节点 -> 删除按钮删除节点 -> 连线清理

### T13: NODE_TYPES 模板 + NodeFactory

**改动**:
1. `NODES` 数组改为 `NODE_TYPES`（类型模板），不变
2. 创建 `NodeFactory`:
   - `create(typeId, x, y)`: 创建节点实例，生成唯一 ID（`${typeId}_${counter++}`）
   - 复制类型定义（ins/outs/icon/title），创建 DOM 元素
   - 注册到 `NM.nodes[instanceId]`
   - 返回实例 ID
3. 初始化时用 NodeFactory 创建默认 9 个节点
4. PM 保存/恢复时使用实例 ID

**验收**: 页面加载后 9 个默认节点正常显示，持久化恢复正常

### T14: 右键菜单添加节点

**改动**:
1. 添加 CSS: 右键菜单样式（`.context-menu`）
2. 添加 HTML: 菜单容器（或动态创建）
3. `ContextMenu` 模块:
   - 画布空白处右键 -> 显示节点类型列表
   - 点击类型 -> 在右键位置创建新节点（调用 `NodeFactory.create`）
   - 点击空白处关闭菜单
4. 默认连线（DEFAULT_CONNS）只在首次初始化时创建

**验收**: 右键画布出现菜单，选择类型后新节点出现在右键位置

### T15: 节点删除

**改动**:
1. 展开的节点底部显示「删除节点」按钮
2. 删除时:
   - 移除该节点相关的所有连线（CM.conns 过滤 + SVG 元素移除）
   - 从 NM.nodes 删除
   - 从 DOM 移除节点元素
3. Toast 提示「已删除 xxx 节点」

**验收**: 删除节点后连线消失，画布正常，持久化后刷新不显示已删除节点

**Checkpoint 2**（T13-T15 完成后）: 可添加新节点、删除任意节点、连线正确清理。

---

## Slice D: 连线操作改进

**路径**: 右键断开 + 拖拽重连 + 类型自动转换

### T16: 右键断开连线

**改动**:
1. 输入端口右键 -> 弹出菜单列出该端口的连线 -> 点击断开
2. 连线右键 -> 弹出「断开连线」选项
3. 断开时移除 SVG path + CM.conns 中的记录

**验收**: 右键端口或连线可断开

### T17: 数据类型自动转换

**改动**:
1. `CM.pushData` 增加类型转换层:
   - `frames -> image`: 提取帧 dataUrl 为 `{ urls: frames.map(f => f.dataUrl) }`
   - `sprite -> image`: 提取 `{ urls: [sprite.dataUrl] }`
   - `image -> frames`: 将 urls 转为 Frame 对象数组（需异步加载图片，先传 urls，下游按需转换）
2. 转换逻辑集中在一个 `convertData(data, fromType, toType)` 函数中

**验收**: frames 节点连到 image 输入端口时，数据自动从帧格式转为图片 URL 格式

**Checkpoint 3**（T16-T17 完成后）: 连线可自由断开重连，跨类型数据传递自动转换。

---

## Slice E: AI 抠图逐帧反馈

**路径**: AI 抠图每处理一帧立即显示缩略图

### T18: removeBg 逐帧缩略图

**改动**:
1. 在 removeBg 展开的 UI 中添加一个缩略图网格区域
2. AI 抠图循环中，每处理完一帧:
   - 创建缩略图 `<img>` 元素，src 为处理后的 blobUrl
   - 追加到网格区域
   - 更新进度计数
3. 保留进度条，但移到缩略图网格上方

**验收**: AI 抠图处理 10 帧时，能看到 1-10 帧依次出现缩略图

---

## Slice F: 测试验证

### T19: JS 语法检查 + server 测试

**改动**:
- `node --check` 验证语法
- `node --test tests/server.test.js` 确认无回归
- 手动验证完整工作流

**Checkpoint 4**（T19 完成后）: 全部功能可用，无回归。

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 内嵌 UI 导致节点过大，画布拥挤 | 展开宽度控制在 460px，同时只展开一个节点 |
| 颜色选择器 canvas 在节点内空间不足 | 抠图节点展开时给 canvas 设置合理最大尺寸 |
| 多实例节点共享全局 S 状态冲突 | 每个节点实例的缓存数据存在 NM.nodes[id].instanceData |
| 节点增删导致持久化格式变化 | PM.load 做兼容处理，旧格式也能恢复 |
