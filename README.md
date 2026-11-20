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

### What you need

- A Mac (Apple Silicon recommended) with the **Claude desktop app** and a plan that includes
  Claude Code. Nothing else: no GitHub account, no Terminal, no Homebrew, no admin password.
- About **1.5 GB** of free disk space.

Setup downloads whatever is missing — Node.js (nodejs.org), ffmpeg (static build from
ffmpeg.martin-riedl.de), Python (via Astral's `uv`) and Chromium (only if Google Chrome is
absent) — as private copies into `~/.cache/oleg-motion`. Tools already installed on the
machine are used instead when they are recent enough. Nothing outside that folder and
`~/.rembg` (the cut-out model) is changed.

- **Linux** works the same, except automatic text detection (Apple Vision OCR is macOS-only)
  and ffmpeg, which you install with your package manager (`apt install ffmpeg`).
- **Windows** is untested.

### Option A — ask Claude to install it (recommended)

Open the Claude desktop app, switch to **Code**, and say (any language works):

> Install the oleg-motion skill: download https://github.com/bonchuk/oleg-motion/archive/refs/heads/main.zip,
> unpack it into `~/oleg-motion`, link that folder into `~/.claude/skills/oleg-motion`,
> then run `bash ~/oleg-motion/scripts/setup.sh --ml`.

Claude asks permission for each step — allow them. The first setup takes 10–20 minutes,
mostly downloads. Then start a new session, drop an image and say "animate this".

### Option B — manual (Terminal)

```bash
curl -L -o /tmp/om.zip https://github.com/bonchuk/oleg-motion/archive/refs/heads/main.zip
mkdir -p ~/oleg-motion && tar -xf /tmp/om.zip -C ~/oleg-motion --strip-components 1
mkdir -p ~/.claude/skills && ln -s ~/oleg-motion ~/.claude/skills/oleg-motion
bash ~/oleg-motion/scripts/setup.sh --ml   # or: no flag = core only, --psd = core + PSD import
```
Developers can `git clone https://github.com/bonchuk/oleg-motion.git ~/oleg-motion` instead
of the first two lines.

`setup.sh` levels:

| command | gives you | download |
|---|---|---|
| `setup.sh` | the engine: animate any image as a whole (camera, particles, light, overlays), PNG layer folders | ~20 MB (+ Node ~50 MB, ffmpeg ~55 MB, Chromium ~150 MB — each only if missing) |
| `setup.sh --psd` | + layered PSD import | + ~110 MB (+ Python ~40 MB if missing) |
| `setup.sh --ml` | + automatic layers from a flat image (subject cut-out, text, inpainting, depth) and region cut-outs | + ~1 GB (packages + models, first run only) |

`~/oleg-motion/om doctor` shows what is installed and what is missing. Set
`OLEG_MOTION_HOME` to keep tools, the Python environment and models somewhere other than
`~/.cache/oleg-motion`.

### Update

Tell Claude "update the oleg-motion skill", or run `~/oleg-motion/om update`. It pulls with
git when the folder is a git checkout and otherwise downloads the latest archive (your own
files, such as brand kits, are kept), then re-runs setup at the installed level. Downloads
already done are reused.

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
./om py scripts/ml/auto_layers.py banner.jpg --out work/layers
./om scene --layers work/layers/layers.json --mood autumn --profile story --out work/scene.json
./om render work/scene.json --out work/out --formats mp4,webm,gif
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
