# Motion guidelines (distilled from research; sources in docs/research/)

## Hierarchy
- One hero motion + at most two ambient motions. More than that reads as noise and hurts recall.
- The first frame must work as a finished static ad: it is the poster, the autoplay-blocked
  fallback and what most people see while scrolling.
- Show the CTA early; do not rely on the last frame.

## What never moves
- Prices, discount figures (after they land), dates, legal text: rigid and readable for the
  whole loop. Role `price`/`legal` enforces it; the renderer's "locked" check verifies it.
- Logos: no shake, glitch or distortion. Light (shine/glint) is fine.
- Product silhouettes: no wave/displacement over the product or its label.
- People cut out of a photo: no fake locomotion — bobbing, "running" pulses, breathe or
  sway on a whole person read as a cardboard puppet (users rejected it). A person gets depth
  from the camera (parallax against the background) and, at most, an intro (focus pull,
  settle from a close-up). Their limbs cannot really move, so don't pretend they do.

## Amplitudes and timing (defaults that look professional)
| motion | sensible range |
|---|---|
| camera push | 3–6 % per loop (tools default to 20–35 %: far too much for banners) |
| parallax | foreground 8–16 px, background 2–4 px per 1080 px |
| breathe | 1–2 % scale |
| tilt3d | 2–4° |
| float | 4–10 px |
| shine sweep | 0.6–0.9 s, then a 2.5–4 s pause |
| glint | 0.4–0.6 s, 1–3 at a time |
| particles | 20–60 on 2–3 depth layers; snow/leaves fall 20–60 px/s |
| loop length | 4–8 s on-site; ≤ 15 s total for display ads (≤ 3 loops) |
| intro | entrances 400–600 ms, ease-out; price pop 350–450 ms with slight overshoot |

## Accessibility and platform rules
- **Flashes**: no more than 3 luminance flashes per second (WCAG 2.3.1). The renderer checks it.
- **Motion > 5 s**: on websites provide a pause, or show the poster to users with
  `prefers-reduced-motion: reduce` (`<video poster>` + a media query that hides the video).
- Parallax, big zooms and spinning are vestibular triggers — keep them small.
- Google/IAB display ads: animation ≤ 15–30 s, then stop on a still frame; GIF ≤ 150 KB.
- Stories (9:16): keep text out of the top ~14 % and bottom ~20 %.

## Web delivery
- `<video autoplay muted loop playsinline poster="…-poster.jpg">` — `muted` + `playsinline`
  are required for autoplay on iOS.
- MP4 H.264 (yuv420p, limited range, BT.709, `+faststart`) everywhere; WebM VP9 as a
  smaller alternative source; GIF only where video is not allowed.
- Seamless loop = every periodic motion completes a whole number of cycles per loop;
  never "fix" a seam with a crossfade if you can make the motion periodic instead.

## Does motion help?
Controlled display tests show no reliable CTR lift from animation itself, but better
attention and recall. Subtle, purposeful motion + a strong first frame is the safe bet;
A/B test against the static version when it matters.
