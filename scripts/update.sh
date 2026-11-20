#!/usr/bin/env bash
# Update oleg-motion to the latest version on GitHub, then re-run setup at the installed level.
# Works with or without git: a git checkout is pulled, a zip install is refreshed from the
# repository archive. Files you added (e.g. your own brand kits) are kept.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOME_DIR="${OLEG_MOTION_HOME:-$HOME/.cache/oleg-motion}"
REPO="${OLEG_MOTION_REPO:-bonchuk/oleg-motion}"
has_clt() { [ "$(uname -s)" != "Darwin" ] || xcode-select -p >/dev/null 2>&1; }

if [ -d "$ROOT/.git" ] && has_clt && command -v git >/dev/null 2>&1; then
  echo "→ git pull"
  git -C "$ROOT" pull --ff-only
else
  echo "→ downloading the latest version of $REPO"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  curl -fL --retry 3 -sS -o "$TMP/src.zip" "https://github.com/$REPO/archive/refs/heads/main.zip"
  unzip -q "$TMP/src.zip" -d "$TMP"
  SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
  # copy over the old files; keep node_modules and anything the user added
  (cd "$SRC" && tar -cf - .) | (cd "$ROOT" && tar -xf -)
fi

LEVEL=""
if [ -f "$HOME_DIR/models/lama_fp32.onnx" ]; then LEVEL="--ml"
elif [ -x "$HOME_DIR/venv/bin/python" ]; then LEVEL="--psd"; fi
exec bash "$ROOT/scripts/setup.sh" $LEVEL
