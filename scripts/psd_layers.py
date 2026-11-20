#!/usr/bin/env python3
"""Export a layered PSD into PNG layers + layers.json for oleg-motion.

  python psd_layers.py design.psd --out DIR [--flatten-groups] [--include-hidden]

Each visible top-level layer (or each group, with --flatten-groups) becomes one RGBA PNG
cropped to its bounds. Roles are guessed from layer names (bg, product, title, price, logo,
cta, legal ...) and type layers keep their text in the "note" field. Layer effects that
psd-tools cannot composite (some styles) are rendered as plain pixels — check preview.png.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROLE_RULES = [
    (r"^(bg|back|background|фон|plate)|background|backdrop", "background"),
    (r"price|ціна|цена|sale|discount|знижк|скидк|%", "price"),
    (r"legal|terms|умови|услови|date|дата|disclaimer", "legal"),
    (r"logo|лого", "logo"),
    (r"cta|button|кнопк|btn", "cta"),
    (r"text|title|headline|заголов|текст|copy|slogan", "text"),
    (r"fg|foreground|передн|overlay|leaf|лист", "foreground"),
    (r"subject|product|товар|model|person|людин|hero|object", "subject"),
]
DEPTH = {"background": 0.05, "decor": 0.4, "subject": 0.6, "foreground": 0.95, "text": 0.7, "logo": 0.7, "cta": 0.7, "price": 0.7, "legal": 0.7}


def guess_role(name, kind):
    n = name.lower()
    for rx, role in ROLE_RULES:
        if re.search(rx, n):
            return role
    if kind == "type":
        return "text"
    return "decor"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("psd")
    ap.add_argument("--out", required=True)
    ap.add_argument("--flatten-groups", action="store_true", help="export each top-level group as one layer")
    ap.add_argument("--include-hidden", action="store_true")
    a = ap.parse_args()
    try:
        from psd_tools import PSDImage
    except ImportError:
        sys.exit("psd-tools is not installed. Run: scripts/setup.sh --psd")

    psd = PSDImage.open(a.psd)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    W, H = psd.width, psd.height
    items = []

    def visit(layer, depth_in_tree=0):
        if not (layer.visible or a.include_hidden):
            return
        if layer.is_group() and not a.flatten_groups:
            for ch in layer:
                visit(ch, depth_in_tree + 1)
            return
        items.append(layer)

    for layer in psd:
        visit(layer)

    layers = []
    for i, layer in enumerate(items):
        img = layer.composite()
        if img is None or layer.bbox == (0, 0, 0, 0):
            continue
        x1, y1, x2, y2 = layer.bbox
        safe = re.sub(r"[^\w-]+", "_", layer.name).strip("_")[:40] or f"layer{i}"
        fname = f"{i:02d}_{safe}.png"
        img.convert("RGBA").save(out / fname)
        role = guess_role(layer.name, layer.kind)
        entry = {"id": f"{safe}_{i}", "src": fname, "role": role, "x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1, "depth": DEPTH[role], "z": len(layers), "psdName": layer.name}
        if layer.kind == "type":
            try:
                entry["note"] = layer.text
            except Exception:  # noqa: BLE001
                pass
        if layer.blend_mode and str(layer.blend_mode).split(".")[-1].lower() not in ("normal", "pass_through"):
            entry["blendHint"] = str(layer.blend_mode).split(".")[-1].lower()
        layers.append(entry)
        print(f"  {role:10s} {layer.name}", file=sys.stderr)

    if layers and layers[0]["role"] != "background" and layers[0]["w"] >= W * 0.95 and layers[0]["h"] >= H * 0.95:
        layers[0]["role"] = "background"
        layers[0]["depth"] = DEPTH["background"]
    psd.composite().convert("RGB").save(out / "preview.png")
    meta = {"source": {"w": W, "h": H}, "input": str(Path(a.psd).resolve()), "layers": layers}
    (out / "layers.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(out / "layers.json")


if __name__ == "__main__":
    main()
