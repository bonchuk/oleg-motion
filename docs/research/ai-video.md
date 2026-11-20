# AI image-to-video for animating marketing images (state as of Nov 2026)

**Main finding:** a lot has changed since 2025. The Sora 2 API is gone. The Veo 3.1 preview models are gone from the Gemini Developer API. Wan 3 has no open weights. The current flagships are Kling 4.0, Luma Ray 3.2, Seedance 2.x/2.5, Runway Gen-4.5, MiniMax H3 and Gemini Omni Flash. No model reliably keeps exact text, logos or prices, and none outputs 6.5:1 or native 2:3. A skill should use AI only for the background or atmosphere and put the original pixels back on top.

## 1. Comparison table

Prices are per output second at 720p unless noted. "Unverified" means it comes only from third-party resellers.

| Model | Access | Price/s | Max res / duration | Aspect ratios | Loop / keyframes | Regional control | License |
|---|---|---|---|---|---|---|---|
| **Veo 3.1** (std/fast/lite) | Vertex / Gemini Enterprise GA `veo-3.1-*-001`; Gemini API previews shut down 22 Oct 2026 | Runway API: $0.40 with audio, $0.20 without; Fast $0.15/$0.10 | 720p/1080p (4K only on preview); 4, 6 or 8 s | 16:9, 9:16 | First+last frame | none | Google API terms; ownership wording in current terms not confirmed |
| **Gemini Omni Flash 1.2** | Gemini API (Interactions), fal, Runway | fal: $0.082 at 720p, $0.123 at 1080p, $0.246 at 4K | up to 4K (upscaled); 3–15 s (≤10 s with end frame) | 16:9, 9:16 | First+last; multi-turn edit | none (no masking documented) | SynthID watermark on all outputs |
| **Runway Gen-4 Turbo / Gen-4.5 / Aleph 2** | Runway API ($0.01/credit) | Gen-4 Turbo $0.05; Gen-4.5 $0.12; Aleph 2 $0.28 (video-to-video) | 1280:720, 720:1280, 1104:832, 832:1104, 960:960, 1584:672 (Gen-4 Turbo, unverified list) | widest ≈2.36:1 | Gen-4.5 tested as **first-frame only** | none via API | Runway claims no ownership and allows commercial use (§4.4) |
| **Kling 2.5 Turbo / 3.0 / 4.0** | Official API (prepaid packs), Runway, fal | Runway: 2.5 Turbo Pro $0.12; 3.0 std $0.09 / pro $0.12 without audio; 4.0 720p $0.157 list | Kling 4: up to 4K, 3–30 s | 21:9, 16:9, 1:1, 9:16, Auto (Kling 4) | Kling 4: up to 10 keyframes. v3.0 honors last frame; v2.6 found first-frame only | **Motion brush** (`static_mask`, `dynamic_masks`), documented on v1 endpoints; cannot be combined with tail image or camera control | Paid plans allow commercial use; free plan is non-commercial |
| **Luma Ray 3.2 / Ray 2** | Luma API | 720p 5 s = 100 credits (credit→$ rate not clear); HDR costs 2× | up to 1080p; 5 or 10 s | 6 ratios incl. 21:9 (via reframe) | **Native `loop: true`** (cannot combine with end image); up to 16 keyframes | **Reframe** outpaints a video to a new ratio | Not verified |
| **Seedance 2.0 / 2.5** (ByteDance) | BytePlus, fal, Runway | fal 2.0: $0.30 at 720p; Runway 2.5: $0.30 at 720p, $0.68 at 1080p | up to 4K; 4–15 s | auto, **21:9**, 16:9, 4:3, 1:1, 3:4, 9:16 | `end_image_url` | none | BytePlus terms not verified; watermark is optional |
| **MiniMax Hailuo 3 / H3** | MiniMax API, Runway | Runway: hailuo3 $0.10 at 768p, $0.15 at 2K | 768p–2K | not verified | First+last (fl2v) on H3 | none | not verified |
| **Pika 2.2 / Pikaframes** | via fal (official partner) | about $0.04–0.09 (unverified) | 720p/1080p, 5 s | not verified | Pikaframes: up to 5 keyframes | none | fal marks it commercial |
| **Sora 2** | **API shut down 24 Sep 2026** | (was $0.10; Pro $0.30–0.70) | — | — | — | — | — |
| **Adobe Firefly Video** | Enterprise API only; image-to-video via API not confirmed | negotiated | — | — | First keyframe (web app) | — | Native model covered by IP indemnity; partner models are excluded |
| **Wan 2.2 A14B / TI2V-5B** (open) | Local, fal, Replicate | fal: $0.08 at 720p | 480p/720p, about 5 s at 16 fps | follows input image | **FLF2V** (first+last frame), native in ComfyUI | **VACE** masked inpainting (Wan 2.1/2.2-Fun) | **Apache 2.0**; authors claim no rights over outputs |
| **LTX-2 / 2.3** (open) | Local, ComfyUI | — | dimensions must be multiples of 32 | — | frame-indexed image conditioning | — | LTX-2 Community License; free under about $10M revenue |
| **HunyuanVideo 1.5** (open) | Local | — | about 14 GB VRAM with offload | — | — | — | Tencent license **excludes EU, UK, South Korea** |
| **FramePack** (open) | Local; Mac fork exists | — | long clips | — | — | — | license not verified |
| **Wan 3.0** | API only (`wan3`: $0.10 at 720p on Runway) | — | — | — | first-frame only in test | — | no open weights as of late Oct 2026 |

Not covered: CogVideoX, Stable Video Diffusion, AnimateDiff and Mochi. I did not research them this cycle. They are older and generally weaker than Wan 2.2 and LTX-2.

**Text fidelity:** every model above is poor at keeping text. Kling 4 claims "text remains clear and stable during camera movements", but that is a vendor claim with no independent tests.

## 2. Key facts behind the table

- **Veo / Gemini:** The Gemini Developer API shut down the Veo 3.1 preview IDs on 22 Oct 2026 and points users to `gemini-omni-1.2-flash`. GA Veo 3.1 stays on Vertex / Gemini Enterprise with 16:9/9:16, 4/6/8 s and first+last frame. Sources: https://aistudio.google.com/docs/video, https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-first-and-last-frames
- **Omni Flash:** specs (3–15 s, 16:9/9:16, interpolation 3–10 s, SynthID, REST `POST .../v1beta/interactions`) are at https://aistudio.google.com/docs/omni.md.txt. fal prices and the call example are at https://fal.ai/models/google/gemini-omni-flash/v1.2/image-to-video/llms.txt
- **Runway:** one price table covers Runway's own models and resold ones (Veo, Kling, Seedance, Hailuo, Wan 3, Aleph 2): https://docs.dev.runwayml.com/guides/pricing/. Output rights: https://runway.com/terms-of-use. The Gen-4 Turbo ratio list comes from ComfyUI node code and is unverified: https://huggingface.co/spaces/iAkashPaul/fflf/blob/bff82404641e54e27b80a3014c0075e7c2aec1c6/comfy_api_nodes/nodes_runway.py
- **Kling 4.0** specs (21:9, 3–30 s, up to 10 keyframes, ratio follows the first keyframe): https://kling.ai/quickstart/kling-4-model-user-guide. Plan licensing and API links: https://kling.ai/llms.txt. Motion brush parameters: https://fal.ai/models/fal-ai/kling-video/v1/standard/image-to-video/llms.txt ($0.045/s on v1). The rule that masks cannot be combined with the tail image or camera control comes only from third-party mirrors such as https://apidoc.cometapi.com/api/video/kling/image-to-video
- **Luma:** Ray 3.2 pricing and keyframes: https://lumalabs.ai/api/pricing. `loop` and `frame0`/`frame1`: https://docs.lumalabs.ai/docs/video-generation. Reframe (ratios, ≤10 s source, `source_position`; loop and keyframes not allowed): https://docs.agents.lumalabs.ai/guides/videos/reframing
- **Sora 2 shutdown:** https://developers.openai.com/api/docs/models/sora-2.md
- **Seedance on fal:** https://fal.ai/models/bytedance/seedance-2.0/enterprise/v2/image-to-video/llms.txt
- **MiniMax H3 fl2v:** https://platform.minimax.io/docs/pricing/overview
- **Pika via fal:** https://blog.fal.ai/pika-api-is-now-powered-by-fal
- **Firefly:** indemnity and partner-model exclusion at https://helpx.adobe.com/legal/product-descriptions/partner-model.html. The API's video support is uncertain: https://community.adobe.com/questions-404/does-adobe-firefly-ai-supports-text-to-video-api-calls-1639384
- **Real first+last-frame behaviour:** a Sep 2026 test found that Runway Gen-4.5, Kling v2.6, Hailuo 2.3, Wan 3 and Wan 2.5 **silently ignore the end frame and still bill**. It also found that none of the models tested looped by itself. Using the same image for first and last frame cut motion about 10×. The author's advice is to generate free motion and close the loop locally with a crossfade or ping-pong. Source: https://mer.vin/2026/09/which-ai-video-models-actually-take-a-first-and-last-frame/

## 3. Open weights and hardware

- **Wan 2.2:** Apache 2.0. The official single-GPU 14B command needs 80 GB VRAM (https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B). ComfyUI says the 5B fits about 8 GB with offloading, and offers native I2V and FLF2V templates (https://docs.comfy.org/tutorials/video/wan/wan2_2). The VACE inpaint template uses white = regenerate, black = keep (https://comfy.org/hub/workflows/wan2-1-vace-inpainting-a1bb55d904c9/).
- **Loops with Wan FLF2V:** use the same image at both ends and drop the duplicate last frame (https://www.nextdiffusion.ai/tutorials/wan-2-2-looping-animations-in-comfyui). Expect colour burn and drift at the seam; fixes are a ColorMatch node or a slightly changed last frame (https://civarchive.com/models/1869481/wan-22-perfect-loops).
- **Apple Silicon is not practical for the full models:**
  - FP8 checkpoints fail on Metal.
  - Wan 2.2 14B as GGUF took **82 min for 2 s** at 832×480 on an M1 Max 64 GB.
  - LTX-2's official pipeline produced NaNs on MPS (https://lilting.ch/en/articles/ltx2-wan22-mac-local-video-gen).
  - The one usable path is a distilled Wan 2.2 TI2V-5B (FastMetal, 3 steps): **about 151 s for 81 frames at 1280×704 on an M4 Max 36 GB**, about 200 s on an M5 Air. The full model via mlx-video took 96 min for 5 s (https://modelfit.io/video/wan-2-2-5b/). That is fine for drafts; use rented NVIDIA or hosted APIs for production.
- **FramePack on Mac** (brandon929 fork): 1 s of video in about 2.5 min (M3 Ultra) to about 10 min for 2 s (M2 Max) (https://www.techno-edge.net/article/2025/04/28/4319.html and the r/StableDiffusion "FramePack on macOS" thread).
- **LTX-2 license:** https://huggingface.co/Lightricks/LTX-2.3. The ~$10M revenue threshold wording varies across sources: https://scancode-licensedb.aboutcode.org/ltx-2-cla-2026.html
- **HunyuanVideo 1.5 territory exclusion:** https://huggingface.co/tencent/HunyuanVideo-1.5. Excluding the EU, UK and South Korea rules it out for many marketing teams.

## 4. Keeping text crisp (practitioner consensus)

- Never let the model redraw text. Generative video treats a wordmark as pixels and letterforms drift from frame to frame. Animate the icon or scene and put the real wordmark back as a static layer (https://www.svgator.com/blog/how-to-animate-your-logo-with-ai/).
- For packaging: mask the product and freeze the label, or composite the sharp original over it. Pouches and wrap-around labels are the worst cases (https://aitoolsguidebook.com/en/articles/ai-video-product-deformation/, https://aitoolsguidebook.com/en/articles/ai-video-text-overlay-garbled/).
- Research backs the masked approach. A Eurographics 2026 method does soft latent blending with a user mask: foreground moves, background stays frozen. It uses two stages to avoid the motion collapse caused by forcing identical first and last frames. Related papers: Text2Cinemagraph (arXiv 2307.03190), Sketch2Cinemagraph (arXiv 2412.00638), DreamLoop (arXiv 2601.02646).

## 5. Recommendations for the skill

**When AI video is worth it.** Only for organic motion that procedural tricks can't fake: hair, fabric, water, smoke, steam, particles, sky, or a subtle push-in on a photo. For banners whose value is the text, price and logo, use deterministic animation first: Ken Burns, parallax layers, shimmer, CSS or Lottie. Make AI an opt-in `--ai` mode that needs an API key.

**Pipeline that keeps text crisp:**
1. Split the source into layers: text, logo, price and CTA as one protected layer, the rest as plate. Use the PSD or Figma layers if available; otherwise use OCR plus a segmentation mask and dilate the mask a few pixels.
2. Inpaint the protected areas out of the plate, then send **only the clean plate** to the video model.
3. Composite the original protected pixels back over every frame with ffmpeg overlay, using alpha or the dilated mask. Optionally protect the product too: AI handles the background, the product stays a still or gets a 2D transform.
4. For a cinemagraph, use the mask to freeze everything except the moving region. Either composite the original still outside the mask, or use Kling motion brush (`static_mask`) or Wan VACE.

**Aspect ratios.** No model outputs 6.5:1 or native 2:3.
- For very wide banners, generate on the region that moves (crop to 16:9 or 21:9). Alternatively, generate a 21:9 plate with Seedance, Kling 4 or Luma reframe and composite it into the static wide canvas.
- For 2:3, generate 9:16 or 3:4 and crop, or pad with Luma reframe (`source_position`).
- Always pass the image at the provider's exact ratio; otherwise the provider crops it silently (fal Wan center-crops).

**Loops:**
- Preferred: generate free motion, then close the loop locally. Use a crossfade of the last N frames into the first N, or a ping-pong for symmetric motion such as breathing, sway or bokeh.
- Where it is reliable: Luma `loop: true`, or first = last on a model **verified** to honor the end frame (Veo 3.1, Omni Flash, Seedance, Kling 3/4, Wan 2.2 FLF2V). Expect less motion and colour drift; run a colour match afterwards.
- Check the seam automatically: compare the mean difference between the last and first frame with the typical frame-to-frame change (target below about 2×).

**Provider integration (simplest for an agent):**
- **fal:** `POST https://queue.fal.run/{owner}/{app}` with `Authorization: Key $FAL_KEY`, poll the returned `status_url`, read `response_url` (https://fal.ai/docs/model-endpoints/queue). Upload local files to fal CDN or use small data URIs (https://fal.ai/docs/documentation/model-apis/fal-cdn).
- **Replicate:** `POST /v1/models/{owner}/{name}/predictions` with `Authorization: Bearer`, `Prefer: wait` (≤60 s), then poll `/v1/predictions/{id}` (https://replicate.com/docs/reference/http). Data URIs are recommended only under about 1 MB (https://replicate.com/docs/topics/predictions/input-files.md).
- **Default model choices:**
  - Cheap draft: Omni Flash 360p ($0.027/s) or Wan 2.2 480p ($0.04/s).
  - Quality: Seedance or Kling 3/4.
  - Region control: Kling motion brush.
  - Native loop or ultrawide reframe: Luma Ray 3.2.
  - Strict IP indemnity: Firefly, enterprise only.

**What to avoid:**
- Sending text, logos or prices into the model.
- Relying on prompt words like "seamless loop".
- Trusting "first/last frame" without checking that the model honors it; some ignore it silently and still bill.
- Hard-coding Sora 2 or the Veo preview IDs (both dead).
- HunyuanVideo for EU, UK or Korean clients.
- Running full Wan 2.2 or LTX-2 locally on a Mac.
- Faces or people at high res without a human review.
- Reseller prices as truth: check provider pages at runtime and pin model IDs in config.

## Could not verify

- Official Kling API prices and which Kling versions support motion brush (only v1 docs and third-party mirrors).
- Luma's credit-to-dollar rate and API license terms.
- BytePlus/Seedance and MiniMax commercial terms.
- Pika's direct API.
- Whether the Firefly API supports image-to-video.
- Runway Gen-4.5's exact ratio list.
- FramePack's license.
- Current Gemini API wording on output ownership.
- CogVideoX, SVD, AnimateDiff and Mochi (not researched).
- An official Veo 3.1 GA price page. The Veo prices above come from Runway's resale table; third-party sources quote Gemini API rates of $0.40/s standard, $0.10–0.12 Fast and $0.05–0.08 Lite (https://benchlm.ai/media-pricing/veo).

Many figures are dated Sep–Nov 2026 and this field changes monthly.