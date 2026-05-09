import argparse
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image
    import torch
    from transformers import AutoModelForImageSegmentation
except ModuleNotFoundError as exc:
    missing = getattr(exc, 'name', '') or 'unknown'
    print(json.dumps({"ok": False, "error": f"缺少 Python 依赖 {missing}。请在当前 Python 环境安装 torch transformers pillow numpy timm kornia。"}, ensure_ascii=False))
    sys.exit(2)
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"加载 PyTorch 依赖失败: {exc}"}, ensure_ascii=False))
    sys.exit(2)


def pil_to_tensor(image, width, height):
    rgb = image.convert('RGB').resize((width, height), Image.Resampling.LANCZOS)
    arr = np.asarray(rgb).astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))[None, ...]
    return torch.from_numpy(arr)


def normalize_mask(mask):
    arr = np.asarray(mask).astype(np.float32)
    min_v = float(arr.min())
    max_v = float(arr.max())
    if max_v - min_v < 1e-8:
        arr = np.zeros_like(arr, dtype=np.float32)
    else:
        arr = (arr - min_v) / (max_v - min_v)
    return arr, min_v, max_v


def save_rgba(image, mask_array, output_path):
    alpha = Image.fromarray(np.clip(mask_array * 255.0, 0, 255).astype(np.uint8), mode='L')
    if alpha.size != image.size:
        alpha = alpha.resize(image.size, Image.Resampling.LANCZOS)
    rgba = image.convert('RGBA')
    rgba.putalpha(alpha)
    rgba.save(output_path, format='PNG')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    image = Image.open(args.input)
    source_width, source_height = image.size
    target_width, target_height = 1024, 1024
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    model = AutoModelForImageSegmentation.from_pretrained(
        args.model_dir,
        trust_remote_code=True,
        local_files_only=True,
    )
    model.to(device)
    model.eval()

    tensor = pil_to_tensor(image, target_width, target_height).to(device)
    with torch.no_grad():
        outputs = model(tensor)
        logits = outputs[-1] if isinstance(outputs, (tuple, list)) else (outputs.logits if hasattr(outputs, 'logits') else outputs)
        if isinstance(logits, (tuple, list)):
            logits = logits[-1]
        probs = torch.sigmoid(logits)
        probs = torch.nn.functional.interpolate(probs, size=(source_height, source_width), mode='bilinear', align_corners=False)
        mask = probs[0, 0].detach().float().cpu().numpy()

    norm_mask, min_v, max_v = normalize_mask(mask)
    save_rgba(image, norm_mask, args.output)

    print(json.dumps({
        "ok": True,
        "backend": "pytorch",
        "pythonExecutable": sys.executable,
        "frameworkVersion": getattr(torch, '__version__', ''),
        "inputName": "pixel_values",
        "outputName": "logits",
        "inputDims": [1, 3, target_height, target_width],
        "outputDims": list(mask.shape),
        "rawOutputShape": list(mask.shape),
        "sourceWidth": source_width,
        "sourceHeight": source_height,
        "targetWidth": target_width,
        "targetHeight": target_height,
        "maskMin": min_v,
        "maskMax": max_v,
        "providers": [device],
        "selectedProvider": device,
        "requestedProviders": ["cuda", "cpu"],
        "availableProviders": ["cuda" if torch.cuda.is_available() else "cpu"],
        "providerAttempts": [{"provider": device, "ok": True, "active": [device]}],
    }, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        sys.exit(1)
