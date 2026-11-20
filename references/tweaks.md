# Tweaks: what people say → what to change in scene.json

People react to a draft in their own words. Map the phrase, change the smallest thing that
answers it, re-render as draft. Keep cycles whole and stay inside motion-guidelines.md.

| they say (uk / en) | change |
|---|---|
| повільніше, спокійніше / slower, calmer | halve `cycles` where > 1; lower camera `push` by ⅓; particle `speed` 0.6 |
| швидше, динамічніше / faster, punchier | double `cycles` on decor/hero light (not on text motion); intro `dur` × 0.75 |
| менше руху / less motion, too busy | drop the weakest ambient effect; `tilt3d`/`float`/`breathe` amplitudes × 0.5; keep the hero |
| більше руху / more alive | add one ambient (particles or light leak) or raise hero amplitude × 1.5 within limits |
| менше блиску / less shine | `shine.opacity` × 0.5 or `sweep` shorter; fewer `glint` points |
| більше блиску, яскравіше / more sparkle | add `shine` to the hero, `glint` count 2–3, `glow.strength` +0.15 |
| без частинок / no particles | remove `particles` overlays |
| менше частинок / fewer particles | `count` × 0.5 |
| кнопку помітніше / make the CTA pop | CTA `glow` + `breathe` (`cycles` 2), or a `shine` every loop |
| заголовок не чіпай / don't move the headline | remove motion effects from that layer, keep intro + light |
| прибери інтро / no intro | `structure: "loop"`, drop intro effects (fadeIn, riseIn, popIn, …) |
| додай появу / add an intro | `structure: "intro-loop"`, `intro` 1.5–2 s, stagger entrances 0.1–0.2 s |
| довше / коротше | `loop` (intro-loop) or `duration` (loop/oneshot); intro stays |
| фото/обличчя не спотворюй / don't warp people | no `wave` / `depthParallax` on that layer; only `float` ≤ 5 px or nothing |
| як у референсі / like the reference | study 6–8 frames of it: entrance order, rhythm, which element is the hero; copy that |
| інший колір частинок / світла | particle `colors`, `glow.color`, `lightLeak.colors` — take from the image's palette or the brand kit |
| для Stories / для сайту / GIF | change `profile`, re-check what the crop hides (`focus`), render the format |
| тексту погано читається | remove particles over it (`keepOut`), lower `grain`, stop text motion |

If a request would break a rule (prices moving, flashing faster than 3/s, large zooms),
say why briefly and offer the closest safe alternative.
