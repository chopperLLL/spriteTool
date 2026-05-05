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

- `frontend.test.js` - 测试 v3 节点工作流结构
  - starter flow 与节点目录
  - 显式添加入口与右键菜单
  - 节点展开策略与删除确认
  - 类型适配边界与连线重连入口
  - AI 抠图逐帧反馈容器
  - 禁止使用 `alert()` / `confirm()`

### 前端脚本语法检查
```bash
node -e "const fs=require('node:fs');const html=fs.readFileSync('sprite-tool.html','utf8');const m=html.match(/<script>([\\s\\S]*)<\\/script>/);if(!m)throw new Error('script not found');new Function(m[1]);console.log('sprite-tool script syntax OK');"
```

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
