#!/usr/bin/env bash
# oleg-motion setup.
#   scripts/setup.sh          core: engine deps (Playwright) — needs node ≥20 and ffmpeg
#   scripts/setup.sh --psd    + light Python venv for PSD import (Pillow, numpy, psd-tools, OpenCV)
#   scripts/setup.sh --ml     + auto-layers: subject cut-out, text detection, inpainting, depth (ONNX, no PyTorch)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OLEG_MOTION_HOME:-$HOME/.cache/oleg-motion}"
VENV="$HOME_DIR/venv"
MODE="${1:-core}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "✗ $1 not found. $2"; exit 1; }; }
need node "Install Node.js ≥20 (macOS: brew install node)."
need ffmpeg "Install ffmpeg (macOS: brew install ffmpeg; Debian/Ubuntu: apt install ffmpeg)."

echo "→ engine dependencies"
(cd "$ROOT/engine" && npm install --no-audit --no-fund --silent)
# Prefer the system Chrome (no download); fall back to Playwright's Chromium.
if [ ! -d "/Applications/Google Chrome.app" ] && ! command -v google-chrome >/dev/null 2>&1; then
  (cd "$ROOT/engine" && npx --yes playwright install chromium)
fi

if [ "$MODE" = "--psd" ] || [ "$MODE" = "--ml" ]; then
  PY="${PYTHON:-python3}"
  need "$PY" "Install Python 3.11–3.13."
  mkdir -p "$HOME_DIR"
  [ -x "$VENV/bin/python" ] || "$PY" -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  echo "→ python: imaging + PSD"
  "$VENV/bin/pip" install -q pillow numpy "opencv-python-headless>=4.9" "psd-tools>=1.10"
  if [ "$MODE" = "--ml" ]; then
    echo "→ python: ML (onnxruntime, rembg, text detection)"
    "$VENV/bin/pip" install -q onnxruntime "rembg>=2.0.60" huggingface_hub
    if [ "$(uname)" = "Darwin" ]; then "$VENV/bin/pip" install -q ocrmac; fi
    echo "→ downloading models (first time only, ~600 MB)"
    "$VENV/bin/python" "$ROOT/scripts/ml/models.py" --download-all
  fi
fi
echo "✓ done. Check with: node $ROOT/engine/cli.mjs doctor"
