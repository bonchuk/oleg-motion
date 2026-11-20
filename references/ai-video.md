# Optional: generative AI video (not automated yet)

Use only when the motion cannot be faked procedurally — water, hair, fabric, smoke, sky,
crowds — and only with the user's API key and consent (it costs money per second).

## How to use it safely
1. Split layers first (auto-layers or PSD). Protected layers = text, price, legal, logo, CTA,
   and usually the product.
2. Send **only the clean background plate** (`background.png`, already inpainted) to the
   model, at the provider's exact aspect ratio (crop or pad first — providers crop silently).
3. Close the loop locally: generate free motion, then crossfade the tail into the head or
   ping-pong it. Do not trust "seamless loop" prompts or first=last-frame on models that
   ignore the end frame.
4. Use the generated clip as the background layer of a scene (convert to frames or use it as
   a video layer in a future engine version) and composite the original protected layers on
   top, so text stays pixel-perfect.

## Model notes (Nov 2026 — changes monthly, verify before use)
- Hosted aggregators with simple REST: fal.ai (`POST queue.fal.run/{model}`, poll status) and
  Replicate (`POST /v1/models/{owner}/{name}/predictions`).
- Native loop: Luma Ray 3.2 (`loop: true`). Region control: Kling motion brush. Widest
  native ratio is 21:9; nothing outputs 6.5:1 strips or 2:3 natively.
- Retired: Sora 2 API, Veo 3.1 preview IDs on the Gemini Developer API.
- Local open models (Wan 2.2, LTX-2) are impractical on Apple Silicon laptops.
- Full comparison with prices and licences: docs/research/ai-video.md.
