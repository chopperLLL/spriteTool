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

        it('应该包含工作流画布与节点容器', () => {
            const requiredIds = [
                'wfCanvas',
                'wfWorld',
                'wfConnections',
                'ctxMenu',
                'toastContainer'
            ];

            for (const id of requiredIds) {
                assert.ok(htmlContent.includes(id), `应该包含 ${id}`);
            }
        });
    });

    describe('节点工作流布局', () => {
        it('应该包含节点目录与 starter flow', () => {
            assert.ok(htmlContent.includes('const NODE_CATALOG=['), '应该包含节点目录');
            assert.ok(htmlContent.includes('const STARTER_FLOW={'), '应该包含 starter flow');
        });

        it('应该包含节点展开相关样式', () => {
            assert.ok(htmlContent.includes('.wf-node.expanded'), '应该包含节点展开样式');
            assert.ok(htmlContent.includes('.wf-node-content'), '应该包含节点内容区样式');
        });
    });

    describe('AI 生图功能', () => {
        it('应该包含 AI 生图节点渲染函数', () => {
            assert.ok(htmlContent.includes('function renderAiImage'), '应该包含 AI 生图渲染函数');
        });

        it('应该包含 prompt 输入', () => {
            assert.ok(htmlContent.includes('d_aiPrompt') || htmlContent.includes('prompt'), '应该包含 prompt 输入');
        });

        it('应该包含模型选择', () => {
            const hasModelSelect = htmlContent.includes('d_aiModel') && htmlContent.includes('select');
            assert.ok(hasModelSelect, '应该包含模型选择');
        });

        it('应该包含生成按钮', () => {
            assert.ok(htmlContent.includes('d_aiGenBtn') || htmlContent.includes('生成图片'), '应该包含生成按钮');
        });
    });

    describe('AI 生视频功能', () => {
        it('应该包含 AI 生视频节点渲染函数', () => {
            assert.ok(htmlContent.includes('function renderAiVideo'), '应该包含 AI 生视频渲染函数');
        });

        it('应该包含首帧控制', () => {
            assert.ok(htmlContent.includes('d_vfFrame') || htmlContent.includes('首帧'), '应该支持首帧设置');
        });

        it('应该包含视频生成按钮', () => {
            assert.ok(htmlContent.includes('d_vfGenBtn') || htmlContent.includes('生成视频'), '应该包含视频生成按钮');
        });
    });

    describe('Session 管理', () => {
        it('应该包含设置按钮', () => {
            assert.ok(htmlContent.includes('settingsBtn') || htmlContent.includes('设置'), '应该包含设置按钮');
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
            assert.ok(htmlContent.includes('AI 抠图') || htmlContent.includes('d_bgAiTab'), '应该包含 AI 抠图选项');
        });

        it('应该包含 imgly/background-removal 引用', () => {
            assert.ok(htmlContent.includes('@imgly/background-removal') || htmlContent.includes('imgly'), '应该使用 imgly 抠图库');
        });

        it('应该包含进度条', () => {
            assert.ok(htmlContent.includes('progress') || htmlContent.includes('progress-bar'), '应该包含进度显示');
        });

        it('应该包含 RMBG-2 后端入口', () => {
            assert.ok(htmlContent.includes('/model/RMBG-2'), '应该引用本地 RMBG-2 目录');
            assert.ok(htmlContent.includes('RMBG-2（后端）'), '应该提供 RMBG-2 后端选项');
        });

        it('RMBG-2 应该走后端接口并展示推理元数据', () => {
            assert.ok(htmlContent.includes("fetch('/api/rmbg/probe'"), 'RMBG-2 应调用后端接口');
            assert.ok(htmlContent.includes('availableProviders') || htmlContent.includes('可用 provider'), '应展示可用 provider 信息');
            assert.ok(htmlContent.includes('pythonExecutable') || htmlContent.includes('Python:'), '应展示 Python 信息');
            assert.ok(htmlContent.includes('selectedProvider') || htmlContent.includes('推理端:'), '应展示当前 provider');
        });

        it('抠图节点应该支持单图导入', () => {
            assert.ok(htmlContent.includes('d_bgLocalPick'), '应包含单图导入按钮');
            assert.ok(htmlContent.includes('d_bgLocalFile'), '应包含单图文件输入');
            assert.ok(htmlContent.includes('runtime.localImageData'), '应缓存本地图输入');
        });

        it('抠图节点应该支持 AI 方法选择', () => {
            assert.ok(htmlContent.includes('d_bgAiMethod'), '应包含 AI 方法选择器');
            assert.ok(htmlContent.includes('imgly（前端）'), '应提供 imgly 方法');
            assert.ok(htmlContent.includes('RMBG-2（后端）'), '应提供 RMBG-2 方法');
        });

        it('抠图节点应该包含结果预览区域', () => {
            assert.ok(htmlContent.includes('d_bgResultPreview'), '应包含抠图结果预览容器');
            assert.ok(htmlContent.includes('d_bgResultLabel'), '应包含抠图结果标签');
            assert.ok(htmlContent.includes('updateRemoveBgResultPreview('), '应存在抠图结果预览更新函数');
        });
    });

    describe('CSS 样式', () => {
        it('应该使用 CSS 变量', () => {
            assert.ok(htmlContent.includes('--accent') || htmlContent.includes('--primary'), '应该使用 CSS 变量');
        });

        it('应该是深色主题', () => {
            const hasDarkTheme = htmlContent.includes('--bg-primary:#0c0f1a') ||
                                 htmlContent.includes('#0c0f1a') ||
                                 htmlContent.includes('#141829') ||
                                 htmlContent.includes('rgb(15') ||
                                 htmlContent.includes('rgb(20');
            assert.ok(hasDarkTheme, '应该是深色主题');
        });

        it('应该包含响应式设计', () => {
            assert.ok(htmlContent.includes('media') || htmlContent.includes('flex') || htmlContent.includes('grid'), '应该是响应式布局');
        });
    });

    describe('状态管理', () => {
        it('应该包含状态对象', () => {
            assert.ok(htmlContent.includes('const S=') || htmlContent.includes('let S='), '应该包含状态对象');
        });

        it('应该管理 generatedImages', () => {
            assert.ok(htmlContent.includes('generatedImages'), '应该管理生成的图片');
        });

        it('应该管理 selectedImages', () => {
            assert.ok(htmlContent.includes('selectedImages'), '应该管理选中的图片');
        });

        it('应该管理 generatedVideo', () => {
            assert.ok(htmlContent.includes('generatedVideo'), '应该管理生成的视频');
        });
    });
});


describe('功能完整性测试', () => {
    it('应该包含所有工作流步骤', () => {
        const steps = [
            { name: 'AI 生图', keywords: ['renderAiImage', 'AI 生图', 'd_aiGenBtn'] },
            { name: 'AI 生视频', keywords: ['renderAiVideo', 'AI 生视频', 'd_vfGenBtn'] },
            { name: '导入视频', keywords: ['renderImportVideo', '导入视频', '上传'] },
            { name: '选择帧', keywords: ['renderSelectFrames', '帧选择', 'd_framesGrid'] },
            { name: '抠图', keywords: ['renderRemoveBg', '抠图', 'removeBackground'] },
            { name: '导出', keywords: ['renderExport', '导出', 'd_expPng'] }
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


describe('v3 节点交互入口', () => {
    it('应该提供显式的添加节点按钮', () => {
        assert.ok(htmlContent.includes('id="addNodeBtn"'), '工具栏应包含添加节点按钮');
    });

    it('应该支持 Shift 多开和空白区域折叠', () => {
        assert.ok(htmlContent.includes('e.shiftKey'), '节点展开逻辑应读取 Shift 键');
        assert.ok(htmlContent.includes('collapseAllExpanded'), '应该存在折叠所有展开节点的方法');
    });

    it('不应该再使用浏览器原生 confirm()', () => {
        assert.ok(!htmlContent.includes('confirm('), '应移除原生 confirm');
    });
});

describe('v3 连线规则', () => {
    it('只应该保留 frames->image 和 sprite->image 自动适配', () => {
        assert.ok(htmlContent.includes("fromType==='frames'&&toType==='image'"), '应该保留 frames -> image');
        assert.ok(htmlContent.includes("fromType==='sprite'&&toType==='image'"), '应该保留 sprite -> image');
        assert.ok(!htmlContent.includes("toType==='frames'&&fromType==='image'"), '不应再保留 image -> frames');
    });

    it('应该提供连线重连入口', () => {
        assert.ok(htmlContent.includes('beginReconnect('), '应该存在 beginReconnect');
        assert.ok(htmlContent.includes('cancelReconnect('), '应该存在 cancelReconnect');
    });
});

describe('v3 布局与节点状态', () => {
    it('应该为节点实例保留 config 和 runtime 容器', () => {
        assert.ok(htmlContent.includes('config:cloneValue(nd.defaultConfig||{})'), '节点实例应持有 config');
        assert.ok(htmlContent.includes('runtime:{}'), '节点实例应持有 runtime');
    });

    it('应该保存 version 4 布局并提供旧布局迁移函数', () => {
        assert.ok(htmlContent.includes('version:4'), '布局数据应声明 version 4');
        assert.ok(htmlContent.includes('migrateLegacyLayout('), '应存在旧布局迁移函数');
    });
});

describe('v3 节点运行态与 AI 反馈', () => {
    it('AI 抠图节点应该包含逐帧缩略图容器', () => {
        assert.ok(htmlContent.includes('id="d_bgAiThumbs"'), 'AI 抠图节点应包含缩略图区');
    });

    it('节点运行态应该使用 node.runtime 保存可恢复结果', () => {
        assert.ok(htmlContent.includes('ensureNodeRuntime(node)'), '应该显式初始化 node.runtime');
        assert.ok(htmlContent.includes('runtime.aiThumbs'), '应该缓存 AI 抠图缩略图');
    });
});

describe('v3 节点工作流结构', () => {
    it('应该声明节点目录和 starter flow', () => {
        assert.ok(htmlContent.includes('const NODE_CATALOG=['), '应该定义节点目录');
        assert.ok(htmlContent.includes('const STARTER_FLOW={'), '应该定义 starter flow');
    });

    it('AI 生图节点不应该再声明 prompt(image) 输入端口', () => {
        assert.ok(!htmlContent.includes("{id:'prompt',type:'image',label:'prompt'}"), 'prompt 应归入节点配置');
    });

    it('starter flow 不应该默认放入 AI 节点', () => {
        assert.ok(htmlContent.includes("{id:'importVideo_1',typeId:'importVideo'"), '应该包含 importVideo');
        assert.ok(htmlContent.includes("{id:'selectFrames_1',typeId:'selectFrames'"), '应该包含 selectFrames');
        assert.ok(htmlContent.includes("{id:'directSprite_1',typeId:'directSprite'"), '应该包含 directSprite');
        assert.ok(!htmlContent.includes("{id:'aiImage_1',typeId:'aiImage'"), 'starter flow 不应默认包含 aiImage');
        assert.ok(!htmlContent.includes("{id:'aiVideo_1',typeId:'aiVideo'"), 'starter flow 不应默认包含 aiVideo');
        assert.ok(!htmlContent.includes("{id:'img2img_1',typeId:'img2img'"), 'starter flow 不应默认包含 img2img');
    });
});

describe('v3 总回归', () => {
    it('应该同时支持显式添加按钮和右键菜单', () => {
        assert.ok(htmlContent.includes('id="addNodeBtn"'), '需要显式添加入口');
        assert.ok(htmlContent.includes("document.addEventListener('contextmenu'"), '需要右键菜单入口');
    });

    it('不应该再使用 alert() 或 confirm()', () => {
        assert.strictEqual(htmlContent.match(/alert\s*\(/g), null, '不应该使用 alert()');
        assert.strictEqual(htmlContent.match(/confirm\s*\(/g), null, '不应该使用 confirm()');
    });

    it('应该保留 starter flow 的两条主路径', () => {
        assert.ok(htmlContent.includes("{from:'selectFrames_1',fp:'frames',to:'directSprite_1'"), '应保留直接合成路径');
        assert.ok(htmlContent.includes("{from:'selectFrames_1',fp:'frames',to:'removeBg_1'"), '应保留抠图路径');
        assert.ok(htmlContent.includes("{from:'composeSprite_1',fp:'sprite',to:'export_1'"), '应保留导出路径');
    });
});

