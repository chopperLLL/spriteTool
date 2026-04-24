# 测试说明

## 运行测试

### 方法 1: 运行所有测试
```bash
node tests/run-tests.js
```

### 方法 2: 单独运行测试文件
```bash
# 后端测试
node --test tests/server.test.js

# 前端测试
node --test tests/frontend.test.js
```

### 方法 3: 使用 npm (如果添加 package.json)
```bash
npm test
```

## 测试文件说明

- `server.test.js` - 测试 server.js 的核心功能
  - MIME 类型配置
  - 静态文件服务
  - API 代理路由
  - 端口配置
  - 路径安全检查

- `frontend.test.js` - 测试 sprite-tool.html 的结构和功能
  - HTML 结构完整性
  - 6 步骤导航
  - AI 生图/生视频功能
  - Session 管理
  - API 调用
  - AI 抠图
  - CSS 样式

## 添加新测试

使用 Node.js 内置测试模块:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('功能描述', () => {
    it('应该做某事', () => {
        assert.strictEqual(actual, expected);
    });
});
```
