#!/usr/bin/env bash
# oleg-motion setup — no Homebrew, no admin password, no Terminal skills needed.
#   scripts/setup.sh          core: engine (Node.js + Playwright) and ffmpeg
#   scripts/setup.sh --psd    + Python environment for PSD import
#   scripts/setup.sh --ml     + auto-layers (subject cut-out, text detection, inpainting, depth)
#
# Tools already on the machine are used when they are good enough. Missing ones are downloaded
# as private copies into $OLEG_MOTION_HOME/tools (default ~/.cache/oleg-motion/tools); nothing
# outside that folder and ~/.rembg is touched. Safe to re-run: finished steps are skipped.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OLEG_MOTION_HOME:-$HOME/.cache/oleg-motion}"
TOOLS="$HOME_DIR/tools"
BIN="$TOOLS/bin"
VENV="$HOME_DIR/venv"
MODE="${1:-core}"
mkdir -p "$BIN"
export PATH="$BIN:$PATH"
chmod +x "$ROOT/om" "$ROOT/scripts/"*.sh 2>/dev/null || true  # zip downloads may drop the bit

# Pinned versions — bump here when updating.
NODE_VERSION=22.23.5                  # https://nodejs.org/dist/
UV_VERSION=0.13.9                     # https://github.com/astral-sh/uv/releases (installs Python)
PY_VERSION=3.12
FFMPEG_MAC_ARM64=1789931890_9.0.2     # static builds: https://ffmpeg.martin-riedl.de
FFMPEG_MAC_AMD64=1789931006_9.0.2

OS="$(uname -s)"; ARCH="$(uname -m)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fetch() { echo "    downloading $(basename "$2") …"; curl -fL --retry 3 --retry-delay 2 --connect-timeout 20 -sS -o "$2" "$1"; }
# On macOS without developer tools, /usr/bin/python3 and git are stubs that pop up an
# install dialog — never call them there.
has_clt() { [ "$OS" != "Darwin" ] || xcode-select -p >/dev/null 2>&1; }

# ---------------------------------------------------------------- Node.js
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -ge 20 ]; }
if node_ok; then
  echo "✓ Node.js $(node -v)"
else
  case "$OS-$ARCH" in
    Darwin-arm64) P=darwin-arm64 ;; Darwin-x86_64) P=darwin-x64 ;;
    Linux-x86_64) P=linux-x64 ;; Linux-aarch64|Linux-arm64) P=linux-arm64 ;;
    *) echo "✗ unsupported system $OS-$ARCH for automatic Node.js — install Node.js ≥20 yourself"; exit 1 ;;
  esac
  echo "→ Node.js $NODE_VERSION (private copy)"
  fetch "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-$P.tar.gz" "$TMP/node.tgz"
  rm -rf "$TOOLS/node"; mkdir -p "$TOOLS/node"
  tar -xzf "$TMP/node.tgz" -C "$TOOLS/node" --strip-components 1
  for b in node npm npx; do ln -sf "$TOOLS/node/bin/$b" "$BIN/$b"; done
  echo "✓ Node.js $(node -v)"
fi

# ---------------------------------------------------------------- ffmpeg + ffprobe
ff_ok() { command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1 \
          && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264; }
if ff_ok; then
  echo "✓ ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
else
  if [ "$OS" = "Darwin" ]; then
    case "$ARCH" in arm64) B="arm64/$FFMPEG_MAC_ARM64" ;; *) B="amd64/$FFMPEG_MAC_AMD64" ;; esac
    echo "→ ffmpeg (private copy, ~55 MB, may take a few minutes)"
    for t in ffmpeg ffprobe; do
      fetch "https://ffmpeg.martin-riedl.de/download/macos/$B/$t.zip" "$TMP/$t.zip"
      unzip -oq "$TMP/$t.zip" -d "$TMP/$t" && mv -f "$TMP/$t/$t" "$BIN/$t" && chmod +x "$BIN/$t"
    done
    ff_ok || { echo "✗ downloaded ffmpeg does not work"; exit 1; }
    echo "✓ ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
  else
    echo "✗ ffmpeg with libx264 not found. Install it with your package manager (Debian/Ubuntu: apt install ffmpeg)."
    exit 1
  fi
fi

# ---------------------------------------------------------------- engine (Playwright)
echo "→ engine dependencies"
(cd "$ROOT/engine" && npm install --no-audit --no-fund --silent)
# Prefer the system Chrome (no download); otherwise Playwright's own Chromium (no admin rights).
if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ] \
   && ! command -v google-chrome >/dev/null 2>&1; then
  echo "→ Chromium for rendering (Google Chrome not found)"
  (cd "$ROOT/engine" && npx --yes playwright install chromium)
fi
echo "✓ engine"

# ---------------------------------------------------------------- Python (PSD / ML)
if [ "$MODE" = "--psd" ] || [ "$MODE" = "--ml" ]; then
  py_ok() { "$1" -c 'import sys; sys.exit(0 if (3, 11) <= sys.version_info[:2] <= (3, 13) else 1)' >/dev/null 2>&1; }
  PY=""
  if [ -x "$VENV/bin/python" ] && py_ok "$VENV/bin/python"; then
    PY="$VENV/bin/python"
  else
    for c in "${PYTHON:-}" python3.13 python3.12 python3.11 python3; do
      [ -n "$c" ] || continue
      p="$(command -v "$c" 2>/dev/null)" || continue
      [ "$p" = "/usr/bin/python3" ] && ! has_clt && continue
      if py_ok "$p"; then PY="$p"; break; fi
    done
    if [ -z "$PY" ]; then
      echo "→ Python $PY_VERSION (private copy via uv)"
      if ! command -v uv >/dev/null 2>&1; then
        case "$OS-$ARCH" in
          Darwin-arm64) U=aarch64-apple-darwin ;; Darwin-x86_64) U=x86_64-apple-darwin ;;
          Linux-x86_64) U=x86_64-unknown-linux-gnu ;; Linux-aarch64|Linux-arm64) U=aarch64-unknown-linux-gnu ;;
          *) echo "✗ unsupported system for automatic Python"; exit 1 ;;
        esac
        fetch "https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-$U.tar.gz" "$TMP/uv.tgz"
        tar -xzf "$TMP/uv.tgz" -C "$TMP"
        mv -f "$TMP/uv-$U/uv" "$BIN/uv"; chmod +x "$BIN/uv"
      fi
      export UV_PYTHON_INSTALL_DIR="$TOOLS/python"
      uv python install "$PY_VERSION" --quiet
      PY="$(uv python find "$PY_VERSION")"
    fi
    rm -rf "$VENV"
    "$PY" -m venv "$VENV"
  fi
  echo "✓ Python $("$VENV/bin/python" -V | awk '{print $2}')"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  echo "→ python: imaging + PSD"
  "$VENV/bin/pip" install -q certifi pillow numpy "opencv-python-headless>=4.9" "psd-tools>=1.10"
  if [ "$MODE" = "--ml" ]; then
    echo "→ python: ML (onnxruntime, rembg, text detection)"
    "$VENV/bin/pip" install -q onnxruntime "rembg>=2.0.60" huggingface_hub
    if [ "$OS" = "Darwin" ]; then "$VENV/bin/pip" install -q ocrmac; fi
    echo "→ downloading models (first time only, ~500 MB)"
    "$VENV/bin/python" "$ROOT/scripts/ml/models.py" --download-all
  fi
fi

echo
"$ROOT/om" doctor || true
echo "✓ done"
