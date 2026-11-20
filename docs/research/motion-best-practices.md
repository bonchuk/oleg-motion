# Motion design for animated banners and looping ad videos: research for a "static image → animation" skill

Every concrete claim has its URL next to it. **[H]** marks a number I could not source: it is a practitioner heuristic or my own engineering default. **[U]** marks a claim that comes only from secondary sources or that I could not check against the primary page.

---

## 1. Motion principles and platform rules

### Timing and easing
- **Duration.** Most UI motion should take 100–500 ms. Small feedback is about 100 ms, larger changes 200–300 ms, and anything over 400 ms is only for big moves. NN/g: "far more common for animations to be too long than too short" ([NN/g](https://www.nngroup.com/articles/animation-duration/)).
- **Easing direction.** Entrances use ease-out and exits use ease-in, with exits slightly shorter. The more often an animation repeats, the subtler and shorter it should be (same source).
- **Material 3 duration tokens.** short1 = 50 ms, medium2 = 300 ms, long2 = 500 ms, extra-long1–4 = 700–1000 ms. These come from the Flutter mirror of the spec ([Flutter Durations](https://api.flutter.dev/flutter/material/Durations-class.html)).
- **Material 3 easing curves [U, community sources agree].** Emphasized-decelerate (entering) is `cubic-bezier(0.05,0.7,0.1,1)`. Emphasized-accelerate (exiting) is `(0.3,0,0.8,0.15)` ([search summary](https://docs.rs/crate/bevy_material_ui/latest/source/src/motion.rs)).
- **Overshoot.** A common "back" curve is `cubic-bezier(0.34,1.56,0.64,1)`. For a bounce that settles over several swings you need a spring, not a bezier ([userinterface-wiki](https://userinterface-wiki.vercel.app/12-principles-of-animation)).
- **Recommended skill defaults [H]:**
  - Hero entrance: 400–600 ms, emphasized-decelerate.
  - Secondary motion: 2–6 s cycles, sine in-out.
  - Overshoot: 5–10% of the distance travelled.
  - Anticipation: 80–120 ms and about 3% in the opposite direction, used only on price or CTA pops.

### Hierarchy
- Use one hero motion, at most two subtle secondary motions, and never move the text and the background in competing directions [H].
- Treat the first frame as a complete static ad ([inboundrem](https://inboundrem.com/animated-banner/)).
- Show the CTA early, not only on the end frame, because people scroll away before the end ([Linear Design](https://lineardesign.com/blog/animated-gif-vs-static-display-ads/)).
- Text pacing: TikTok recommends about 5–10 words per second and putting the offer in the first 3 s ([TikTok Ads](https://ads.tiktok.com/help/article/creative-best-practices?lang=en)).

### Loop length and ad-network limits
| Source | Rule |
|---|---|
| Google Ads uploaded display ads | Animation ≤30 s including loops, must stop after 30 s. GIFs below 5 fps. Image ads ≤150 KB, HTML5 ZIP ≤600 KB ([Google](https://support.google.com/google-ads/answer/1722096?hl=en)) |
| Google third-party ad serving | 30 s maximum when the host starts the animation ([Google](https://support.google.com/adspolicy/answer/94230)) |
| IAB New Ad Portfolio (2017) | Animation ≤15 s with no looping past 15 s. Host-initiated video ≤15 s. Avoid flashing or fast motion ([IAB PDF](https://www.iab.com/wp-content/uploads/2019/04/IABNewAdPortfolio_AdExperience_CBA_Guide.pdf) — **[U]**, the PDF would not render, so this is from the search snippet) |
| Apple (IAB banners) | GIFs loop at most 3 times and run ≤15 s in total ([Apple](https://support.apple.com/guide/adguide/apd9c9243bfc/icloud)) [U snippet] |
| Amazon | ≤15 s, up to 3 loops. Flashing or pulsing is banned except a pulse of ≤3 s, for example on the CTA ([Amazon](https://advertising.amazon.com/resources/ad-policy/creative-acceptance/general-creative-guidelines)) [U snippet] |
| Meta Stories/Reels | 9:16 at 1080×1920. Keep about 14% at the top and 20% at the bottom free as a safe zone. Hook in the first 3 s, total 7–15 s ([adsuploader](https://adsuploader.com/de/blog/meta-ads-safe-zones), [benly](https://benly.ai/learn/ad-creative/meta-ads-creative-specs-2026)) [U, third-party] |
| TikTok | Hook within the first 6 s, 9:16, ≥720p, keep content inside the UI safe zone ([TikTok](https://ads.tiktok.com/help/article/creative-best-practices?lang=en)) |

**Loop defaults [H]:**
- On-site hero or catalog loop: 4–8 s and seamless.
- Display ad: 5–10 s, played ≤3 times, ending on a still frame with the CTA, ≤15 s in total.
- Story: 6–10 s.

### Accessibility and motion sickness
- **WCAG 2.2.2 (Level A).** Motion that starts on its own, lasts more than 5 s and sits alongside other content needs a pause, stop or hide control ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide)). For the skill this means: either stop all motion within 5 s, or ship a pause control or stop after N loops.
- **WCAG 2.3.1 flashes.** No more than 3 general flashes or red flashes in any 1 s. A flash is a luminance change of ≥10%. The area threshold is roughly 341×256 px at 1024×768, about 25% of a 10° field. Saturated red counts separately ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold)).
- **Reduced motion.** `prefers-reduced-motion: reduce`: scaling or panning large objects are vestibular triggers. MDN's example replaces a scale pulse with an opacity dissolve ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).
- **Apple's guidance.** Disable or change parallax, animated blur, depth-of-field, multi-axis or multi-speed motion, spinning and vortex effects. Stop decorative motion entirely. Where motion carries meaning, replace it with a dissolve, highlight fade or color shift ([Apple](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria)).
- **Peripheral motion.** Avoid motion at the edges of the view and sustained oscillation around 0.2 Hz ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/motion.md)) [U]. In practice, keep breathing cycles off ~5 s periods, or keep their amplitude tiny [H].
- **Safer motion types.** Color changes, opacity fades and small movements are generally lower risk. Large zooms and parallax are the main triggers ([Val Head](https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity)).
- **What not to animate [H, follows from the rules above].**
  - Prices, the discount figure after it lands, legal or terms text, and dates: they must stay rigid, legible and on screen for the whole loop.
  - The product silhouette, which must not distort. Meta notes its AI animation "can distort product edges and label text" ([adsuploader](https://adsuploader.com/blog/advantage-plus-creative-enhancements)) [U].
  - Logos: no shake or glitch.

---

## 2. Technical delivery

### Markup
- Use `<video autoplay muted loop playsinline poster=…>`.
- Muted or audio-less video autoplays without a gesture, and only while visible. It pauses when off-screen. Without `playsinline`, iPhone plays fullscreen. `play()` returns a Promise that rejects when the rules aren't met ([WebKit](https://webkit.org/blog/6784/new-video-policies-for-ios/)).
- Set `muted` as a JS property as well [U].
- Low Power Mode can block autoplay [U]. A poster frame is therefore mandatory, and it must look finished on its own.
- Above the fold, the poster is usually the LCP element. Don't lazy-load it, and use `preload="metadata"` ([search summary](https://elfsight.com/guides/optimize-video-for-website/)) [U].

### Codecs (list sources in this order)
1. **AV1 MP4.** 30–50% smaller than H.264. Safari decodes it only in hardware: A17 Pro / M3 and newer ([Evil Martians](https://evilmartians.com/chronicles/better-web-video-with-av1-codec)).
2. **Optional VP9 WebM.** web.dev uses `-c vp9 -b:v 0 -crf 41` ([web.dev](https://web.dev/articles/replace-gifs-with-videos)). Safari supports WebM on macOS 11.3+ and iOS 15+ [U] ([caniuse](https://caniuse.com/webm)).
3. **H.264 MP4 fallback, always included.**
   `-c:v libx264 -crf 23–28 -preset veryslow -profile:v main -pix_fmt yuv420p -movflags +faststart -an -vf scale=trunc(iw/2)*2:trunc(ih/2)*2` ([Evil Martians](https://evilmartians.com/chronicles/better-web-video-with-av1-codec), [web.dev](https://web.dev/articles/replace-gifs-with-videos)).
4. **HEVC** only for transparent video in Safari, which can't show VP9 alpha (Evil Martians).

### Pitfalls
- **Dimensions.** yuv420p needs even width and height.
- **Washed-out color.**
  - Cause: missing or mismatched color tags.
  - Fix: convert explicitly (sRGB → bt709 with the `colorspace` filter), then tag primaries, transfer and matrix as bt709, with limited (tv) range.
  - Caveat: browsers still differ, so test Chrome, Safari and Firefox ([Mux](https://www.mux.com/blog/your-browser-and-my-browser-see-different-colors), [FFmpeg colorspace wiki](https://trac.ffmpeg.org/wiki/colorspace), [Mozilla bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1783458)).

### Budgets
- Hero video: 720p at about 1–2.5 Mbps, ≤2–5 MB total ([search summary](https://elfsight.com/guides/optimize-video-for-website/)) [U].
- IAB host-initiated video: ≤1.1 MB [U].
- **Skill defaults [H]:**
  - Wide hero 1920×600–800, 6 s: ≤1.5 MB with H.264 at CRF 26.
  - Catalog or app tile ≤800 px wide: ≤400 KB.
  - Story 1080×1920, 8 s: ≤3 MB.
  - 24–30 fps; 25 fps is fine for slow drift.

### Seamless loops
1. **Design for periodicity [H].** Every oscillator completes a whole number of cycles per loop, as `sin(2π·k·t/T)`. Particles wrap around (spawn position modulo the loop). Frame N then equals frame 0 by construction, and this is the best method.
2. **Crossfade the tail into the head** with `xfade`. Put the fade at the start of the output so the first frame is a blend. Check the seam by grabbing the first frame with `-ss 0` and the last with `-sseof -0.1`, then compare ([FFmpeg Xfade wiki](https://trac.ffmpeg.org/wiki/Xfade), [SO](https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/65707722/ffmpeg-seamless-crossfade-loop-for-the-part-of-video)).
3. **Don't render the duplicate end frame [H].** Render frames 0…N-1, not 0…N.
4. **Keyframes.** Long GOPs make looping and seeking expensive in Safari ([WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=200949)). Use a short or closed GOP, for example `-g <fps> -flags +cgop` [U, I found no primary evidence that this fixes the stutter].

### Lottie vs video vs CSS
| Format | Best for | Notes |
|---|---|---|
| CSS / WAAPI | Transform or opacity on real DOM layers: price pop, CTA pulse, shine | No asset weight, text stays crisp and accessible, `prefers-reduced-motion` works natively |
| Lottie / dotLottie | Vector overlays such as sparkles, confetti and badges | KBs instead of MBs, but embedded JPEGs bloat it ([LottieFiles](https://lottiefiles.com/blog/design-inspiration/lottie-the-animation-file-format-thats-optimizing-website-performances), [dev.to](https://dev.to/louisbuilds/not-everything-should-be-lottie-choosing-the-right-animation-format-in-2026-en1)) |
| Video | Photographic motion: cinemagraph, push-in, light leaks, particles over a photo | |
| WebGL | Live distortion or liquid effects | Heavy, so use only for flagship heroes [H] |

**Recommended architecture for the skill [H]:**
- Render the photo-based effects to MP4.
- Keep the text, price and CTA as live HTML or native layers on top. That keeps legal and price text sharp, translatable and accessible.

---

## 3. Preset catalogue

All parameters are **[H]** practitioner defaults unless a source is cited. "Amp" means amplitude. Durations are for one loop.

| Preset | Fits | Look and parameters | Risks |
|---|---|---|---|
| **shine-sweep** | Product launch, premium, metallic or glass products, CTA | A 20–30° diagonal soft gradient band, 15–25% of the element's width, peak opacity 0.25–0.4, `screen`/`overlay` blend. Sweep 600–900 ms ease-in-out, then hold 2.5–4 s. Masked to the product or CTA alpha. | Too frequent looks cheap. Never sweep across the price. |
| **glint-star** | Jewelry, cosmetics, "new" | 4-point star flare, scale 0 → 1 → 0 over 400–600 ms, rotate 15–45°, 1–3 instances staggered 300 ms on specular highlights. | Each glint is a luminance flash, so keep it ≤3/s and small (WCAG 2.3.1). |
| **particles** (snow / leaves / confetti / dust / hearts) | Seasonal (snow = winter, leaves = autumn, confetti = sale or launch, hearts = Valentine's) | 20–60 particles on 2–3 depth layers (size and speed scale with depth), fall 20–60 px/s on 1080p, horizontal drift sin 10–30 px over 3–5 s, opacity 0.6–0.9. Wraps for a seamless loop. Confetti: one burst of 0.8–1.2 s, then slow fall. | Covering faces, product or text. Use a keep-out mask over the text and price zones. |
| **parallax-layers** | Lifestyle hero with depth (needs foreground/background separation) | 2–3 layers, foreground offset 8–16 px, background 2–4 px, sine over 6–8 s. | Vestibular trigger ([Apple](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria), [W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)). Mandatory reduced-motion fallback. Cutout halos. |
| **ken-burns / push-in** | Any photo, editorial, product hero | Scale 1.00 → 1.04–1.08 over 6–10 s, linear or very gentle ease, optional 1–2% pan. Tool defaults are much stronger, 1.2–1.35 ([zvid](https://docs.zvid.io/docs/structure/properties/zoom/), [Slider Revolution](https://www.sliderrevolution.com/documentation/pan-zoom/)), but that is too much for banners. For a loop, use ping-pong or a crossfade. | Large zoom is a trigger (MDN). Product cropping. Upscale softness: render at ≥1.1× resolution. |
| **breathing / 3D tilt** (text or product) | Launch, hero title | Scale 1.00 ↔ 1.02, or rotateX/Y ±2–4°, over a 3–4 s sine. | Text must never blur or wobble while being read. Use on headings only, never on the price. |
| **price-pop** | Discount, sale | One shot: scale 0.6 → 1.08 → 1.0 over 350–450 ms with back easing (0.34,1.56,0.64,1). Optional 100 ms anticipation to 0.95. Then completely static. | Never loop it. Amazon allows a pulse of ≤3 s only ([Amazon](https://advertising.amazon.com/resources/ad-policy/creative-acceptance/general-creative-guidelines)) [U]. |
| **cta-pulse** | Any | Scale 1.0 → 1.05 → 1.0 over 600 ms, at most 2–3 times, then stop. Or a soft glow ring. | Policy limits on pulsing. Must not imitate a UI interaction. |
| **countdown-pulse** | Flash sale, Black Friday | Digits flip or slide in 200–300 ms each second. Container glow 1 Hz at ≤15% luminance change. | Live countdowns need real data. A baked video can't count down truthfully. |
| **light-leak** | Lifestyle, summer, nostalgic | Warm orange/magenta gradient blobs, `screen` blend at 0.15–0.35, drifting 3–6% of the frame over 6–8 s. | Washed-out product color. Must not flash (keep luminance change <10%). |
| **bokeh-drift** | Holiday, evening, premium | 8–20 soft circles 2–6% of frame width, blur, opacity 0.2–0.5, drift 5–15 px/s with a slow opacity twinkle over 2–4 s. | Busy behind the text: use a keep-out mask. |
| **cinemagraph** | Food, drinks, fashion, travel | One masked region moves (steam, water, hair, fabric); the rest is frozen. 3–6 s seamless loop. Vendor-reported lifts: inkbox −41% CPC, Microsoft −45% cost per engagement ([Flixel](https://blog.flixel.com/case-study-smb-inkbox-tests-cinemagraphs-vs-still-photo-ads-on-facebook), [LBB](https://lbbonline.com/news/cinemagraphs-vs-still-photos-in-social-advertising-a-microsoft-case-study)) [vendor data]. | Needs a source with real motion, or a generative model. A visible seam. |
| **liquid / wave distortion** | Beverages, swimwear, cosmetics | Displacement map, amp 2–6 px, wavelength 80–200 px, 4–6 s period. | Distorts the product and logo, so mask them out. Heavy for WebGL. |
| **glitch** | Tech, gaming, youth drops, Cyber Monday | RGB split 2–6 px plus slice offsets in 80–150 ms bursts, at most one burst every 2–3 s. | Flash and strobe risk (≤3/s), off-brand for most retail, never on the logo. |
| **neon-flicker** | Night events, Black Friday "dark" themes | Glow intensity steps over 1–2 short flickers (50–100 ms), then steady for ≥2 s. | Classic WCAG 2.3.1 violation if it repeats fast or covers a large area. Keep dips <10% luminance, or replace them with a slow glow ramp. |

**Mood → preset bundles [H]:**
- **Calm / premium:** push-in 1.04 + light shine every 4 s.
- **Festive:** snow, bokeh or confetti + breathing title.
- **Hot sale:** price-pop + CTA-pulse ×2 + optional countdown, nothing else moving.
- **Energetic / drop:** glitch-in at t=0 + push-in.
- **Summer / lifestyle:** light-leak + parallax.
- **Fresh / product:** cinemagraph or liquid on the product's surroundings.

**Rule [H]:** at most one "hero" preset plus ≤2 ambient presets. Each preset declares a reduced-motion variant: static, or opacity-only.

---

## 4. Evidence on motion vs static

- **Controlled display tests: no reliable CTR win for animation.**
  - Simantel's paid tests from 2017–2025 found near-identical CTR, with static slightly ahead recently ([Simantel](https://www.simantel.com/animated-banner-ads-are-they-worth-the-effort/)).
  - A Fandom A/B test found the animated banners had a lower CTR (search summary).
  - GfK/Norris (2017): animated formats beat static on recall and brand favorability, but static works well for price and retargeting ads ([GfK MIR](https://ideas.repec.org/a/vrs/gfkmir/v9y2017i1p53-56n9.html)).
- **Large lifts come from interactive or rich media in vendor tests.**
  - Nexd: 3.65% vs 1.27% CTR ([Nexd](https://www.nexd.com/blog/interactive-rich-media-drove-3x-the-ctr-vs-standard-display/)).
  - Celtra, Zakcret Sports 2024: +25% CTR, but that was dynamic product ads, not animation ([Celtra](https://celtra.com/blog/case-study-zakcret-sports-boosts-lower-funnel-campaigns-ctr-by-25/)).
- **Meta.** The "17% conversion lift from adding motion" figure appears only second-hand [U] ([Knowlify](https://knowlify.com/articles/do-animated-ads-work-on-meta)).
- **Platforms are productizing subtle motion.**
  - Meta Advantage+ "image animation" turns stills into short clips with subtle motion ([Meta dev docs](https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started.md), [Social Media Today](https://www.socialmediatoday.com/news/meta-announces-image-animation-video-expansion-tools-advertising-week/729260/)).
  - Google Performance Max auto-generates video from images ([Google](https://support.google.com/google-ads/answer/16430641)).
- **Takeaway.** Motion helps attention and recall more reliably than CTR. Keep it subtle, keep the first frame strong, and A/B test against the static version. I found no independent public 2024–2026 e-commerce case study that isolates subtle motion.

---

## 5. Structuring a reusable preset system

### How existing tools parameterize templates
- **Lottie.** A root with `fr`, `ip`, `op`, `w`, `h`, `assets`, and typed `layers`. Each layer has its own `ip`, `op` and `st`. Animated properties use `a:1` with keyframes in `k` ([Lottie spec](https://lottie.github.io/lottie-spec/specs/schema/)).
- **dotLottie slots / motion tokens.** Color, scalar, vector, gradient, text and image values are exposed by slot ID and themed at runtime ([LottieFiles](https://docs.lottiefiles.com/en/format/dotlottie/interactivity/theming/specification)).
- **Remotion.** A Zod schema plus `defaultProps`. The Studio auto-generates form controls, and `inputProps` override the defaults at render time ([Remotion](https://remotion.dev/docs/schemas), [passing props](https://www.remotion.dev/docs/passing-props)).
- **After Effects MOGRT.** Expose a curated set of properties (text, color, size, speed) in Essential Graphics. "Responsive Design – Time" marks protected intro and outro regions; the middle stretches to fit ([Adobe](https://helpx.adobe.com/after-effects/using/creating-motion-graphics-templates.html), [Frame.io](https://blog.frame.io/2024/08/12/mogrt-guide-after-effects-2024-motion-graphics-workflow/)).

### Proposed scene spec [H]
```json
{
  "canvas": {"w":1920,"h":720,"fps":25,"loop":6.0,"maxLoops":3,"endOn":"still"},
  "layers": [
    {"id":"bg","src":"image.png","effects":[{"preset":"push-in","scale":[1,1.05]}]},
    {"id":"product","mask":"product.png","effects":[{"preset":"shine-sweep","angle":25,"every":4}]},
    {"id":"fx","effects":[{"preset":"snow","count":40,"depthLayers":3,"keepOut":["text","price"]}]}
  ],
  "overlay": {"text":"live-html","price":"static","cta":{"preset":"cta-pulse","times":2}},
  "reducedMotion": "poster",
  "export": {"codecs":["av1","h264"],"crf":26,"poster":"frame0"}
}
```

### Rules for the preset system [H]
- **Preset definition.** Each preset is a pure function `(t, params, seed) → layer transforms/pixels`, plus:
  - a parameter schema with min, max and default (Zod/Remotion style);
  - a periodicity guarantee: whole-number cycles per loop;
  - a reduced-motion variant;
  - risk flags: `flash`, `vestibular`, `distortsProduct`.
- **Mood picker for non-designers.** A small set of moods (calm, festive, hot-sale, energetic, summer, premium). Each mood maps to one bundle with locked hierarchy rules and exposes only 2–3 sliders: "intensity" (scales amplitudes 0.5–1.5×), "speed" and "density". This mirrors the MOGRT practice of curated controls.
- **Linter before export.** Check:
  - flash count ≤3/s (luminance delta per frame);
  - total motion either ≤5 s, or a pause control / loop cap ≤15 s;
  - no motion inside the price or legal zones;
  - first frame equals last frame (pixel diff);
  - file size within the budget for the target.

---

## Most important caveats
- The IAB, Apple and Amazon numbers come from search snippets, because the primary pages or PDFs didn't render.
- The Meta 17% figure, Safari WebM versions, the closed-GOP fix and hero file-size budgets are not verified against primary sources.
- The effect parameters in section 3 are practitioner heuristics, not published standards. Validate them visually.
