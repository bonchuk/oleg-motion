# scene.json

```json
{
  "profile": "story",
  "canvas": { "w": 1080, "h": 1920, "fps": 30, "duration": 6, "structure": "loop",
              "fit": "cover", "focus": [0.5, 0.4], "background": "#000000" },
  "source": { "w": 1536, "h": 2304 },
  "seed": 7,
  "camera": { "push": 0.04, "panX": 8, "cycles": 1 },
  "layers": [
    { "id": "background", "src": "layers/background.png", "role": "background", "x": 0, "y": 0, "w": 1536, "h": 2304, "depth": 0.05, "z": 0,
      "effects": [ { "type": "depthParallax", "map": "layers/depth.png", "amp": 8 } ] },
    { "id": "subject", "src": "layers/subject.png", "role": "subject", "x": 420, "y": 900, "w": 700, "h": 1100, "depth": 0.65, "z": 1,
      "effects": [ { "type": "float", "ampY": 8 }, { "type": "shine", "phase": 0.2 } ] },
    { "id": "price_1", "src": "layers/text_2.png", "role": "price", "x": 300, "y": 400, "w": 900, "h": 300, "z": 2,
      "effects": [ { "type": "glint", "points": "auto", "count": 2 } ] }
  ],
  "overlays": [ { "type": "particles", "kind": "dust", "count": 40, "z": "front", "keepOut": ["price", "text"] } ]
}
```

## canvas
| key | meaning |
|---|---|
| `w`, `h` | output size (rounded to even). Omit to keep the source size. |
| `fps` | 24–30 typical; 25 is fine for slow drifts. |
| `structure` | `loop` (seamless, frame N = frame 0), `intro-loop` (`intro` seconds of entrances, then `loop` seconds that repeat seamlessly `repeats` times), `oneshot` (start → end). |
| `duration` | loop length or total length. For `intro-loop` it is computed: `intro + loop × repeats`. |
| `fit` | `cover` (crop to fill; default), `contain` (letterbox), `contain-blur` (whole image + blurred fill — for vertical art in a wide banner and vice versa). |
| `focus` | `[fx, fy]` of the source that stays in view when cropping. Default: centre of text/price/logo, else the subject. |

## layers
Positions and sizes are in **source pixels**. `src` paths are relative to scene.json.

| key | meaning |
|---|---|
| `role` | `background`, `subject`, `foreground`, `decor`, `text`, `logo`, `cta`, `price`, `legal`. Decides motion limits: price/legal are locked (only light + intro effects), text/logo/cta move gently. |
| `depth` | 0 = far … 1 = near. Drives camera parallax. |
| `z` | stacking order (low = behind). |
| `opacity`, `blend` | CSS opacity / mix-blend-mode. |
| `mask` | grayscale/alpha PNG limiting where the layer shows (cinemagraph regions). |
| `anchor` | `[ax, ay]` pivot for rotation/scale (0–1 of the layer box). |
| `effects` | list from references/effects.md. |

## Determinism
The runtime is a pure function of time and `seed`. Change `seed` for a different particle
layout; the same scene always renders the same frames.
