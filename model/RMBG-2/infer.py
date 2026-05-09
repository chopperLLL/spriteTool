import argparse
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
