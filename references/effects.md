# Effects catalogue

All amplitudes are authored for a ~1080 px short side. Every periodic effect takes `cycles`
(whole number of repetitions per loop) and an optional `phase` (0–1) to offset it from
others. Keep `cycles` integer — that is what makes the loop seamless.

Contents: [Camera](#camera) · [Layer motion](#layer-motion) · [Light](#light) · [Distortion](#distortion) · [Intro / outro](#intro--outro) · [Overlays](#overlays) · [Particle kinds](#particle-kinds) · [Recipes](#recipes)

## Camera
Scene-level `camera`. Applied to every layer, scaled by layer depth (parallax): far layers
move ×0.25, near ones up to ×1.75. Text/logo/CTA receive ×0.35, price/legal ×0.

| key | default | meaning |
|---|---|---|
| `push` | 0 | zoom amount (0.03 = 3 %). Loop: in and back out; one-shot: steady push |
| `panX`, `panY` | 0 | pan amplitude in source px |
| `cycles` | 1 | camera cycles per loop |
| `shake` | 0 | subtle handheld shake in px (keep ≤ 3; never on text-heavy banners) |

## Layer motion
Inside `layers[].effects`. Gentle roles (text, logo, cta) get half amplitude automatically;
price and legal ignore motion entirely.

| type | params (defaults) | use for |
|---|---|---|
| `float` | `ampX 0, ampY 8, cycles 1, phase 0` | product hovering, floating objects |
| `drift` | `ampX 6, ampY 4` | slow elliptical wander |
| `sway` | `deg 2, anchor [0.5,1]` | plants, hanging tags, people — rotate around a pivot |
| `breathe` | `amp 0.02` | headline or product slowly growing/shrinking 2 % |
| `tilt3d` | `degX 3, degY 4` | headline or card turning slightly in 3D (the "living" text of the reference banner) |
| `flutter` | `deg 18, cycles 2` | flags, paper, leaves as layers |
| `spin` | `turns 1` | badges, wheels, rotating decor |

## Light
Allowed on every role, including price (they do not move pixels).

| type | params (defaults) | notes |
|---|---|---|
| `shine` | `angle 20, width 0.18, opacity 0.45, cycles 1, sweep 0.3, phase 0.35, color #fff, blend screen` | diagonal light band clipped to the layer's own alpha — sweeps across the product, logo or headline. `sweep` = share of the cycle spent sweeping; the rest is a pause. |
| `glint` | `points 'auto' or [[fx,fy]…], count 3, size 0.12, cycles 1, duration 0.22, stagger, phase 0.1, color #fff8e0` | 4-point star sparkles; `auto` finds the brightest spots of the layer (chrome, glass, white text). |
| `glow` | `color #ffd36b, radius 18, strength 0.6, pulse 0.35, cycles 1` | neon/halo pulse via drop-shadow. Keep `pulse` ≤ 0.4 so it never reads as flashing. |

## Distortion
Never on text, price or logo layers — use a separate layer (cut-out or mask) for the part that should move.

| type | params | notes |
|---|---|---|
| `wave` | `amp 8, scale 4, cycles 1, dir x` | tiled-noise displacement scrolling by whole tiles per loop → water, heat haze, fabric. `scale` = noise lattice (bigger = finer ripples). |
| `depthParallax` | `map depth.png, amp 14, cycles 1` | 2.5D: shifts pixels proportionally to a depth map (white = near). Added automatically to the background when auto-layers produced `depth.png`. Keep amp ≤ 15 or edges stretch. |

## Intro / outro
Time-based (seconds), used by `intro-loop` and `oneshot`. They are allowed on locked roles,
so a price can pop in and then stay perfectly still.

| type | params (defaults) |
|---|---|
| `fadeIn` | `start 0, dur 0.6` |
| `riseIn` | `start, dur 0.6, dist 40` (px up, with fade) |
| `slideIn` | `start, dur 0.6, from left|right|up|down, dist 0.25` (share of width) |
| `popIn` | `start, dur 0.5, from 0.6, overshoot 1.9, fade true` (back-ease scale; `from` > 1 = settles from a close-up; `fade: false` keeps it opaque, e.g. a cut-out whose hole in the background must never show) |
| `blurIn` | `start, dur 0.6, px 20, fade true` (`fade: false` = focus pull without transparency) |
| `wipeIn` | `start, dur 0.7, from left|right|up|down` (clip reveal) |
| `fadeOut` | `start (default end−dur), dur 0.5` — one-shots only |

## Overlays
Scene-level `overlays`, drawn in canvas space. `z`: `"back"` (just above the background
layer, behind subject/text), `"mid"`, `"front"` (default, above everything) or a number.

| type | params (defaults) | notes |
|---|---|---|
| `particles` | `kind, count, size [min,max], colors, direction down|up|left|right|float, speed 1, sway, opacity [a,b], blur, depthLayers 3, focus 0.5, keepOut [roles], sprite, seed` | see kinds below. `keepOut: ["text","price","legal"]` fades particles near those layers (the `scene` command sets `["price","legal","cta","logo"]` for front particles automatically). `sprite: "leaf.png"` uses your own image. |
| `lightLeak` | `colors [...], opacity 0.25, cycles 1, blend screen` | warm drifting light blobs |
| `rays` | `origin [0.75,-0.05], angle 200, count 7, spread 60, opacity 0.16, sway 3, color` | god-rays from a corner |
| `flare` | `path [[x0,y0],[x1,y1]], size 0.18, cycles 1, phase 0.2, duration 0.4, opacity 0.8, color` | lens flare + anamorphic streak crossing once per cycle |
| `fog` | `opacity 0.18, scale 3, cycles 1, color #fff, blend screen` | drifting mist |
| `vignette` | `strength 0.35, color #000` | static edge darkening |
| `grain` | `amount 0.06` | film grain, cycles through 6 noise tiles |

## Particle kinds
| kind | look | default direction |
|---|---|---|
| `dust` | golden glowing specks, twinkle | up |
| `sparks` | brighter, faster sparks | up |
| `embers` | orange glowing embers | up |
| `stars` | 4-point twinkling stars | float |
| `snow` | soft white flakes, depth blur | down |
| `bokeh` | large soft discs (put on `z: "back"`) | float |
| `leaves` | autumn leaves flipping in 3D | down |
| `petals` | pink petals | down |
| `confetti` | multicolour flipping paper | down |
| `hearts` | hearts | up |
| `bubbles` | outlined bubbles | up |

Depth: particles are split over `depthLayers`; near ones are larger, faster and blurred
(depth of field around `focus`). For a photographic look, pass `sprite` with a cut-out PNG
(a real leaf, a snowflake) — sprites inherit all motion.

## Recipes
- **Reference banner ("Міжсезонний розпродаж")**: mood `autumn` on auto-layers — blurred
  plate drifts, headline gets `tilt3d` + `breathe` + a `glint`, golden `dust` in front,
  a few large `leaves` passing the corners.
- **Product hero**: `subject: float + shine`, `overlays: bokeh(back) + vignette`, camera push 0.03.
- **Hot sale with price**: price `popIn` (intro-loop) + `shine` + `glint`, `sparks` with
  `keepOut: ["price","text"]`, one `flare` per loop.
- **Cinemagraph**: cut the moving region into its own layer (or `mask`), give it `wave`,
  keep everything else still, no camera push.
