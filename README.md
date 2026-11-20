# oleg-motion

A Claude Code skill (and standalone CLI) that turns still images into motion: seamless
looping banners, intro + loop ads, stories and short one-shots in MP4 / WebM / GIF.

- **Inputs**: a flat JPG/PNG (auto-split into background, subject, text and depth), a
  layered PSD, or a folder of PNG layers.
- **Effects**: 2.5D/parallax camera, depth displacement, particles (snow, leaves, dust,
  sparks, confetti, bokeh, petals, hearts, bubbles, custom sprites), light (shine sweeps,
  star glints, lens flares, glow, rays, light leaks), text/product motion (tilt, breathe,
  float, sway), intros (fade, rise, slide, pop, wipe), fog, grain, vignette, water waves.
- **Moods**: one command drafts a full scene — calm, premium, festive, autumn, spring,
  summer, hot-sale, energetic, launch, love, night, nature.
- **Brief in clicks**: the agent looks at the image, asks up to 4 multiple-choice questions
  (where, character, structure, hero element), agrees a plain-language motion plan before
  rendering, and takes tweaks in everyday words ("slower", "less shine", "no intro").
- **Brand kits**: a small JSON per brand (palette, defaults, what never moves, what to avoid).
- **Checks**: loop seam, flashes (WCAG 2.3.1), prices/legal text not moving, file budgets,
  plus a contact sheet for a quick visual review.
- **Engine**: an HTML scene rendered frame-by-frame in headless Chrome (Playwright) and
  encoded with ffmpeg. Deterministic — the same scene always renders the same frames.

## Installation

oleg-motion runs inside **Claude Code** — the terminal CLI, the IDE extensions, or the Code
mode of the Claude desktop app. It does not work in regular claude.ai chats: rendering needs
a local browser, ffmpeg and (optionally) local ML models.

### Requirements

| | needed for | how to get it (macOS) |
|---|---|---|
| Node.js ≥ 20 | everything | `brew install node` |
| ffmpeg | encoding MP4 / WebM / GIF | `brew install ffmpeg` |
| Google Chrome | rendering (if missing, Playwright downloads its own Chromium) | chrome.com |
| Python 3.11–3.13 | PSD import, auto-layers, region cut-outs | `brew install python` |
| ~1.2 GB disk | ML extras: Python packages + models in `~/.cache/oleg-motion` (and the cut-out model in `~/.rembg`) | installed by `setup.sh --ml` |

- **macOS** (Apple Silicon recommended) is fully supported.
- **Linux** works the same, except automatic text detection (Apple Vision OCR is macOS-only):
  there, mark text with regions or use PSD/PNG layers. Install deps with your package manager
  (`apt install nodejs ffmpeg python3-venv`).
- **Windows** is untested.
- Homebrew itself (`brew.sh`) asks for the computer's password once — run that yourself;
  Claude cannot type passwords.

### Option A — ask Claude to install it

Open Claude Code and say (any language works):

> Install the oleg-motion skill from https://github.com/bonchuk/oleg-motion: clone it to
> `~/oleg-motion`, link it into `~/.claude/skills/oleg-motion`, run `scripts/setup.sh --ml`
> and check everything with the `doctor` command.

Claude will ask permission for each command. When it is done, start a new Claude Code
session so the skill is picked up, then just drop an image and say "animate this".

### Option B — manual

```bash
git clone https://github.com/bonchuk/oleg-motion.git ~/oleg-motion
~/oleg-motion/scripts/setup.sh --ml       # or: no flag = core only, --psd = core + PSD import
mkdir -p ~/.claude/skills && ln -s ~/oleg-motion ~/.claude/skills/oleg-motion
node ~/oleg-motion/engine/cli.mjs doctor  # shows what is installed and what is missing
```

`setup.sh` levels:

| command | gives you | download |
|---|---|---|
| `setup.sh` | the engine: animate any image as a whole (camera, particles, light, overlays), PNG layer folders | ~20 MB (+ ~150 MB Chromium only if Chrome is absent) |
| `setup.sh --psd` | + layered PSD import | + ~110 MB |
| `setup.sh --ml` | + automatic layers from a flat image (subject cut-out, text, inpainting, depth) and region cut-outs | + ~1 GB (packages + models, first run only) |

Set `OLEG_MOTION_HOME` to keep the Python environment and models somewhere other than
`~/.cache/oleg-motion`.

### Update

```bash
git -C ~/oleg-motion pull && ~/oleg-motion/scripts/setup.sh --ml
```
(or tell Claude "update the oleg-motion skill"). Re-running `setup.sh` is safe: installed
packages and downloaded models are reused.

### Uninstall

```bash
rm ~/.claude/skills/oleg-motion
rm -rf ~/oleg-motion ~/.cache/oleg-motion ~/.rembg/models/birefnet-general-lite
```

### Brand kits

Teams can keep their brand rules (palette, default format, what must never move) in a
JSON kit — in `brands/` of this repo or next to their own files. See
`references/brand-kit.md`.

## CLI in 3 commands

```bash
~/.cache/oleg-motion/venv/bin/python scripts/ml/auto_layers.py banner.jpg --out work/layers
node engine/cli.mjs scene --layers work/layers/layers.json --mood autumn --profile story --out work/scene.json
node engine/cli.mjs render work/scene.json --out work/out --formats mp4,webm,gif
```

See `SKILL.md` for the agent workflow, `references/` for the effect catalogue and scene
format, and `docs/research/` for the research behind the defaults.

## Models and licences

Only permissively licensed models are used by default: BiRefNet (MIT, via rembg),
LaMa (Apache-2.0, ONNX), Depth Anything V2 **Small** (Apache-2.0, ONNX), Apple Vision
OCR (macOS system framework). Non-commercial checkpoints (BRIA RMBG-2.0, Depth Anything
Base/Large) are intentionally not used.

## License

MIT — see `LICENSE`. Models downloaded at setup keep their own licences (listed above).
