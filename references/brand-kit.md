# Brand kit

A small JSON file that remembers a brand's choices so nobody repeats them on every job.
Pass it to `scene --brand kit.json`. Where to keep it:

- next to the project's files as `oleg-motion.brand.json` (or `<name>.brand.json`), or
- in `$OM/brands/<name>.json` for kits shared by everyone using this skill.

```json
{
  "name": "Example Coffee Co",
  "palette": { "accent": "#e8833a", "accent2": "#f6c9a3", "light": "#ffffff", "dark": "#1b120c" },
  "defaults": { "profile": "feed-portrait", "mood": "premium", "structure": "intro-loop",
                "duration": 4, "intro": 2, "formats": "mp4", "intensity": 0.8 },
  "protect": ["logo", "product*"],
  "avoid": ["confetti", "hearts", "flare"],
  "notes": "Orange is the brand colour. Logo never moves. The cup is the hero: no distortion."
}
```

| key | effect |
|---|---|
| `palette.accent`, `accent2`, `light` | colours for particles (dust, sparks, stars, bokeh, confetti, bubbles), glows and light leaks. Keep one accent (60-30-10 rule): `accent2`/`light` should be tints of it or white, not a second hue |
| `defaults` | used when the CLI flag is not given: `profile`, `mood`, `structure`, `duration` (loop length for intro-loop), `intro`, `intensity`, `speed`, `density`, `formats` (final render) |
| `protect` | layer ids or roles (`*` wildcard) that keep only light and intro effects — no motion. Put recognisable brand markers here (a mascot, a signature prop) so they are never distorted or covered |
| `avoid` | overlay types or particle kinds never to use |
| `notes` | rules for the agent in plain words; read them before planning motion |

Questions the kit already answers are skipped in the brief. A CLI flag always wins over
the kit, and the kit never overrides the safety rules (prices/legal locked, flash limit).

**Creating a kit:** after a job the user liked, offer to save one — palette from the
scene's colours, defaults from the choices made, `protect` from what they asked not to move,
`notes` from their comments ("logo never moves", "no pink").
