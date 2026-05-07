const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const JIMENG_DIR = path.join(__dirname, 'jimeng-free-api-all');
const JIMENG_PORT = 18000;
const SERVER_PORT = 3000;
const RESULTS_DIR = path.join(__dirname, 'results');
const RESULT_SUBDIRS = {
    image: 'images',
    video: 'videos',
    gif: 'gifs',
    sprite: 'sprites',
};
const RESULTS_MANIFEST = path.join(RESULTS_DIR, 'manifest.json');
const JIMENG_REPO = 'https://github.com/wwwzhouhui/jimeng-free-api-all.git';


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
    '.woff2': 'font/woff2',
};

const jimengState = {
    process: null,
    status: 'stopped', // stopped | starting | running | error
    message: '未启动',
    startedAt: null,
    consecutiveFailures: 0,
};

function log(msg) {
    console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function run(cmd, cwd) {
    return new Promise((resolve, reject) => {
        log(`  $ ${cmd}`);
        const child = spawn(cmd, [], { cwd, shell: true, stdio: 'inherit' });
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`"${cmd}" exited with code ${code}`)));
        child.on('error', reject);
    });
}

function openBrowser(url) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
        : process.platform === 'darwin' ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(cmd, err => {
        if (err) log(`请手动打开浏览器访问: ${url}`);
    });
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

async function ensureJimeng() {
    if (fs.existsSync(path.join(JIMENG_DIR, 'package.json'))) {
        log('jimeng-free-api-all 已存在，跳过安装');
        return;
    }

    log('正在安装即梦 AI 服务 (jimeng-free-api-all)...');
    log('首次安装可能需要几分钟，请耐心等待');

    await run(`git clone ${JIMENG_REPO} "${JIMENG_DIR}"`, __dirname);
    log('依赖安装中...');
    await run('npm install', JIMENG_DIR);
    log('编译中...');
    await run('npm run build', JIMENG_DIR);
    log('即梦 AI 服务安装完成');
}

function spawnJimeng() {
    return new Promise((resolve, reject) => {
        const entryFile = path.join(JIMENG_DIR, 'dist', 'index.js');
        if (!fs.existsSync(entryFile)) {
            return reject(new Error(`未找到编译产物: ${entryFile}`));
        }

        log(`正在启动即梦 AI 服务 (端口 ${JIMENG_PORT})...`);
        const safeEnv = {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            USERPROFILE: process.env.USERPROFILE,
            APPDATA: process.env.APPDATA,
            LOCALAPPDATA: process.env.LOCALAPPDATA,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            SystemRoot: process.env.SystemRoot,
            SERVER_PORT: String(JIMENG_PORT),
        };
        const child = spawn('node', [entryFile], {
            cwd: JIMENG_DIR,
            env: safeEnv,
            stdio: 'inherit',
        });

        let settled = false;
        child.on('error', err => {
            if (!settled) { settled = true; reject(err); }
            jimengState.status = 'error';
            jimengState.message = '进程错误: ' + err.message;
        });
        child.on('exit', code => {
            if (!settled) { settled = true; reject(new Error(`即梦 AI 服务启动后立即退出 (code ${code})`)); return; }
            if (code !== 0 && code !== null) {
                log(`即梦 AI 服务已退出 (code ${code})`);
            }
            if (jimengState.process === child) {
                jimengState.process = null;
                jimengState.status = 'stopped';
                jimengState.message = `已退出 (code ${code})`;
            }
        });

        setTimeout(() => {
            if (!settled) { settled = true; resolve(child); }
        }, 500);
    });
}

async function waitForJimeng(maxRetries = 60, interval = 2000) {
    log('等待即梦 AI 服务就绪...');
    for (let i = 0; i < maxRetries; i++) {
        try {
            const { status } = await httpGet(`http://localhost:${JIMENG_PORT}/v1/models`);
            if (status === 200) {
                log('即梦 AI 服务已就绪');
                return;
            }
        } catch {}
        if (i % 5 === 0 && i > 0) log(`  等待中... (${i * interval / 1000}s)`);
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('即梦 AI 服务启动超时');
}

async function startJimengManaged() {
    if (jimengState.status === 'starting' || jimengState.status === 'running') {
        return { ok: false, message: '服务已在运行或启动中' };
    }
    jimengState.status = 'starting';
    jimengState.message = '正在启动...';
    try {
        await ensureJimeng();
        const child = await spawnJimeng();
        jimengState.process = child;
        await waitForJimeng();
        jimengState.status = 'running';
        jimengState.message = '运行中';
        jimengState.startedAt = Date.now();
        jimengState.consecutiveFailures = 0;
        return { ok: true, message: '启动成功' };
    } catch (err) {
        jimengState.status = 'error';
        jimengState.message = err.message;
        if (jimengState.process) { try { jimengState.process.kill(); } catch {} jimengState.process = null; }
        return { ok: false, message: err.message };
    }
}

async function stopJimeng() {
    if (jimengState.process) {
        try { jimengState.process.kill(); } catch {}
        jimengState.process = null;
    }
    jimengState.status = 'stopped';
    jimengState.message = '已停止';
}

async function restartJimeng() {
    await stopJimeng();
    await new Promise(r => setTimeout(r, 500));
    return startJimengManaged();
}

async function getHealthStatus() {
    if (jimengState.status === 'starting') {
        return { status: jimengState.status, message: jimengState.message, startedAt: jimengState.startedAt };
    }
    try {
        const { status } = await httpGet(`http://localhost:${JIMENG_PORT}/v1/models`);
        if (status === 200) {
            jimengState.consecutiveFailures = 0;
            if (jimengState.status !== 'running') {
                log('即梦 AI 服务已恢复');
            }
            jimengState.status = 'running';
            jimengState.message = '运行中';
        } else {
            jimengState.consecutiveFailures++;
            if (jimengState.consecutiveFailures >= 3) {
                jimengState.status = 'error';
                jimengState.message = `健康检查失败 (${status})`;
            }
        }
    } catch (err) {
        jimengState.consecutiveFailures++;
        if (jimengState.consecutiveFailures >= 3) {
            jimengState.status = 'error';
            jimengState.message = '无法连接到服务';
        }
    }
    return {
        status: jimengState.status,
        message: jimengState.message,
        startedAt: jimengState.startedAt,
    };
}

function collectBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

const ALLOWED_PROXY_HEADERS = new Set([
    'content-type',
    'content-length',
    'accept',
    'accept-encoding',
    'user-agent',
]);

function proxyRequest(req, res) {
    const targetPath = req.url.replace('/api/jimeng/', '/v1/');
    const sessionId = req.headers['x-session-id'] || '';

    const headers = {
        host: `localhost:${JIMENG_PORT}`,
    };
    for (const [key, value] of Object.entries(req.headers)) {
        if (ALLOWED_PROXY_HEADERS.has(key.toLowerCase())) {
            headers[key] = value;
        }
    }
    if (sessionId) headers.authorization = `Bearer ${sessionId}`;

    const options = {
        hostname: 'localhost',
        port: JIMENG_PORT,
        path: targetPath,
        method: req.method,
        headers,
    };

    const proxy = http.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
    });

    proxy.on('error', err => {
        log(`代理请求失败: ${err.message}`);
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '即梦 AI 服务不可用，请检查服务是否正常运行' }));
        }
    });

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        collectBody(req).then(body => proxy.end(body)).catch(() => proxy.end());
    } else {
        proxy.end();
    }
}

function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'sprite-tool.html' : req.url);
    filePath = path.resolve(filePath);

    if (!filePath.startsWith(path.resolve(__dirname))) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(__dirname, 'sprite-tool.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const stream = fs.createReadStream(filePath);
    stream.on('open', () => {
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        stream.pipe(res);
    });
    stream.on('error', () => {
        if (!res.headersSent) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });
}

function sendJSON(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function ensureResultsStore() {
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
    Object.values(RESULT_SUBDIRS).forEach(dir => {
        const full = path.join(RESULTS_DIR, dir);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    });
    if (!fs.existsSync(RESULTS_MANIFEST)) {
        fs.writeFileSync(RESULTS_MANIFEST, JSON.stringify({ results: [] }, null, 2), 'utf8');
    }
}

function readResultsManifest() {
    ensureResultsStore();
    try {
        return JSON.parse(fs.readFileSync(RESULTS_MANIFEST, 'utf8'));
    } catch {
        return { results: [] };
    }
}

function writeResultsManifest(data) {
    ensureResultsStore();
    fs.writeFileSync(RESULTS_MANIFEST, JSON.stringify(data, null, 2), 'utf8');
}

function extFromDataUrl(dataUrl, fallback = '.png') {
    if (!dataUrl || typeof dataUrl !== 'string') return fallback;
    const match = dataUrl.match(/^data:(image|video)\/([a-zA-Z0-9.+-]+);base64,/);
    if (!match) return fallback;
    const ext = match[2].toLowerCase();
    return ext === 'jpeg' ? '.jpg' : '.' + ext;
}

function extFromRemoteUrl(url, fallback = '.png') {
    try {
        const pathname = new URL(url).pathname;
        const ext = path.extname(pathname);
        return ext || fallback;
    } catch {
        return fallback;
    }
}

function fetchRemoteBuffer(url) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const proto = target.protocol === 'https:' ? require('https') : http;
        const req = proto.get(target, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, target).toString();
                return resolve(fetchRemoteBuffer(redirectUrl));
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        });
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('请求超时')); });
        req.on('error', reject);
    });
}

async function saveResultFile(record) {
    const type = RESULT_SUBDIRS[record.type] ? record.type : 'image';
    const subdir = path.join(RESULTS_DIR, RESULT_SUBDIRS[type]);
    let filePath = '';
    let fileUrl = '';
    if (record.data && typeof record.data.dataUrl === 'string' && record.data.dataUrl.startsWith('data:')) {
        const ext = extFromDataUrl(record.data.dataUrl, type === 'gif' ? '.gif' : '.png');
        const fileName = `${record.id}${ext}`;
        filePath = path.join(subdir, fileName);
        const base64 = record.data.dataUrl.split(',')[1] || '';
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        fileUrl = `/results/${RESULT_SUBDIRS[type]}/${fileName}`;
        return { filePath, fileUrl };
    }
    const firstUrl = record.data && Array.isArray(record.data.urls) && record.data.urls.length ? record.data.urls[0] : (record.data && record.data.url ? record.data.url : '');
    if (firstUrl && /^https?:/i.test(firstUrl)) {
        const ext = extFromRemoteUrl(firstUrl, type === 'video' ? '.mp4' : '.png');
        const fileName = `${record.id}${ext}`;
        filePath = path.join(subdir, fileName);
        const buffer = await fetchRemoteBuffer(firstUrl);
        fs.writeFileSync(filePath, buffer);
        fileUrl = `/results/${RESULT_SUBDIRS[type]}/${fileName}`;
    }
    return { filePath, fileUrl };
}

async function handleResultsApi(req, res) {
    if (req.url === '/api/results' && req.method === 'GET') {
        const manifest = readResultsManifest();
        return sendJSON(res, 200, manifest);
    }
    if (req.url === '/api/results' && req.method === 'POST') {
        try {
            const body = JSON.parse((await collectBody(req)).toString('utf8') || '{}');
            const manifest = readResultsManifest();
            const saved = { ...body };
            const fileState = await saveResultFile(saved);
            if (fileState.filePath) saved.filePath = fileState.filePath;
            if (fileState.fileUrl) saved.fileUrl = fileState.fileUrl;
            manifest.results = Array.isArray(manifest.results) ? manifest.results : [];
            manifest.results.unshift(saved);
            writeResultsManifest(manifest);
            return sendJSON(res, 200, { ok: true, record: saved });
        } catch (err) {
            return sendJSON(res, 500, { ok: false, error: err.message });
        }
    }
    return sendJSON(res, 404, { error: 'Not Found' });
}

const VIDEO_PROXY_ALLOWED_HOSTS = [
    'tos-cn-beijing.volces.com',
    'tos-cn-shanghai.volces.com',
    'v3-webf.ixigua.com',
    'v3-dreamnia.jimeng.com',
    'p3-pc-sign.douyinpic.com',
    'douyinpic.com',
    'ixigua.com',
    'volces.com',
    'volccdn.com',
    'byteimg.com',
    'ibyteimg.com',
    'byted-static.com',
    'zijieapi.com',
    'jimeng.com',
    'snssdk.com',
    'tos-cn-i-hl.snssdk.com',
    'tos-cn-p-001.snssdk.com',
];

const IMAGE_PROXY_ALLOWED_HOSTS = [
    'byteimg.com',
    'ibyteimg.com',
    'douyinpic.com',
    'ixigua.com',
    'volces.com',
    'volccdn.com',
    'byted-static.com',
    'jimeng.com',
    'snssdk.com',
];

function proxyVideoDownload(req, res) {
    const urlParam = new URL(req.url, `http://localhost:${SERVER_PORT}`).searchParams.get('url');
    if (!urlParam) {
        return sendJSON(res, 400, { error: '缺少 url 参数' });
    }

    let targetUrl;
    try {
        targetUrl = new URL(urlParam);
    } catch {
        return sendJSON(res, 400, { error: '无效的 URL' });
    }

    const isAllowed = VIDEO_PROXY_ALLOWED_HOSTS.some(h =>
        targetUrl.hostname === h || targetUrl.hostname.endsWith('.' + h));
    if (!isAllowed) {
        log(`拒绝代理非白名单域名: ${targetUrl.hostname}`);
        return sendJSON(res, 403, { error: '不允许的域名' });
    }

    function doRequest(url) {
        return new Promise((resolve, reject) => {
            const proto = url.protocol === 'https:' ? require('https') : http;
            const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, resolve);
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('请求超时')); });
            req.on('error', reject);
        });
    }

    (async () => {
        try {
            let proxyRes = await doRequest(targetUrl);
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                const redirectUrl = new URL(proxyRes.headers.location, targetUrl);
                const isRedirAllowed = VIDEO_PROXY_ALLOWED_HOSTS.some(h =>
                    redirectUrl.hostname === h || redirectUrl.hostname.endsWith('.' + h));
                if (!isRedirAllowed) {
                    log(`拒绝代理重定向至非白名单域名: ${redirectUrl.hostname}`);
                    return sendJSON(res, 403, { error: '不允许的重定向域名' });
                }
                proxyRes = await doRequest(redirectUrl);
            }

            const ct = proxyRes.headers['content-type'] || '';
            if (!ct.startsWith('video/') && !ct.startsWith('application/octet-stream')) {
                return sendJSON(res, 400, { error: '非视频内容类型: ' + ct });
            }

            const headers = { 'Content-Type': ct || 'video/mp4', 'Content-Disposition': 'attachment; filename="ai-video.mp4"' };
            if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length'];
            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        } catch (e) {
            sendJSON(res, 502, { error: '下载远程视频失败: ' + e.message });
        }
    })();
}

function proxyImageDownload(req, res) {
    const urlParam = new URL(req.url, `http://localhost:${SERVER_PORT}`).searchParams.get('url');
    if (!urlParam) {
        return sendJSON(res, 400, { error: '缺少 url 参数' });
    }

    let targetUrl;
    try {
        targetUrl = new URL(urlParam);
    } catch {
        return sendJSON(res, 400, { error: '无效的 URL' });
    }

    const isAllowed = IMAGE_PROXY_ALLOWED_HOSTS.some(h =>
        targetUrl.hostname === h || targetUrl.hostname.endsWith('.' + h));
    if (!isAllowed) {
        log(`拒绝代理非白名单图片域名: ${targetUrl.hostname}`);
        return sendJSON(res, 403, { error: '不允许的图片域名' });
    }

    function doRequest(url) {
        return new Promise((resolve, reject) => {
            const proto = url.protocol === 'https:' ? require('https') : http;
            const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, resolve);
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('请求超时')); });
            req.on('error', reject);
        });
    }

    (async () => {
        try {
            let proxyRes = await doRequest(targetUrl);
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                const redirectUrl = new URL(proxyRes.headers.location, targetUrl);
                const isRedirAllowed = IMAGE_PROXY_ALLOWED_HOSTS.some(h =>
                    redirectUrl.hostname === h || redirectUrl.hostname.endsWith('.' + h));
                if (!isRedirAllowed) {
                    log(`拒绝代理重定向至非白名单图片域名: ${redirectUrl.hostname}`);
                    return sendJSON(res, 403, { error: '不允许的图片重定向域名' });
                }
                proxyRes = await doRequest(redirectUrl);
            }

            const ct = proxyRes.headers['content-type'] || '';
            if (!ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) {
                return sendJSON(res, 400, { error: '非图片内容类型: ' + ct });
            }

            const headers = { 'Content-Type': ct || 'image/png', 'Cache-Control': 'no-cache' };
            if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length'];
            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        } catch (e) {
            sendJSON(res, 502, { error: '下载远程图片失败: ' + e.message });
        }
    })();
}

async function handleControlApi(req, res) {
    if (req.url === '/api/health' && req.method === 'GET') {
        const health = await getHealthStatus();
        return sendJSON(res, 200, health);
    }
    if (req.url === '/api/jimeng-service/restart' && req.method === 'POST') {
        const result = await restartJimeng();
        return sendJSON(res, result.ok ? 200 : 500, result);
    }
    if (req.url === '/api/jimeng-service/start' && req.method === 'POST') {
        const result = await startJimengManaged();
        return sendJSON(res, result.ok ? 200 : 500, result);
    }
    if (req.url === '/api/jimeng-service/stop' && req.method === 'POST') {
        await stopJimeng();
        return sendJSON(res, 200, { ok: true, message: '已停止' });
    }
    sendJSON(res, 404, { error: 'Not Found' });
}

async function main() {
    log('=== 精灵图工具服务器 ===');

    const server = http.createServer((req, res) => {
        const origin = req.headers.origin;
        const allowedOrigin = `http://localhost:${SERVER_PORT}`;
        if (origin === allowedOrigin || origin === `http://127.0.0.1:${SERVER_PORT}`) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        if (req.url === '/api/health' || req.url.startsWith('/api/jimeng-service/')) {
            return handleControlApi(req, res);
        }
        if (req.url.startsWith('/api/results')) {
            return handleResultsApi(req, res);
        }
        if (req.url.startsWith('/results/')) {
            return serveStatic(req, res);
        }
        if (req.url.startsWith('/api/jimeng/image-download')) {
            return proxyImageDownload(req, res);
        }
        if (req.url.startsWith('/api/jimeng/video-download')) {
            return proxyVideoDownload(req, res);
        }
        if (req.url.startsWith('/api/jimeng/')) {
            return proxyRequest(req, res);
        }
        serveStatic(req, res);
    });

    server.listen(SERVER_PORT, () => {
        log(`服务器已启动: http://localhost:${SERVER_PORT}`);
        openBrowser(`http://localhost:${SERVER_PORT}`);
    });

    startJimengManaged().then(result => {
        if (result.ok) {
            log('即梦 AI 服务已就绪');
        } else {
            log(`即梦 AI 服务启动失败: ${result.message}`);
            log('可在页面点击「启动 AI 服务」重试');
        }
    });

    const healthInterval = setInterval(async () => {
        if (jimengState.status === 'starting') return;
        const prev = jimengState.status;
        await getHealthStatus();
        if (jimengState.status !== prev && jimengState.status !== 'running') {
            log(`即梦 AI 服务状态变更: ${prev} -> ${jimengState.status}`);
        }
    }, 30000);

    process.on('SIGINT', () => {
        log('正在关闭...');
        clearInterval(healthInterval);
        stopJimeng();
        process.exit(0);
    });
}

main();
