const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'sprite-tool.html');
const htmlContent = fs.readFileSync(HTML_PATH, 'utf-8');

describe('前端结构测试', () => {
    describe('HTML 结构', () => {
        it('应该包含正确的 DOCTYPE', () => {
            assert.ok(htmlContent.includes('<!DOCTYPE html>'), '应该声明 HTML5 DOCTYPE');
        });

        it('应该包含中文语言设置', () => {
            assert.ok(htmlContent.includes('lang="zh-CN"') || htmlContent.includes('lang="zh"'), '应该设置中文语言');
        });

        it('应该包含 viewport meta 标签', () => {
            assert.ok(htmlContent.includes('viewport'), '应该包含 viewport meta 标签');
        });

        it('应该包含必要的 section 元素', () => {
            const requiredSections = [
                'aiImageSection',
                'aiVideoSection',
                'uploadSection',
                'framesSection',
                'removeBgSection',
                'spriteSection'
            ];

            for (const section of requiredSections) {
                assert.ok(htmlContent.includes(section), `应该包含 ${section}`);
            }
        });
    });

    describe('步骤栏导航', () => {
        it('应该包含 6 个步骤', () => {
            const stepMatches = htmlContent.match(/step[\d\-]+|step-btn|step-item/g);
            assert.ok(stepMatches && stepMatches.length >= 6, '应该包含至少 6 个步骤元素');
        });

        it('应该包含步骤导航按钮', () => {
            assert.ok(htmlContent.includes('返回上一步') || htmlContent.includes('prev'), '应该包含上一步按钮');
            assert.ok(htmlContent.includes('下一步') || htmlContent.includes('next'), '应该包含下一步按钮');
        });
    });

    describe('AI 生图功能', () => {
        it('应该包含生图区域', () => {
            assert.ok(htmlContent.includes('aiImageSection'), '应该包含 AI 生图区域');
        });

        it('应该包含 prompt 输入', () => {
            assert.ok(htmlContent.includes('prompt') || htmlContent.includes('imagePrompt'), '应该包含 prompt 输入');
        });

        it('应该包含模型选择', () => {
            const hasModelSelect = htmlContent.includes('model') && htmlContent.includes('select');
            assert.ok(hasModelSelect, '应该包含模型选择');
        });

        it('应该包含生成按钮', () => {
            assert.ok(htmlContent.includes('generateImage') || htmlContent.includes('生成'), '应该包含生成按钮');
        });
    });

    describe('AI 生视频功能', () => {
        it('应该包含生视频区域', () => {
            assert.ok(htmlContent.includes('aiVideoSection'), '应该包含 AI 生视频区域');
        });

        it('应该包含首帧和尾帧控制', () => {
            assert.ok(htmlContent.includes('firstFrame') || htmlContent.includes('首帧'), '应该支持首帧设置');
        });

        it('应该包含视频生成按钮', () => {
            assert.ok(htmlContent.includes('generateVideo') || htmlContent.includes('生成视频'), '应该包含视频生成按钮');
        });
    });

    describe('Session 管理', () => {
        it('应该包含设置按钮', () => {
            assert.ok(htmlContent.includes('settings') || htmlContent.includes('设置'), '应该包含设置按钮');
        });

        it('应该包含 sessionid 处理', () => {
            assert.ok(htmlContent.includes('sessionid') || htmlContent.includes('sessionId'), '应该包含 sessionid 处理');
        });

        it('应该使用 localStorage 存储 sessionid', () => {
            assert.ok(htmlContent.includes('localStorage'), '应该使用 localStorage');
        });
    });

    describe('API 调用', () => {
        it('应该包含 fetchJimengAPI 函数', () => {
            assert.ok(htmlContent.includes('fetchJimengAPI'), '应该包含 fetchJimengAPI 函数');
        });

        it('应该包含 X-Session-Id header 设置', () => {
            assert.ok(htmlContent.includes('X-Session-Id'), '应该设置 X-Session-Id 请求头');
        });

        it('应该处理 API 错误', () => {
            assert.ok(htmlContent.includes('catch') || htmlContent.includes('error'), '应该处理 API 错误');
        });
    });

    describe('AI 抠图功能', () => {
        it('应该包含 AI 抠图选项', () => {
            assert.ok(htmlContent.includes('AI 抠图') || htmlContent.includes('aiRemoveBg'), '应该包含 AI 抠图选项');
        });

        it('应该包含 imgly/background-removal 引用', () => {
            assert.ok(htmlContent.includes('@imgly/background-removal') || htmlContent.includes('imgly'), '应该使用 imgly 抠图库');
        });

        it('应该包含进度条', () => {
            assert.ok(htmlContent.includes('progress') || htmlContent.includes('progress-bar'), '应该包含进度显示');
        });
    });

    describe('CSS 样式', () => {
        it('应该使用 CSS 变量', () => {
            assert.ok(htmlContent.includes('--accent') || htmlContent.includes('--primary'), '应该使用 CSS 变量');
        });

        it('应该是深色主题', () => {
            const hasDarkTheme = htmlContent.includes('dark') ||
                                 htmlContent.includes('#1a1a') ||
                                 htmlContent.includes('#0f172a') ||
                                 htmlContent.includes('#1e293b') ||
                                 htmlContent.includes('rgb(30') ||
                                 htmlContent.includes('rgb(15');
            assert.ok(hasDarkTheme, '应该是深色主题');
        });

        it('应该包含响应式设计', () => {
            assert.ok(htmlContent.includes('media') || htmlContent.includes('flex') || htmlContent.includes('grid'), '应该是响应式布局');
        });
    });

    describe('状态管理', () => {
        it('应该包含 state 对象', () => {
            assert.ok(htmlContent.includes('const state') || htmlContent.includes('let state'), '应该包含 state 对象');
        });

        it('应该管理 generatedImages', () => {
            assert.ok(htmlContent.includes('generatedImages'), '应该管理生成的图片');
        });

        it('应该管理 selectedImage', () => {
            assert.ok(htmlContent.includes('selectedImage'), '应该管理选中的图片');
        });

        it('应该管理 generatedVideo', () => {
            assert.ok(htmlContent.includes('generatedVideo'), '应该管理生成的视频');
        });
    });
});

describe('功能完整性测试', () => {
    it('应该包含所有工作流步骤', () => {
        const steps = [
            { name: 'AI 生图', keywords: ['aiImageSection', 'AI 生图', 'generateImage'] },
            { name: 'AI 生视频', keywords: ['aiVideoSection', 'AI 生视频', 'generateVideo'] },
            { name: '导入视频', keywords: ['uploadSection', '视频导入', '上传'] },
            { name: '选择帧', keywords: ['framesSection', '帧选择', 'extractFrames'] },
            { name: '抠图', keywords: ['removeBgSection', '抠图', 'removeBackground'] },
            { name: '导出', keywords: ['spriteSection', '导出', 'export'] }
        ];

        for (const step of steps) {
            const found = step.keywords.some(kw => htmlContent.includes(kw));
            assert.ok(found, `应该包含步骤: ${step.name}`);
        }
    });

    it('应该支持 toast 提示', () => {
        assert.ok(htmlContent.includes('showToast') || htmlContent.includes('toast'), '应该支持 toast 提示');
    });

    it('不应该使用 alert()', () => {
        const alertMatches = htmlContent.match(/alert\s*\(/g);
        assert.strictEqual(alertMatches, null, '不应该使用 alert()，应该用 toast 替代');
    });
});
