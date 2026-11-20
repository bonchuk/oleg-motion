"""Model registry and downloads for oleg-motion auto-layers.

All models run through onnxruntime (CPU on any OS; CoreML provider used on macOS when it
helps), so no PyTorch is needed. Only permissively licensed checkpoints are used by default:
  - subject cut-out: BiRefNet (MIT) via rembg ('birefnet-general-lite')
  - inpainting:      LaMa (Apache-2.0) ONNX export, 512×512
  - depth:           Depth Anything V2 Small (Apache-2.0) ONNX export
Non-commercial models (BRIA RMBG-2.0, Depth Anything V2 Base/Large) are deliberately not used.
"""
import os
import sys
import urllib.request
from pathlib import Path

HOME = Path(os.environ.get("OLEG_MOTION_HOME", Path.home() / ".cache" / "oleg-motion"))
MODELS = HOME / "models"

REGISTRY = {
    "lama": {
        "file": "lama_fp32.onnx",
        "url": "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx",
        "license": "Apache-2.0 (LaMa)",
    },
    "depth": {
        "file": "depth_anything_v2_small.onnx",
        "url": "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
        "license": "Apache-2.0 (Depth Anything V2 Small)",
    },
}
REMBG_MODEL = os.environ.get("OLEG_MOTION_REMBG_MODEL", "birefnet-general-lite")


def model_path(key: str) -> Path:
    return MODELS / REGISTRY[key]["file"]


def ensure(key: str, quiet: bool = False) -> Path:
    p = model_path(key)
    if p.exists() and p.stat().st_size > 1_000_000:
        return p
    MODELS.mkdir(parents=True, exist_ok=True)
    url = REGISTRY[key]["url"]
    tmp = p.with_suffix(".part")
    if not quiet:
        print(f"downloading {key} model → {p}", file=sys.stderr)

    last = [-1]

    def hook(blocks, bs, total):
        if quiet or total <= 0:
            return
        done = min(100, blocks * bs * 100 // total)
        if done != last[0] and done % 10 == 0:
            last[0] = done
            print(f"  {done}%", file=sys.stderr)

    urllib.request.urlretrieve(url, tmp, hook)
    if not quiet:
        print("", file=sys.stderr)
    tmp.rename(p)
    return p


def ort_session(path: Path):
    import onnxruntime as ort
    providers = ["CPUExecutionProvider"]
    return ort.InferenceSession(str(path), providers=providers)


if __name__ == "__main__":
    if "--download-all" in sys.argv:
        for k in REGISTRY:
            ensure(k)
        try:  # rembg downloads its own weights on first use; trigger it now
            from rembg import new_session
            new_session(REMBG_MODEL)
            print(f"rembg model ready: {REMBG_MODEL}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"rembg model not prepared: {e}", file=sys.stderr)
    else:
        for k, v in REGISTRY.items():
            print(k, model_path(k), "OK" if model_path(k).exists() else "missing", v["license"])
