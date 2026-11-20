# Research report: a portable Claude Code skill that turns static images into looping motion banners

**Scope and caveats.** I checked every claim against the URL next to it, mostly between the official repo/PyPI/docs pages and search results. Where I could not confirm something it is marked **(unverified)**. The license column matters most, because several popular models are non-commercial. A skill that will be reused across projects should only ship permissively licensed defaults.

---

## 1. Automatic layer separation of a flat image

### 1a. Subject/background segmentation (ranked for a portable skill)

| # | Tool | License | Status / notes | Effort (mac/Linux) |
|---|---|---|---|---|
| 1 | **rembg** (as the wrapper) with **BiRefNet** models | rembg is MIT, and per-model licenses apply. It needs Python >=3.11,<3.14. Install with `pip install "rembg[cpu]"` (CPU) or `rembg[gpu]` (CUDA). It also offers `birefnet-general/-lite/-portrait/-hrsod/-massive`, `isnet-general-use`, `u2net`, `sam` and `bria-rmbg`. https://github.com/danielgatis/rembg | Runs on ONNX, so it works on CPU everywhere. Best default. | Low |
| 2 | **BiRefNet** (native PyTorch) | MIT. 2025 releases added `BiRefNet_HR` (2048²), `HR-matting` and `BiRefNet_dynamic` (256–2304px). About 17 FPS at 1024² FP16 on an RTX 4090. ONNX exports are 75–90% slower and give slightly different output. MPS is not mentioned. https://github.com/ZhengPeng7/BiRefNet | Highest-quality permissive matting | Medium |
| 3 | **transparent-background / InSPyReNet** | MIT per the repo metadata https://awesome.ecosyste.ms/projects/github.com%2Fplemeri%2Ftransparent-background | A good alternative matting model | Low |
| 4 | **SAM 2.1** for point/box prompts, to split *multiple* objects | Code and weights are Apache-2.0 https://ai.meta.com/blog/segment-anything-2/. On Apple Silicon it runs through Core ML ports https://huggingface.co/apple/coreml-sam2.1-tiny and an MLX port https://pypi.org/project/mlx-sam/0.2.0/ | Use when the scene has several objects, not one salient subject | Medium |
| 5 | **SAM 3** (text prompts such as "logo", "shoe", "person") | Released 19 Nov 2025 under the custom "SAM License": royalty-free, with conditions, and Meta can change the terms. https://github.com/facebookresearch/sam3, https://roboflow.com/model-licenses/segment-anything-3 | Strong concept segmentation. The license needs review. | Medium–High |
| ✗ | **BRIA RMBG-2.0** | **CC BY-NC 4.0.** Commercial use needs a BRIA agreement. https://huggingface.co/briaai/rmbg-2.0 | It is **rembg's default model**, so the skill must override it explicitly with `-m birefnet-general` | — |

### 1b. Text detection (to keep copy as its own layer)
- **Apple Vision via `ocrmac`** (macOS only). It needs no model download and returns text, confidence and a bounding box. Vision boxes are normalized with a bottom-left origin, so they must be converted. https://github.com/straussmaximilian/ocrmac
- **EasyOCR**: Apache-2.0, uses CRAFT for detection (DBNet optional), 80+ languages, returns bounding boxes. The last release, 1.7.2, is from Sep 2024. https://github.com/JaidedAI/EasyOCR
- **PaddleOCR 3.x / PP-OCRv5**: Apache-2.0, most accurate in multilingual tests, but a heavier Paddle runtime. https://arxiv.org/abs/2507.05595
- Practical pattern: take the OCR boxes, build a pixel mask by thresholding against local contrast inside each box, dilate it by 2–4 px, then cut text out as an RGBA layer and inpaint underneath. My recommendation is to **re-typeset** text in HTML using the OCR string whenever the font can be matched, because that gives crisp kinetic typography. Fall back to the raster text layer otherwise.

### 1c. Background inpainting after cutting objects out
1. **LaMa / big-lama through IOPaint** (formerly lama-cleaner). IOPaint is Apache-2.0 and supports cpu/cuda/**mps**. LaMa is about 200 MB, and MIGAN is a smaller option. https://github.com/Sanster/IOPaint, https://data.safetycli.com/changelogs/iopaint. LaMa generalizes to about 2k resolution despite 256² training. The upstream repo is dated (PyTorch 1.8 pins, dead Yandex links). https://github.com/advimman/lama. big-lama mirrors are tagged Apache-2.0. https://huggingface.co/smartywu/big-lama/raw/main/README.md
2. **Stable Diffusion inpainting** (diffusers or ComfyUI) is an optional heavy tier. Use it only for large holes.
3. **OpenCV `cv2.inpaint`** (Telea / Navier-Stokes) is the zero-dependency fallback. It is good for thin masks and blurs on large holes. https://learnopencv.com/image-inpainting-with-opencv-c-python/
4. **Cheapest trick, proven in a production pipeline:** where the background is visible during parallax, blur it heavily ("bokeh drift") or iterate blur-and-composite. This hides the "ghost twin" artifact that appears when the original subject is left behind the cutout. https://dev.to/dasein108/zero-to-autopilot-part-3-giving-a-still-image-real-motion-for-000-1a5b

---

## 2. Monocular depth → 2.5D parallax

### Depth models (ranked by commercial safety, then quality)
| Model | License | Notes |
|---|---|---|
| **Depth Anything V2 – Small** (24.8M) | **Apache-2.0**. Base and Large are **CC-BY-NC-4.0**. | Available in HF Transformers. The sample code picks CUDA, then MPS, then CPU. Apple publishes Core ML versions. https://github.com/DepthAnything/Depth-Anything-V2 |
| **Depth Anything 3** (released 14 Nov 2025) | `DA3-SMALL`, `DA3-BASE`, `DA3MONO-LARGE` and `DA3METRIC-LARGE` are **Apache-2.0**. Giant, Large-1.1 and Nested are **CC BY-NC 4.0**. | `DA3MONO-LARGE` is the best permissive monocular checkpoint. It needs xformers, and MPS is not documented. https://github.com/ByteDance-Seed/Depth-Anything-3 |
| **Depth Pro** (Apple) | A custom Apple license. The LICENSE page does not mention the weights. https://github.com/apple/ml-depth-pro/blob/main/LICENSE | Produces sharp boundaries and metric depth, about 0.3 s for 2.25 MP on a GPU. https://huggingface.co/apple/DepthPro-hf. DepthFlow's author judged it worse than DA2 and slow to set up. https://depth.tremeschin.com/docs/estimators/ |
| **Marigold** | Code and v1-0 weights are Apache-2.0. **v1-1 weights are CreativeML Open RAIL++-M.** https://huggingface.co/prs-eth/marigold-depth-v1-1 | A diffusion model: heavy and slow. Not worth it for banners. |
| MiDaS / ZoeDepth | — | Superseded, and ZoeDepth is unmaintained. https://depth.tremeschin.com/docs/estimators/ |

### Ready-made parallax tools
- **DepthFlow** (BrokenSource): `pip install depthflow`, v1.0.1 from Aug 2026, Python >=3.10, **AGPL-3.0**. It uses a GLSL ray-marching shader, pipes frames to FFmpeg, and advertises "artifact-free edges and seamless loops", up to 8k@50fps on an RTX 3060-class GPU. It supports DA1/DA2, while DA3 is pending. CLI example: `depthflow da2 --model small`. https://pypi.org/project/depthflow/, https://depth.tremeschin.com/docs/estimators/. This is the best quality-to-effort option. Because of the AGPL, call it as an external CLI and do not vendor its code. Whether it renders headless on a GPU-less Linux box is (unverified).
- **parallax-maker** (provos): AGPL-3.0. A web UI that combines depth (MiDaS/ZoeDepth/DINOv2), SAM point-prompt cards, SD inpainting and glTF export to Blender/Unreal. https://github.com/provos/parallax-maker. Good as a reference design, but too heavy to embed.
- **3D Photo Inpainting** (CVPR 2020, layered depth images): the README says MIT, ecosyste.ms says "other". https://replicate.com/vt-vl-lab/3d-photo-inpainting/readme. It is old (2020 stack). Use it for ideas only.

### Artifacts and mitigation
- Naive depth warping produces either **gaps or stretched content** at disocclusions. https://arxiv.org/pdf/2004.04727
- Depth edges are soft and spread over several pixels. Clean them into **step edges aligned with image edges** before warping (Kopf, Practical 3D Photography). https://johanneskopf.de/publications/photo3d_practical/Practical_3D_Photography.pdf. Use **soft visibility maps** at boundaries. https://graphics.unizar.es/papers/Serrano_IEEEVR2019_VR-6dof.pdf
- Practical recipe for the skill (my synthesis of the above):
  1. Prefer **discrete layers** (subject card + inpainted plate) over continuous mesh warping for hero objects.
  2. Keep camera displacement small, about 1–3% of the frame width, for banners.
  3. Dilate the subject mask before inpainting the plate.
  4. Edge-aware filter the depth map (guided or bilateral filter with the RGB image as guide).
  5. Use symmetric closed camera paths (sin/cos) so the loop closes and the disocclusion stays bounded.

---

## 3. Layered source inputs
- **psd-tools** (Python): MIT, v1.27.0 from 18 Nov 2026, Python >=3.11. It exports per-layer NumPy/PIL images and composites basic pixel layers, several adjustment layers and blend modes except dissolve. The `[composite]` extra adds vector shapes, gradients and layer effects. It **cannot edit or render type layers or fonts, or composite many layer effects.** https://pypi.org/project/psd-tools/. Its text-layer metadata (content, font, transform) can still drive HTML re-typesetting.
- **ag-psd** (JS): reads layers, masks, composite and linked smart objects. Text layer support is incomplete, and **effects and composites are not redrawn.** In Node it needs `node-canvas`. https://github.com/Agamnentzar/ag-psd
- **Separate PNGs / Figma exports**: accept a folder of RGBA PNGs plus an optional `layers.json` (z-order, position, role: bg / subject / text / logo / cta). HyperFrames ships an on-demand `/figma` skill. https://github.com/heygen-com/hyperframes
- **Scene description**: define one internal JSON spec. It holds the canvas size, fps and duration, and a list of layers. Each layer carries a source, a role, a depth value, anchor points, and an effect list with params and seed. Every input path (flat image, PSD, PNG folder) normalizes into this spec, and the renderer consumes only the spec. This is the main thing that keeps the skill project-agnostic.

---

## 4. Programmatic motion engines (for an agent to drive)

| Engine | License / status | Determinism | LLM authoring | Deps | Quality ceiling |
|---|---|---|---|---|---|
| **HyperFrames** (HeyGen) | **Apache-2.0**, no per-render fees. Node 22+ and FFmpeg. Ships 9 agent skills and a Claude Code plugin. Supports GSAP, CSS, Lottie, Three.js, Anime.js and WAAPI adapters. https://github.com/heygen-com/hyperframes | Seek-driven `window.__hf.seek(t)`, `HeadlessExperimental.beginFrame` on Linux (macOS uses a "less reliable fallback"), embedded fonts, bans on `Date.now()` and unseeded random. https://www.heygen.com/research/html-to-video | Built and evaluated for agents; plain HTML with `data-*` attributes | Medium (Chrome) | High (full web plus WebGL) |
| **Remotion** v4.0.5xx | Free for teams of **up to 3 people**, otherwise a paid Company License (from $25/seat/mo or $0.01/render). https://www.remotion.dev/docs/license/pricing.md. The v5 migration notes say contractors will count toward team size. https://remotion.dev/docs/5-0-migration | Frame-driven; seeded `random()`, `Math.random` triggers a lint warning. https://www.remotion.dev/docs/random. For Three.js use `--gl=angle`, or `swangle` without a GPU. https://www.remotion.dev/docs/gl-options | Excellent: official skills `/remotion-best-practices`, `/remotion-markup` etc. via `npx skills add remotion-dev/skills`. https://www.remotion.dev/docs/ai/skills | Medium–heavy | High |
| **Plain HTML + Playwright frame capture + FFmpeg** (DIY) | Everything permissive | Deterministic if every property is a pure function of `t` and you call `seek(t)` before each screenshot. timecut/timesnap patch JS timers only, **not CSS animations or video**. https://github.com/tungs/timesnap. Compositor-level options: puppeteer-capture, overcrank. https://github.com/upspawn/overcrank | Very easy, since LLMs write HTML/CSS/canvas well | Light (Playwright Chromium) | High |
| **Motion Canvas** | MIT, v3.x, about 20k stars. **No server-side render API.** https://github.com/motion-canvas/motion-canvas, https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026 | Deterministic | Generator API; fewer training examples | Medium | Medium (own scene graph, no CSS) |
| **Revideo** | MIT, but last push Feb 2025 and npm 0.10.4, so likely stale. https://awesome.ecosyste.ms/projects/github.com%2Fredotvideo%2Frevideo | Deterministic | As Motion Canvas | Medium | Medium |
| **Theatre.js** | Core is Apache, **studio is AGPL**. Development "temporarily moved to a private repo". https://github.com/theatre-js/theatre | — | — | — | Avoid |
| **GSAP** | Fully free including SplitText and MorphSVG since 30 Apr 2025, with a carve-out for "competitive" visual no-code animation builders. https://gsap.com/community/standard-license/ | Deterministic when the timeline is paused and seeked | Very good; official gsap-skills exist | Light | Text/mask animation inside the HTML route |
| **Lottie** | python-lottie generates JSON and can render it. https://pypi.org/project/lottie/0.6.6. puppeteer-lottie renders to MP4 via ffmpeg. https://npmjs.com/package/puppeteer-lottie. LottieFiles now standardizes on ThorVG / dotLottie runtimes. https://lottiefiles.com/runtimes | Deterministic | Verbose JSON that is hard for LLMs to hand-write | Light | Vector only; poor for raster effects. Useful as an **extra export** for web banners. |
| **FFmpeg filtergraphs** | LGPL/GPL | Deterministic | Strings; error-prone at scale | Minimal | Medium. `zoompan` shakes (trac #4298, open about 10 years) https://trac.ffmpeg.org/ticket/4298. `displace` is 8-bit only and `geq` is slow. https://ffmpeg.org/pipermail/ffmpeg-user/2020-February/046673.html. A real pipeline had `drawtext` fail because libfreetype was missing. https://dev.to/dasein108/zero-to-autopilot-part-3-giving-a-still-image-real-motion-for-000-1a5b |
| **MoviePy 2.x** | MIT, 2.1.x. v2 broke the v1 API (`moviepy.editor` removed, effects became classes), and LLMs often write v1 code. Slower than raw ffmpeg. https://zulko.github.io/moviepy/getting_started/updating_to_v2.html | Deterministic | Medium | Light | Medium |
| **Blender bpy** | GPL. `pip install bpy` wheels exist for macOS, Windows and Ubuntu, and the version must match your Python. Headless EEVEE is documented for Linux only. https://pypi.org/p/bpy, https://julianeisel.github.io/wiki.blender.org-dump/wiki/Building_Blender/Other/BlenderAsPyModule.html | Deterministic | Medium | Very heavy | Highest (true 3D, DoF) |
| **Manim CE** | MIT, v0.19. Built for math; the ManiBench study documents LLM version and API hallucinations. https://arxiv.org/abs/2603.13251 | Deterministic | Poor here | Medium | Wrong domain |
| **Pillow + numpy → ffmpeg** | Permissive | Deterministic | Easy | Minimal | Low–medium (no GPU effects). This is the approach of Anthropic's `slack-gif-creator`. |

**Verdict:** the HTML/WebGL scene + headless-Chromium seek capture + FFmpeg pattern wins on LLM authoring ease and quality ceiling. Both HyperFrames and Remotion are built on it.

---

## 5. Effect building blocks (procedural implementations)

Ready shader library: **pixi-filters** (MIT, v6 for PixiJS v8). It includes AdvancedBloom, Bloom, Glow, Godray, RGBSplit (chromatic aberration), OldFilm (grain, scratches, vignette), Shockwave, Displacement, SimplexNoise, ZoomBlur, MotionBlur, TiltShift, Reflection (water), BulgePinch, Twist, CRT and Glitch. https://github.com/pixijs/filters. The Pixi ticker must be driven manually from `t`.

| Effect | Procedural method |
|---|---|
| Shine/glint sweep | A skewed linear-gradient band, alpha-masked to the subject or logo layer (CSS `mask-image` or a shader), with `mix-blend-mode: screen/overlay`. Sweep x is eased in t, with a pause between sweeps. |
| Star glints / lens flare | Additive sprites: a cross of streaks plus ghost discs placed along the line from the light position through the screen centre. Scale and alpha twinkle with `sin`. Godray filter for shafts. |
| Particles (dust, sparks, confetti, snow, leaves) | **Write a seeded particle system** where position = f(seed, t), wrapped modulo the loop length so it loops. Off-the-shelf libraries step their own timers, which breaks seek-based determinism. Pick per-particle depth z, then derive size, speed, blur (DoF bokeh) and parallax from z. The slack-gif-creator "explode" primitive shows the idea. https://raw.githubusercontent.com/anthropics/skills/main/skills/slack-gif-creator/SKILL.md |
| Light leaks / bokeh | Large blurred radial gradients in warm colours, drifting on a closed path, screen blend at 10–30% opacity. Bokeh = blurred discs on the far-depth layer. |
| Glow/bloom | Threshold, blur, add (pixi Bloom/AdvancedBloom, or three.js UnrealBloomPass). |
| Chromatic aberration | Per-channel UV offset that grows with radius (RGBSplit). In ffmpeg: `rgbashift`. https://dev.to/dasein108/zero-to-autopilot-part-3-giving-a-still-image-real-motion-for-000-1a5b |
| Film grain | Per-frame noise seeded by the frame index (ffmpeg `noise=allf=t`, or a shader hash(uv, frame)). |
| Camera shake | Sum of 2–3 incommensurate sines or loopable noise. Keep amplitude subpixel to a few px for ads. |
| Ken Burns / parallax | Transform in the browser (subpixel and smooth). Avoid ffmpeg `zoompan` (jitter, ticket #4298). Per-layer offset = camera × (1 − depth). |
| 3D text tilt / breathing | CSS `perspective` + `rotateX/Y` with small sin amplitudes and a scale of 1±0.01. |
| Kinetic typography / mask reveals | GSAP SplitText (free) or plain per-char spans; `clip-path` / `mask-image` wipes. |
| Liquid / warp | Noise-based UV distortion in a fragment shader (Displacement or SimplexNoise filter), or ffmpeg `displace` + `geq` (slow, 8-bit). |
| Flag/cloth wave | UV offset `y += A·sin(kx − ωt)·falloff(x)`, plus shading from the derivative. |
| Puppet / mesh warp | ARAP: Meta AnimatedDrawings ships a reusable Python ARAP implementation (MIT code). https://ai.meta.com/blog/using-ai-to-bring-childrens-drawings-to-life/. Inochi2D (BSD-2) is a Live2D-style rig format. https://flathub.org/et/apps/com.inochi2d.inochi-session |
| Cinemagraph (water/sky) | Procedural "region loop": scroll or warp a texture inside a mask with a crossfade between two phase-offset copies so it loops. ML methods such as Holynski's Eulerian motion fields have no confirmed runnable code. https://eulerian.cs.washington.edu/animating_pictures_2020.pdf |
| Seamless looping | Make every animated property periodic with period = duration (or a divisor of it). For noise, sample along a circle in extra dimensions: `noise4(x, y, cos 2πt·r, sin 2πt·r)`. https://www.cs.otago.ac.nz/graphics/Geoff/NoisePages/Loops.html. Python lib: opensimplex-loops. https://awesome.ecosyste.ms/projects/github.com%2Fdennis-van-gils%2Fopensimplex-loops. Verify by diffing frame 0 against frame N. |

---

## 6. Existing repos and skills to borrow from
- **Remotion official skills** (13 skills, including best-practices, markup and render). https://www.remotion.dev/docs/ai/skills
- **HyperFrames skills / plugin** (`npx skills add heygen-com/hyperframes`, `/hyperframes`, `/figma`, `/reverse-any-video`). https://github.com/heygen-com/hyperframes. The repo page showed about 87k stars, which looks high (unverified).
- **anthropics/skills**: `slack-gif-creator` (Pillow + imageio, easing library, shake/pulse/bounce/explode primitives, validators), plus `algorithmic-art` and `canvas-design`. https://github.com/anthropics/skills/tree/main/skills
- **risukisu/marketing-skills → `cinemagraph`**: the closest existing analog. It is procedural, not generative. It builds HTML whose properties are pure functions of a phase, captures frames with Playwright, and outputs animated WebP or SVG. Its techniques are overlay, region loop and redraw. It installs packages at runtime and lists no license. https://www.skillsdirectory.com/skills/risukisu-cinemagraph, https://github.com/risukisu/marketing-skills
- **claude-code-video-toolkit** (MIT): Remotion and MoviePy skills. Its image-to-video step uses paid LTX-2 on Modal, so it is out of scope. https://github.com/digitalsamba/claude-code-video-toolkit
- **bluzir/claude-code-design `animated-video`** (HTML or Remotion motion explainers). https://skillselion.com/skills/bluzir/claude-code-design/animated-video
- **DepthFlow** and **parallax-maker**, both AGPL (see §2).
- **"Zero to autopilot" write-up**: a real rembg + ffmpeg parallax pipeline with documented failures (ghost twin, missing libfreetype, NaN in Wan on MPS, unreliable LLM-written Manim). https://dev.to/dasein108/zero-to-autopilot-part-3-giving-a-still-image-real-motion-for-000-1a5b

---

## 7. Recommended architecture for a portable skill

**Standardize on:** Python for analysis, HTML/WebGL for the scene, headless Chromium for capture, and FFmpeg for encoding.

1. **Ingest → `scene.json`.** Normalize three input types into one spec:
   - Flat image: segment, OCR, inpaint, depth.
   - PSD: psd-tools layers plus type-layer metadata.
   - PNG folder: optional `layers.json`.
2. **Plan.** Claude picks an effect recipe per layer role from a curated library: hero subject, background plate, text/CTA, logo, ambient overlays. Use fixed presets ("premium shine", "festive particles", "calm parallax", "cinemagraph sky") with bounded parameters, and do not let the model free-write effects. The dev.to pipeline found that capping effect overuse matters.
3. **Render.** Generate a single self-contained `scene.html`. It loads layers as images, applies effects through CSS, Canvas2D, or a small vendored WebGL/pixi-filters bundle, and exposes `seek(t)`. Every value must be a function of `t` and a seed: no `Date.now`, no unseeded random, no network, and fonts embedded. Capture with Playwright (`seek` then `screenshot`) and pipe frames to FFmpeg.
   - Optional engine adapters: HyperFrames (Apache-2.0) is the preferred adapter. Remotion is available when the user's team is licensed or already uses it.
4. **Encode.** One pass produces MP4 (H.264, `yuv420p`, `+faststart`), WebM/VP9, and GIF/APNG/animated WebP via palettegen. Add a loop-seam check (frame 0 vs N SSIM) and a duration/size budget for ad specs.

**Dependency tiers**
- **Core (required, no GPU):** Python 3.11+, Pillow, numpy, opencv-python-headless, Node 22, Playwright Chromium, ffmpeg. On macOS: `brew install ffmpeg node`. On Linux the distro ffmpeg may lack libfreetype, which is fine because text is rendered in the browser.
- **Optional ML, all permissive:**
  - `rembg[cpu]` with `birefnet-general` or `isnet-general-use`. Never the default `bria-rmbg`.
  - Depth Anything V2-Small via transformers, or DA3 `MONO-LARGE`/`SMALL`.
  - IOPaint/LaMa with `--device mps|cuda|cpu`.
  - OCR: `ocrmac` on macOS, EasyOCR elsewhere.
  - SAM 2.1-tiny for multi-object scenes.
  - Install into an isolated venv on first use and cache weights.
- **Optional heavy:** DepthFlow CLI (AGPL, external process) for full-image 3D camera moves. bpy/Blender for true 3D. SD inpainting for large holes.
- **Gate non-commercial models** behind an explicit opt-in flag: RMBG-2.0, DA2 Base/Large, DA3 Large/Giant/Nested, Marigold v1-1, and SAM 3 after license review.

**Fallback ladder when ML is unavailable**
1. No segmentation: treat the image as one plate. Use Ken Burns plus overlay effects (shine, particles, light leak, grain, vignette). This always works.
2. User-supplied masks or PSD layers: skip the ML steps entirely.
3. Segmentation but no inpainting: use OpenCV Telea, or blur the plate into bokeh so it hides the gap.
4. No depth model: use a heuristic depth (vertical gradient or saliency radial) or per-layer manual depth values.
5. No OCR: leave text inside the plate and animate it only with global effects, or ask the user for text boxes.
6. No GPU WebGL in headless Chrome: use Canvas2D/CSS effects, or Chrome's SwiftShader/`swangle` software GL, which is slower. https://www.remotion.dev/docs/gl-options

**Rules the SKILL.md should state:**
- Keep the source text and logo pixels sharp, and never warp brand marks.
- Limit motion amplitude.
- Make every motion periodic over the loop length.
- Run a render-and-inspect loop: extract a few frames as PNGs and have Claude look at them before the final encode.
