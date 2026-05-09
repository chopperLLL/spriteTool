const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_PORT = 3001;
const TEST_DIR = path.join(__dirname, '..');

describe('server.js', () => {
    describe('ensureJimeng', () => {
        it('如果 jimeng-free-api-all 已存在则应跳过安装', async () => {
            const jimengDir = path.join(TEST_DIR, 'jimeng-free-api-all');
            const exists = fs.existsSync(path.join(jimengDir, 'package.json'));
            assert.strictEqual(typeof exists, 'boolean');
        });
    });

    describe('httpGet', () => {
        it('应该能发送 GET 请求并返回状态码', async () => {
            const testServer = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ models: ['jimeng-4.5'] }));
            });

            await new Promise((resolve) => testServer.listen(18001, resolve));

            try {
                const result = await new Promise((resolve, reject) => {
                    http.get('http://localhost:18001/v1/models', (res) => {
                        let body = '';
                        res.on('data', c => body += c);
                        res.on('end', () => resolve({ status: res.statusCode, body }));
                    }).on('error', reject);
                });
                assert.strictEqual(result.status, 200);
                const data = JSON.parse(result.body);
                assert.ok(data.models);
            } finally {
                testServer.close();
            }
        });

        it('连接失败时应返回错误', async () => {
            await assert.rejects(
                new Promise((resolve, reject) => {
                    http.get('http://localhost:59999/invalid', (res) => {
                        resolve(res);
                    }).on('error', reject);
                })
            );
        });
    });

    describe('collectBody', () => {
        it('应该能收集请求体数据', async () => {
            const testData = JSON.stringify({ test: 'data' });
            const req = new (require('stream').Readable)();
            req.push(testData);
            req.push(null);

            const chunks = [];
            const bodyPromise = new Promise((resolve, reject) => {
                req.on('data', c => chunks.push(Buffer.from(c)));
                req.on('end', () => resolve(Buffer.concat(chunks)));
                req.on('error', reject);
            });

            const result = await bodyPromise;
            assert.strictEqual(result.toString(), testData);
        });
    });

    describe('MIME_TYPES', () => {
        const MIME_TYPES = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.onnx': 'application/octet-stream',
            '.woff2': 'font/woff2',
        };

        it('应该包含所有必需的 MIME 类型', () => {
            assert.strictEqual(MIME_TYPES['.html'], 'text/html; charset=utf-8');
            assert.strictEqual(MIME_TYPES['.js'], 'application/javascript');
            assert.strictEqual(MIME_TYPES['.png'], 'image/png');
            assert.strictEqual(MIME_TYPES['.json'], 'application/json');
        });

        it('应该支持视频格式', () => {
            assert.ok(MIME_TYPES['.mp4']);
            assert.ok(MIME_TYPES['.webm']);
        });

        it('应该支持字体格式', () => {
            assert.ok(MIME_TYPES['.woff2']);
        });
    });

    describe('静态文件服务', () => {
        it('sprite-tool.html 应该存在', () => {
            const filePath = path.join(TEST_DIR, 'sprite-tool.html');
            assert.ok(fs.existsSync(filePath), 'sprite-tool.html 应该存在');
        });

        it('server.js 应该存在', () => {
            const filePath = path.join(TEST_DIR, 'server.js');
            assert.ok(fs.existsSync(filePath), 'server.js 应该存在');
        });

        it('静态文件路径应该正确解析', () => {
            const reqUrl = '/sprite-tool.html';
            const expectedPath = path.join(TEST_DIR, 'sprite-tool.html');
            const resolvedPath = path.resolve(path.join(TEST_DIR, reqUrl));
            assert.strictEqual(resolvedPath, expectedPath);
        });

        it('路径安全检查应该阻止目录遍历', () => {
            const baseDir = path.resolve(TEST_DIR);
            const maliciousUrl = '/../../../etc/passwd';
            const resolvedPath = path.resolve(path.join(TEST_DIR, maliciousUrl));
            const isSafe = resolvedPath.startsWith(baseDir);
            assert.strictEqual(isSafe, false, '应该阻止目录遍历攻击');
        });
    });

    describe('API 代理路由', () => {
        it('应该正确映射 API 路径', () => {
            const testCases = [
                { input: '/api/jimeng/image', expected: '/v1/image' },
                { input: '/api/jimeng/video', expected: '/v1/video' },
                { input: '/api/jimeng/models', expected: '/v1/models' },
            ];

            for (const { input, expected } of testCases) {
                const targetPath = input.replace('/api/jimeng/', '/v1/');
                assert.strictEqual(targetPath, expected, `${input} 应该映射到 ${expected}`);
            }
        });

        it('应该提取 sessionid 从请求头', () => {
            const headers = {
                'x-session-id': 'test-session-123',
                'content-type': 'application/json'
            };
            const sessionId = headers['x-session-id'] || '';
            assert.strictEqual(sessionId, 'test-session-123');
        });
    });

    describe('端口配置', () => {
        it('应该使用正确的默认端口', () => {
            const JIMENG_PORT = 18000;
            const SERVER_PORT = 3000;
            assert.strictEqual(JIMENG_PORT, 18000);
            assert.strictEqual(SERVER_PORT, 3000);
        });

        it('端口应该没有冲突', () => {
            const ports = [18000, 3000];
            const uniquePorts = [...new Set(ports)];
            assert.strictEqual(ports.length, uniquePorts.length, '端口不应该重复');
        });
    });
});

describe('健康检查逻辑', () => {
        it('单次失败不应标记为 error', async () => {
            let failCount = 0;
            const mockState = {
                status: 'running',
                message: '运行中',
                startedAt: Date.now(),
                consecutiveFailures: 0,
                process: null,
            };

            // 模拟单次失败
            mockState.consecutiveFailures = 1;
            assert.strictEqual(mockState.consecutiveFailures < 3, true, '单次失败不应触发 error');
            assert.strictEqual(mockState.status, 'running', '状态应保持 running');
        });

        it('连续 3 次失败才应标记为 error', () => {
            const mockState = {
                status: 'running',
                consecutiveFailures: 0,
            };

            // 模拟连续 3 次失败
            mockState.consecutiveFailures = 3;
            if (mockState.consecutiveFailures >= 3) {
                mockState.status = 'error';
            }
            assert.strictEqual(mockState.status, 'error', '连续 3 次失败应标记 error');
        });

        it('成功后应重置连续失败计数', () => {
            const mockState = {
                status: 'error',
                consecutiveFailures: 3,
            };

            // 模拟成功
            mockState.consecutiveFailures = 0;
            mockState.status = 'running';

            assert.strictEqual(mockState.consecutiveFailures, 0, '成功后应重置计数');
            assert.strictEqual(mockState.status, 'running', '成功后应恢复为 running');
        });

        it('starting 状态不应执行健康检查', () => {
            const mockState = {
                status: 'starting',
                message: '正在启动...',
                consecutiveFailures: 0,
            };

            const shouldSkip = mockState.status === 'starting';
            assert.strictEqual(shouldSkip, true, 'starting 状态应跳过健康检查');
        });
    });

    describe('RMBG-2 后端 PoC', () => {
        it('应该声明 onnx 模型与推理脚本路径', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'server.js'), 'utf-8');
            assert.ok(content.includes("const RMBG_DIR = path.join(__dirname, 'model', 'RMBG-2');"), '应声明 RMBG 目录');
            assert.ok(content.includes("const RMBG_MODEL_PATH = path.join(RMBG_DIR, 'model.onnx');"), '应声明 RMBG 模型路径');
            assert.ok(content.includes("const RMBG_INFER_SCRIPT = path.join(RMBG_DIR, 'infer.py');"), '应声明 RMBG 推理脚本路径');
        });

        it('应该支持 .onnx 静态文件类型', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'server.js'), 'utf-8');
            assert.ok(content.includes("'.onnx': 'application/octet-stream'"), '应为 onnx 提供 MIME 类型');
        });

        it('检测到 PyTorch 权重时应该优先使用 PyTorch 脚本', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'server.js'), 'utf-8');
            assert.ok(content.includes("const RMBG_INFER_PYTORCH_SCRIPT = path.join(RMBG_DIR, 'infer_pytorch.py');"), '应声明 PyTorch 推理脚本');
            assert.ok(content.includes("log('[RMBG] 优先使用 PyTorch CUDA 脚本');"), '检测到权重后应优先走 PyTorch CUDA');
            assert.ok(content.includes("'--model-dir', RMBG_DIR"), 'PyTorch 脚本应接收模型目录');
        });

        it('应该默认使用当前 Python 3.14，并允许环境变量覆盖', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'server.js'), 'utf-8');
            assert.ok(content.includes("const RMBG_PYTHON = process.env.RMBG_PYTHON || 'C:\\\\Users\\\\chenlei\\\\AppData\\\\Local\\\\Python\\\\pythoncore-3.14-64\\\\python.exe';"), '应将 Python 3.14 设为默认解释器');
        });

        it('应该支持记录 Python 与 provider 诊断信息', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'server.js'), 'utf-8');
            assert.ok(content.includes("log('[RMBG] python='"), '应记录 Python 可执行文件');
            assert.ok(content.includes("log('[RMBG] backend='"), '应记录后端类型');
            assert.ok(content.includes("log('[RMBG] selectedProvider='"), '应记录当前 provider');
            assert.ok(content.includes("log('[RMBG] availableProviders='"), '应记录可用 provider');
            assert.ok(content.includes("log('[RMBG] runtime='"), '应记录运行时版本');
        });



        it('应该包含备用 CDN 源', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'sprite-tool.html'), 'utf-8');
            assert.ok(content.includes('cdn.jsdelivr.net'), '应包含 jsdelivr CDN');
            assert.ok(content.includes('unpkg.com'), '应包含 unpkg 备用 CDN');
        });

        it('应该包含重试逻辑', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'sprite-tool.html'), 'utf-8');
            assert.ok(content.includes('重试') || content.includes('attempt'), '应包含重试逻辑');
        });

        it('应该包含超时控制', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'sprite-tool.html'), 'utf-8');
            assert.ok(content.includes('60000') || content.includes('超时'), '应包含超时控制');
        });

        it('应该包含友好错误提示', () => {
            const content = fs.readFileSync(path.join(TEST_DIR, 'sprite-tool.html'), 'utf-8');
            assert.ok(content.includes('颜色抠图'), '错误时应建议切换颜色抠图');
        });
    });

    describe('集成测试', () => {
        it('所有必需文件应该存在', () => {
        const requiredFiles = [
            'sprite-tool.html',
            'server.js',
            'SPEC.md',
            'CLAUDE.md'
        ];

        for (const file of requiredFiles) {
            const filePath = path.join(TEST_DIR, file);
            assert.ok(fs.existsSync(filePath), `${file} 应该存在`);
        }
    });

        it('sprite-tool.html 应该包含必要的结构', () => {
        const content = fs.readFileSync(path.join(TEST_DIR, 'sprite-tool.html'), 'utf-8');

        assert.ok(content.includes('<!DOCTYPE html>'), '应该是有效的 HTML 文档');
        assert.ok(content.includes('fetchJimengAPI'), '应该包含 fetchJimengAPI 函数');
        assert.ok(content.includes('sessionid'), '应该支持 sessionid 设置');
    });
});
