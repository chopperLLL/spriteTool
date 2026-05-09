const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const JIMENG_DIR = path.join(__dirname, 'jimeng-free-api-all');
const JIMENG_PORT = 18000;
const SERVER_PORT = 3000;
const RESULTS_DIR = path.join(__dirname, 'results');
const RMBG_DIR = path.join(__dirname, 'model', 'RMBG-2');
const RMBG_PYTHON = process.env.RMBG_PYTHON || 'C:\\Users\\chenlei\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
const RMBG_MODEL_PATH = path.join(RMBG_DIR, 'model.onnx');
const RMBG_PYTORCH_CONFIG_PATH = path.join(RMBG_DIR, 'config.json');
const RMBG_PYTORCH_SAFETENSORS_PATH = path.join(RMBG_DIR, 'model.safetensors');
const RMBG_PYTORCH_BIN_PATH = path.join(RMBG_DIR, 'pytorch_model.bin');
const RMBG_INFER_SCRIPT = path.join(RMBG_DIR, 'infer.py');
const RMBG_INFER_PYTORCH_SCRIPT = path.join(RMBG_DIR, 'infer_pytorch.py');
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
    '.onnx': 'application/octet-stream',
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

function decodeImageDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') throw new Error('缺少图片数据');
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error('只支持 base64 图片 data URL');
    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64'),
    };
}

function ensureRmbgInferScript() {
    const script = `import argparse
import json
import os
import sys
import tempfile

try:
    import numpy as np
    from PIL import Image
    import onnxruntime as ort
except ModuleNotFoundError as exc:
    missing = getattr(exc, 'name', '') or 'unknown'
    hint = f"缺少 Python 依赖 {missing}。CPU 方案可运行: python -m pip install onnxruntime pillow numpy。若你要 GPU 加速，请安装对应 GPU 版本的 onnxruntime（Windows NVIDIA 常见为 onnxruntime-gpu，Windows AMD/Intel 更适合 DirectML）。"
    print(json.dumps({"ok": False, "error": hint}, ensure_ascii=False))
    sys.exit(2)
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"加载 Python 依赖失败: {exc}"}, ensure_ascii=False))
    sys.exit(2)


def normalize_dims(dims):
    out = []
    for dim in dims or []:
        if isinstance(dim, int):
            out.append(dim)
        else:
            out.append(None)
    return out


def choose_hw(dims, width, height):
    dims = normalize_dims(dims)
    h = dims[-2] if len(dims) >= 2 and isinstance(dims[-2], int) and dims[-2] and dims[-2] > 0 else None
    w = dims[-1] if len(dims) >= 1 and isinstance(dims[-1], int) and dims[-1] and dims[-1] > 0 else None
    if not w and not h:
        return 1024, 1024
    if not w:
        ratio = width / max(height, 1)
        w = max(1, int(round(h * ratio)))
    if not h:
        ratio = height / max(width, 1)
        h = max(1, int(round(w * ratio)))
    return int(w), int(h)


def to_nchw(image, width, height):
    rgb = image.convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
    arr = np.asarray(rgb).astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))[None, ...]
    return arr


def mask_from_output(output, width, height):
    arr = np.asarray(output)
    arr = np.squeeze(arr)
    if arr.ndim == 3:
        arr = arr[0]
    if arr.ndim != 2:
        raise RuntimeError(f'不支持的输出维度: {list(np.asarray(output).shape)}')
    arr = arr.astype(np.float32)
    min_v = float(arr.min())
    max_v = float(arr.max())
    if max_v - min_v < 1e-8:
        arr = np.zeros_like(arr, dtype=np.float32)
    else:
        arr = (arr - min_v) / (max_v - min_v)
    alpha = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype(np.uint8), mode='L')
    if alpha.size != (width, height):
        alpha = alpha.resize((width, height), Image.Resampling.LANCZOS)
    return alpha, min_v, max_v, list(np.asarray(output).shape)


def choose_provider_candidates():
    available = ort.get_available_providers()
    preferred = [
        'CUDAExecutionProvider',
        'TensorrtExecutionProvider',
        'DmlExecutionProvider',
        'ROCMExecutionProvider',
        'OpenVINOExecutionProvider',
        'CPUExecutionProvider',
    ]
    candidates = [provider for provider in preferred if provider in available]
    if 'CPUExecutionProvider' not in candidates:
        candidates.append('CPUExecutionProvider')
    return available, candidates


def create_session_with_fallback(model_path):
    available, candidates = choose_provider_candidates()
    attempts = []
    sess_options = ort.SessionOptions()
    sess_options.log_severity_level = 0
    sess_options.log_verbosity_level = 1
    for provider in candidates:
        try:
            provider_list = [provider, 'CPUExecutionProvider'] if provider != 'CPUExecutionProvider' else ['CPUExecutionProvider']
            session = ort.InferenceSession(model_path, sess_options=sess_options, providers=provider_list)
            active = session.get_providers()
            attempts.append({"provider": provider, "ok": True, "active": active})
            if provider == 'CPUExecutionProvider' or provider in active:
                return session, available, candidates, attempts, provider
        except Exception as exc:
            attempts.append({"provider": provider, "ok": False, "error": str(exc)})
    session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    attempts.append({"provider": 'CPUExecutionProvider', "ok": True, "active": session.get_providers(), "forced": True})
    return session, available, candidates, attempts, 'CPUExecutionProvider'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    image = Image.open(args.input)
    source_width, source_height = image.size
    session, available_providers, providers, attempts, selected_provider = create_session_with_fallback(args.model)
    active_providers = session.get_providers()
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    input_shape = list(session.get_inputs()[0].shape)
    output_shape = list(session.get_outputs()[0].shape)
    target_width, target_height = choose_hw(input_shape, source_width, source_height)
    tensor = to_nchw(image, target_width, target_height)
    outputs = session.run([output_name], {input_name: tensor})
    alpha, min_v, max_v, raw_shape = mask_from_output(outputs[0], source_width, source_height)
    rgba = image.convert('RGBA')
    rgba.putalpha(alpha)
    rgba.save(args.output, format='PNG')
    print(json.dumps({
        "ok": True,
        "pythonExecutable": sys.executable,
        "onnxruntimeVersion": getattr(ort, '__version__', ''),
        "inputName": input_name,
        "outputName": output_name,
        "inputDims": input_shape,
        "outputDims": output_shape,
        "rawOutputShape": raw_shape,
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "targetWidth": target_width,
        "targetHeight": target_height,
        "maskMin": min_v,
        "maskMax": max_v,
        "providers": active_providers,
        "selectedProvider": selected_provider,
        "requestedProviders": providers,
        "availableProviders": available_providers,
        "providerAttempts": attempts,
    }, ensure_ascii=False))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
`;
    fs.writeFileSync(RMBG_INFER_SCRIPT, script, 'utf8');
}

async function runRmbgInference(dataUrl) {
    if (!fs.existsSync(RMBG_MODEL_PATH)) {
        throw new Error(`未找到 RMBG 模型: ${RMBG_MODEL_PATH}`);
    }
    const hasPytorchWeights = fs.existsSync(RMBG_PYTORCH_CONFIG_PATH) && (fs.existsSync(RMBG_PYTORCH_SAFETENSORS_PATH) || fs.existsSync(RMBG_PYTORCH_BIN_PATH));
    const { buffer } = decodeImageDataUrl(dataUrl);
    const tmpDir = fs.mkdtempSync(path.join(RMBG_DIR, 'tmp-'));
    const inputPath = path.join(tmpDir, 'input.png');
    const outputPath = path.join(tmpDir, 'output.png');
    fs.writeFileSync(inputPath, buffer);
    try {
        const scriptPath = hasPytorchWeights ? RMBG_INFER_PYTORCH_SCRIPT : RMBG_INFER_SCRIPT;
        if (hasPytorchWeights) {
            log('[RMBG] 优先使用 PyTorch CUDA 脚本');
        } else {
            log('[RMBG] 未检测到 PyTorch 权重，回退 ONNX');
            ensureRmbgInferScript();
        }
        const args = hasPytorchWeights
            ? [scriptPath, '--model-dir', RMBG_DIR, '--input', inputPath, '--output', outputPath]
            : [scriptPath, '--model', RMBG_MODEL_PATH, '--input', inputPath, '--output', outputPath];
        const result = await new Promise((resolve, reject) => {
            const child = spawn(RMBG_PYTHON, args, {
                cwd: RMBG_DIR,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            const stdout = [];
            const stderr = [];
            child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
            child.stderr.on('data', chunk => {
                const text = Buffer.from(chunk).toString('utf8');
                stderr.push(Buffer.from(chunk));
                if (text.trim()) log('[RMBG][py-stderr] ' + text.trim());
            });
            child.on('error', reject);
            child.on('close', code => {
                const outText = Buffer.concat(stdout).toString('utf8').trim();
                const errText = Buffer.concat(stderr).toString('utf8').trim();
                let payload = null;
                if (outText) {
                    const lastLine = outText.split(/\r?\n/).filter(Boolean).slice(-1)[0];
                    try { payload = JSON.parse(lastLine); } catch {}
                }
                if (code !== 0) {
                    const message = payload && payload.error ? payload.error : (errText || outText || `Python exited with code ${code}`);
                    return reject(new Error(message));
                }
                if (!payload || !payload.ok) {
                    return reject(new Error((payload && payload.error) || 'RMBG 推理未返回成功结果'));
                }
                if (!fs.existsSync(outputPath)) {
                    return reject(new Error('RMBG 推理未生成输出图片'));
                }
                const outputBuffer = fs.readFileSync(outputPath);
                resolve({
                    ...payload,
                    dataUrl: `data:image/png;base64,${outputBuffer.toString('base64')}`,
                });
            });
        });
        log('[RMBG] python=' + (result.pythonExecutable || RMBG_PYTHON));
        log('[RMBG] backend=' + String(result.backend || 'unknown'));
        log('[RMBG] runtime=' + (result.frameworkVersion || result.onnxruntimeVersion || 'unknown'));
        log('[RMBG] availableProviders=' + JSON.stringify(result.availableProviders || []));
        log('[RMBG] activeProviders=' + JSON.stringify(result.providers || []));
        log('[RMBG] selectedProvider=' + String(result.selectedProvider || 'unknown'));
        log('[RMBG] providerAttempts=' + JSON.stringify(result.providerAttempts || []));
        log('[RMBG] requestedProviders=' + JSON.stringify(result.requestedProviders || []));
        log('[RMBG] source=' + String(result.sourceWidth || '?') + 'x' + String(result.sourceHeight || '?') + ' target=' + String(result.targetWidth || '?') + 'x' + String(result.targetHeight || '?'));
        return result;
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}


async function handleRmbgApi(req, res) {
    if (req.url !== '/api/rmbg/probe' || req.method !== 'POST') {
        return sendJSON(res, 404, { error: 'Not Found' });
    }
    try {
        const body = JSON.parse((await collectBody(req)).toString('utf8') || '{}');
        if (!body || typeof body.dataUrl !== 'string') {
            return sendJSON(res, 400, { ok: false, error: '缺少 dataUrl' });
        }
        const result = await runRmbgInference(body.dataUrl);
        return sendJSON(res, 200, { ok: true, ...result });
    } catch (err) {
        return sendJSON(res, 500, { ok: false, error: err.message });
    }
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
        if (req.url.startsWith('/api/rmbg/')) {
            return handleRmbgApi(req, res);
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
