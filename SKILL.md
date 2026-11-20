---
name: oleg-motion
description: Turn static images into polished motion — looping banners, animated ads, stories, cinemagraph-style clips (MP4/WebM/GIF). Works from a flat JPG/PNG (auto-splits it into background, subject and text layers with depth), a layered PSD, or a folder of PNG layers, and adds parallax/2.5D camera moves, particles (snow, leaves, dust, confetti, bokeh), light (shine sweeps, star glints, flares, glow) and text/product motion while keeping prices, logos and legal text crisp. Use this skill whenever someone wants to animate, "оживити", bring to life, add motion or effects to a picture, banner, poster, product shot or PSD; asks for a looping video banner, animated GIF, motion ad, story/reel from an image, parallax or cinemagraph; or shows an animated banner and wants "something like this" — even if they never say "animation".
---

# oleg-motion

Deterministic motion design from still images: an HTML scene rendered frame by frame in
headless Chrome, encoded with ffmpeg. Everything is a pure function of time, so loops close
exactly and renders are reproducible. Talk to the user in their language; keep file names
and scene JSON in English.

`$OM` below means the directory of this skill (the folder containing this SKILL.md).

## 0. Make sure it runs (once per machine)

```bash
node $OM/engine/cli.mjs doctor          # what is installed
$OM/scripts/setup.sh                    # core: Playwright engine (needs node ≥20 + ffmpeg)
$OM/scripts/setup.sh --psd              # + PSD import
$OM/scripts/setup.sh --ml               # + auto-layers for flat images (~1 GB incl. models)
```
Core alone can already animate any image (camera, particles, light, overlays). Ask before
running `--ml` — it downloads models. The venv lives in `~/.cache/oleg-motion/venv`
(override with `OLEG_MOTION_HOME`); call its python as `~/.cache/oleg-motion/venv/bin/python`.

## 1. Brief — look first, then ask with clickable options

People drop a file and say "make it move". Most can't describe motion in words, so don't
ask open questions — **look at the image yourself first** (open it), list its elements
(headline, price, button, logo, photos, product, arrows…), then ask.

**Brand kit first.** If the request names a brand/project, or a `*.brand.json` /
`oleg-motion.brand.json` sits in the working folder, or `$OM/brands/` has a matching kit,
load it and pass `--brand` to `scene`: its defaults answer most questions (skip those) and
its `protect` / `avoid` / `notes` are hard rules. Format: references/brand-kit.md. No kit yet →
offer to save one at delivery (step 6).

**Never ask about craft** — timings, easing, amplitudes, staggers, particle counts are
professional defaults (references/motion-guidelines.md). Change them only when the person
asks. Every question offers a default they can just accept.

**Skip the questions** when the user says "просто зроби" / "just do it" / "on your own",
or answers are already in the request: pick defaults and state them in one line.

**Otherwise ask once, with options** — use the `AskUserQuestion` tool when available
(clickable cards; otherwise one message with numbered options). Up to 4 questions, each
with your recommended option first, built from what you saw in the image:

1. **Where will it live?** → profile: **"як є — не змінювати пропорції"** (`source`: the
   original aspect ratio, long side capped at 1920 px), Instagram post 4:5
   (`feed-portrait`), Stories/Reels 9:16 (`story`), website banner (`web-hero` /
   `web-strip`), display ad GIF (`display-*`). Fit the 4 options to the image: if its ratio
   already matches a format (e.g. 4:5 → Instagram post), offer that format instead of a
   separate "як є" (same result) and recommend it; otherwise recommend "як є" first.
   A format with another ratio crops the image (`fit: cover`) or adds blurred margins
   (`contain-blur`) — say which, and what it cuts off (headline edges, the CTA), so the
   person isn't surprised.
2. **Character?** → 3–4 moods that fit the picture, described by feeling, not by name:
   "calm & premium", "energetic", "festive", "barely moving". Mention the matching mood
   in the description (`premium`, `energetic`, `festive`, `calm` …; full list: `cli.mjs moods`).
3. **Structure?** → "elements appear, then loop" (`intro-loop`, good for social posts),
   "seamless loop only" (`loop`, good for site banners), "one pass with an ending" (`oneshot`).
4. **What is the hero?** (multiSelect) → the 3–4 most prominent elements you found, e.g.
   "headline SUMMER SALE", "CTA button", "photos", "product". The hero gets the main motion;
   everything else stays calm.

Defaults if unanswered: profile from aspect ratio, 6 s (intro 2 s + loop 4 s for
intro-loop), MP4, mood chosen from the palette and subject. A reference video ("like this")
beats any answer — break it down with references/reference-analysis.md and copy its
rhythm, not its content.

## 2. Motion plan — agree in words before rendering

Before the first render, show the plan in plain language (user's language), one line per
element, with timing — e.g.:

> **Інтро (2 с):** логотип з'являється → заголовок піднімається рядками → «-30%»
> вискакує → кнопка й товар з'являються знизу.
> **Петля (4 с):** «-30%» ледь світиться, по ньому пробігає блиск · кнопка пульсує ·
> товар ледь плаває · теплий пил на фоні.
> **Не рухається:** логотип (лише іскра), ціна після появи, дати.

Ask "Так робимо, чи щось змінити?" in the same message and proceed only after a yes (or
when the user skipped questions — then render straight away and show the plan with the
result). Changing the plan costs seconds; changing a render costs minutes. The plan also decides
which elements need their own layer in the next step.

## 3. Get layers

Pick by input — the goal is a `layers.json` with roles (see references/scene-format.md):

| input | command |
|---|---|
| flat JPG/PNG, ML installed | `~/.cache/oleg-motion/venv/bin/python $OM/scripts/ml/auto_layers.py in.jpg --out work/layers` |
| PSD | `~/.cache/oleg-motion/venv/bin/python $OM/scripts/psd_layers.py in.psd --out work/layers` |
| folder of PNG layers | `node $OM/engine/cli.mjs layers-from-dir path/to/pngs` |
| designed creative (cards, buttons, arrows, photos with heads over the frame) or auto-layers got it wrong | write `regions.json` (boxes/polygons + mask mode) → `~/.cache/oleg-motion/venv/bin/python $OM/scripts/ml/cut_regions.py regions.json --out work/layers` (format in the script's docstring) |
| flat image, no ML | write layers.json by hand: one `background` layer (and ask for text boxes if particles must avoid text) |

For `regions.json`, find coordinates by measuring, not by eye: threshold bright/dark pixels
and print component bounding boxes; for photo cards scan for the frame's colour and fit the
edges (a polygon 3–5 px inside the real edge leaves a bright line in the background and
clips the card). Use `mask: "contrast"` for text/logos/lines on a plain background, `"full"`
+ `popout` for photo cards with a head sticking out, `"seg"` for objects on busy photos.

**Always open `preview.png` / the layer PNGs and check the split** before building the scene:
auto-layers can mislabel (a logo detected as text, a price as headline, a subject that is
really background). Fix roles in layers.json — roles decide what may move. If the subject
cut-out is poor, drop that layer rather than animating a ragged edge.

## 4. Build the scene

```bash
node $OM/engine/cli.mjs scene --layers work/layers/layers.json --mood energetic \
     --profile feed-portrait --structure intro-loop [--brand brand.json] \
     [--intensity 1] [--speed 1] [--density 1] --out work/scene.json
```
This drafts `scene.json` from the mood bundle (and brand kit). Then edit it to match the
agreed plan — that is where the craft is: per-layer intro timings staggered 50–100 ms
(whole cascade ≤ 2 s, entrances 400–800 ms, ease-out; bounce only on one playful element),
the hero's light/glow, decor motion (arrows bounce, badges spin), particles in one accent
colour from the image or brand kit. Read references/effects.md for every effect and its parameters, and
references/motion-guidelines.md for limits that keep it professional.

## 5. Render, look, iterate

```bash
node $OM/engine/cli.mjs render work/scene.json --out work/out --quality draft     # fast check
node $OM/engine/cli.mjs render work/scene.json --out work/out --formats mp4,webm,gif  # final
```
After every render **look at `*-sheet.jpg`** (8 frames) and, when something is in doubt,
extract single frames (`ffmpeg -ss 2.5 -i out.mp4 -frames:v 1 f.png`) and view them. The
report (`*-report.json`, summarised in stderr) checks: loop seam, flashes (≤3/s), locked
layers not moving, safe zones (text/price/CTA ≥ 10 % from edges, logos ≥ 5 %; `cut` = a
format change cropped it, `as-designed` = the source was already that tight), file budget.

Fix failures before delivering — a visible seam usually
means a non-integer `cycles`; a budget failure means fewer particles/grain, or lower GIF
size/fps.

Show the user the draft (contact sheet or the MP4) and invite tweaks in their own words —
"повільніше", "менше блиску", "без частинок", "кнопку яскравіше", "прибери інтро".
references/tweaks.md maps such phrases to scene edits; apply them, re-render as draft,
and render the final only when they are happy.

Cost on a laptop (M1, 8 GB): auto-layers ≈ 3–4 min per image (run it once, then iterate on
the scene); render ≈ 0.2–0.4 s per frame (6 s at 30 fps ≈ 1 min). Tell the user before
long steps.

## 6. Deliver

Give the user: the files (paths + sizes), the poster JPG, one sentence on what moves, and
for websites the embed hint `<video autoplay muted loop playsinline poster="…">`. If the
target platform has hard limits (exact size, codec, max MB), say they were met — or not.
If this was a brand's job and no kit exists yet, offer in one line to save one
(references/brand-kit.md) so next time the questions are already answered.

## Rules that keep it good (and why)

- **One hero motion, ≤ two ambient ones.** Viewers read one thing at a time; extra motion
  competes with the message.
- **Prices, legal text and logos stay rigid.** Movement blurs and wobbles letterforms —
  readability and brand trust beat flair. Roles enforce this; don't reassign a price to
  `text` to get motion on it.
- **Don't fake a person's movement.** A cut-out person can't run or wave; bobbing or
  pulsing the whole figure looks like a cardboard puppet. Give people depth (camera
  parallax) and an intro, nothing more.
- **Small amplitudes.** 3–6 % camera push, 2–4° tilt, ≤ 2 % breathe. Large zooms and
  parallax cause motion sickness and look amateur.
- **Whole cycles only.** The loop is seamless because every motion completes an integer
  number of cycles per loop — never set fractional `cycles`.
- **First frame = finished poster.** In `loop` the first frame already has everything in
  place; use `intro-loop` when entrances are wanted.
- **No generative redraw of text.** This skill never repaints text or products; AI video
  (optional, see references/ai-video.md) is only for backgrounds, with the original layers
  composited back on top.

## Troubleshooting
- `Playwright is not installed` → `$OM/scripts/setup.sh`.
- Blank or black frames → a layer path is wrong (check stderr warnings) or the scene has
  no background layer.
- Text detection skipped → `ocrmac` is macOS-only; elsewhere pass text layers manually.
- Edge halos in parallax → lower `depthParallax.amp`, or inpaint the plate (auto-layers
  does it unless `--no-inpaint`).
- GIF too big → `display-*` profiles shrink it automatically; otherwise lower fps/width.
