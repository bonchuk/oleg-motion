#!/usr/bin/env python3
"""Cut layers out of a flat image by regions you describe (boxes or polygons).

Use it when auto-layers guesses wrong — designed creatives with cards, buttons, arrows,
photos with heads popping out of a frame — or whenever you already know the layout.

    python cut_regions.py regions.json --out work/layers

regions.json:
{
  "input": "creative.png",
  "layers": [
    {"id": "logo",    "role": "logo",    "box": [930, 145, 300, 170], "mask": "contrast"},
    {"id": "title",   "role": "text",    "box": [115, 700, 1930, 295], "mask": "contrast"},
    {"id": "photo_1", "role": "subject", "poly": [[0,1914],[997,1914],[997,2700],[0,2700]],
     "mask": "full", "radius": 22, "popout": 220},
    {"id": "badge",   "role": "decor",   "box": [...], "mask": "seg"}
  ]
}

mask modes
  contrast  pixels that differ from the box's border colour (text, logos, lines, arrows on a
            plain or dark background). Soft alpha + colour un-mixing → clean edges when moved.
  full      the whole box/polygon (photos, cards, stickers). "radius" rounds the corners.
            "popout": N also adds the segmented person/object sticking out up to N px above
            the polygon (a head over the frame of a photo card).
  seg       background-removal model inside the box (a product or person on a busy photo).
  color     a flat design colour ("color": "#80ffff", "tolerance": 60) — text, outlines, arrows.
            The alpha is solved exactly against the inpainted background, so anti-aliased
            edges come out clean even on a busy photo.
"holeGrow": N also inpaints N px around the layer in the background — use it when the design
has a drop shadow or glow around text, or the shadow stays behind as a ghost (re-create the
shadow with a dark `glow` effect on the layer if it matters).
"under": ["id"] puts an element beneath another layer it is partly hidden by in the design
(a button behind a shoulder): it loses the covered pixels and is stacked below that layer.
List it after that layer so the layer is restored without it.
"restore": true on a layer cuts it from an image where every later (front) layer is removed
and inpainted first: the runner behind a button stays whole while the button pops in later.
Layers are listed back to front; later layers own the pixels they cover. The background is
the input with every layer removed and the holes inpainted (LaMa), so layers can move.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
import auto_layers as A  # noqa: E402  (inpaint, crop_rgba, log)
import models  # noqa: E402


def poly_mask(H, W, pts, radius=0):
    import cv2
    ss = 4  # supersample for anti-aliased edges
    p = np.asarray(pts, np.float32)
    pad = 4
    x0, y0 = int(max(0, np.floor(p[:, 0].min()) - pad)), int(max(0, np.floor(p[:, 1].min()) - pad))
    x1, y1 = int(min(W, np.ceil(p[:, 0].max()) + pad)), int(min(H, np.ceil(p[:, 1].max()) + pad))
    full = np.zeros((H, W), np.float32)
    if x1 <= x0 or y1 <= y0:
        return full
    big = np.zeros(((y1 - y0) * ss, (x1 - x0) * ss), np.uint8)
    cv2.fillPoly(big, [np.round((p - [x0, y0]) * ss).astype(np.int32)], 255)
    if radius > 0:  # round convex corners = morphological opening, done with distance transforms
        r = radius * ss
        inner = cv2.distanceTransform((big > 0).astype(np.uint8), cv2.DIST_L2, 5) > r
        big = ((cv2.distanceTransform((~inner).astype(np.uint8), cv2.DIST_L2, 5) <= r) * 255).astype(np.uint8)
    full[y0:y1, x0:x1] = cv2.resize(big.astype(np.float32) / 255.0, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    return full


def hex_rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def color_hard(rgb, box, color, tol):
    """Pixels of a known flat colour (text/outline/arrow of a design) inside the box."""
    import cv2
    x1, y1, x2, y2 = box
    full = np.zeros(rgb.shape[:2], np.float32)
    d = np.linalg.norm(rgb[y1:y2, x1:x2].astype(np.float32) - color, axis=2)
    hard = (d < tol).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    full[y1:y2, x1:x2] = cv2.dilate(hard, np.ones((5, 5), np.uint8))  # include anti-aliased rim
    return full


def color_matte(rgb, under, region, color):
    """Exact alpha for a flat-coloured element over a known background:
    pixel = C·a + B·(1−a)  →  a = (P−B)·(C−B) / |C−B|².  B = what lies underneath (inpainted)."""
    P = rgb.astype(np.float32)
    B = under.astype(np.float32)
    CB = color - B
    den = np.maximum((CB * CB).sum(2), 1.0)
    a = np.clip(((P - B) * CB).sum(2) / den, 0, 1)
    weak = den < 40.0 ** 2  # colour too close to the background → keep the hard key there
    a = np.where(weak, region, a) * (region > 0)
    return a.astype(np.float32)


def box_of(L, W, H):
    if "box" in L:
        x, y, w, h = L["box"]
    else:
        p = np.asarray(L["poly"], np.float32)
        x, y = p[:, 0].min(), p[:, 1].min()
        w, h = p[:, 0].max() - x, p[:, 1].max() - y
    x1, y1 = int(max(0, x)), int(max(0, y))
    x2, y2 = int(min(W, x + w)), int(min(H, y + h))
    return x1, y1, x2, y2


def contrast_mask(rgb, box, lo=None):
    """Soft alpha for content over a fairly uniform local background + un-mixed colours."""
    x1, y1, x2, y2 = box
    arr = rgb[y1:y2, x1:x2].astype(np.float32)
    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    bg = np.median(border, axis=0)
    d = np.linalg.norm(arr - bg, axis=2)
    noise = float(np.percentile(np.linalg.norm(border - bg, axis=1), 90))
    lo = max(12.0, noise * 1.2) if lo is None else lo
    hi = max(lo + 30.0, float(np.percentile(d[d > lo], 90)) if (d > lo).any() else lo + 30.0)
    alpha = np.clip((d - lo) / (hi - lo), 0, 1)
    # un-mix: the pixel is fg*alpha + bg*(1-alpha) → recover fg so edges don't carry a dark halo
    a = np.maximum(alpha, 1e-3)[..., None]
    fg = np.clip(bg + (arr - bg) / a, 0, 255)
    fg = np.where(alpha[..., None] > 0.02, fg, arr)
    return alpha, fg.astype(np.uint8)


def seg_mask(img, box, session):
    from rembg import remove
    x1, y1, x2, y2 = box
    crop = img.crop((x1, y1, x2, y2))
    return np.asarray(remove(crop, session=session, only_mask=True)).astype(np.float32) / 255.0


def close_gaps(hole):
    """Grow the hole a little and swallow thin slivers of background between neighbouring layers
    (the gap between two photo cards): left as is, they show up as stray lines once layers move."""
    import cv2
    H, W = hole.shape
    k = max(9, int(0.02 * min(H, W))) | 1
    h = hole.astype(np.uint8)
    closed = cv2.morphologyEx(h, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    return cv2.dilate(closed, np.ones((9, 9), np.uint8)) > 0


def over_beneath(rgb, alpha, colour, under_alpha):
    """Inside an element that lies UNDER the person (a button behind a shoulder) the person is
    whatever does not look like the element: learn the element's palette where it is clearly
    visible, then keep only pixels far from that palette. Pixels come from the original."""
    import cv2
    area = under_alpha > 0.5
    if not area.any():
        return alpha, colour
    person = cv2.dilate((alpha > 0.5).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
    sample = rgb[area & ~person].reshape(-1, 3).astype(np.float32)
    if len(sample) < 100:
        return alpha, colour
    if len(sample) > 20000:
        sample = sample[np.random.default_rng(0).choice(len(sample), 20000, replace=False)]
    K = 5
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, _, centers = cv2.kmeans(sample, K, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    px = rgb.astype(np.float32)
    dmin = np.min(np.stack([np.linalg.norm(px - c, axis=2) for c in centers]), axis=0)
    a = np.clip((dmin - 30.0) / 40.0, 0, 1)
    a = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) * a
    # only pieces connected to the person outside the element
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0.5).astype(np.uint8), connectivity=8)
    touch = cv2.dilate(((alpha > 0.5) & ~area).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    ok = np.zeros(n, bool)
    for i in range(1, n):
        if touch[lab == i].any():
            ok[i] = True
    a = np.where(cv2.dilate(ok[lab].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0, a, 0)
    alpha = np.where(area, a, alpha).astype(np.float32)
    colour = np.where(area[..., None], rgb, colour)
    return alpha, colour


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("regions")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-inpaint", action="store_true")
    a = ap.parse_args()

    spec_path = Path(a.regions).resolve()
    spec = json.loads(spec_path.read_text())
    src = (spec_path.parent / spec["input"]).resolve()
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    W, H = img.size
    rgb = np.asarray(img).copy()
    A.log(f"input {W}×{H}, {len(spec['layers'])} regions")

    state = {"session": None}

    def compute(L, image_rgb):
        image = Image.fromarray(image_rgb)
        box = box_of(L, W, H)
        x1, y1, x2, y2 = box
        full = np.zeros((H, W), np.float32)
        col = image_rgb.copy()
        mode = L.get("mask", "contrast")
        if mode == "contrast":
            al, fg = contrast_mask(image_rgb, box, L.get("threshold"))
            full[y1:y2, x1:x2] = al
            col[y1:y2, x1:x2] = fg
        elif mode == "color":
            C = hex_rgb(L["color"])
            full = color_hard(image_rgb, box, C, float(L.get("tolerance", 60)))
            col[:] = C.astype(np.uint8)
        elif mode in ("full", "seg"):
            if mode == "full":
                pts = L.get("poly") or [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                full = poly_mask(H, W, pts, int(L.get("radius", 0)))
            if mode == "seg" or L.get("popout"):
                if state["session"] is None:
                    from rembg import new_session
                    state["session"] = new_session(models.REMBG_MODEL)
                up = int(L.get("popout", 0)) if mode == "full" else 0
                sb = (x1, max(0, y1 - up), x2, y2)
                sm = np.zeros((H, W), np.float32)
                sm[sb[1]:sb[3], sb[0]:sb[2]] = seg_mask(image, sb, state["session"])
                if mode == "seg":
                    full = sm
                else:  # keep only what sticks out of the card and touches it
                    import cv2
                    outside = sm * (1 - full)
                    outside[outside < 0.5] *= (outside[outside < 0.5] > 0.15)
                    n, lab, st, _ = cv2.connectedComponentsWithStats((outside > 0.5).astype(np.uint8), connectivity=8)
                    touch = cv2.dilate((full > 0.5).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
                    keep = np.zeros(n, bool)
                    for i in range(1, n):
                        if st[i, 4] > 200 and touch[lab == i].any():
                            keep[i] = True
                    near = cv2.dilate(keep[lab].astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
                    full = np.maximum(full, np.where(near, outside, 0))
        else:
            sys.exit(f"unknown mask mode {mode!r} in layer {L.get('id')}")
        return full, col

    layers = spec["layers"]
    alphas, colours = [], []
    for L in layers:
        al, col = compute(L, rgb)
        alphas.append(al)
        colours.append(col)

    # "restore": cut this layer from an image where everything in front of it is removed and
    # inpainted — so a person behind a button is whole while the button is not shown yet
    restored = [False] * len(layers)
    for k, L in enumerate(layers):
        if not L.get("restore"):
            continue
        front = np.zeros((H, W), bool)
        beneath = []  # later-listed elements that the design puts UNDER this layer
        for j in range(k + 1, len(layers)):
            if L.get("id") in layers[j].get("under", []):
                beneath.append(j)
                continue
            front |= alphas[j] > 0.08
        if front.any():
            import cv2
            front = cv2.dilate(front.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
            clean, how = A.inpaint(img, front)
            A.log(f"  restore {L['id']}: elements in front removed ({how})")
            if L.get("mask") == "seg":
                # Where front elements covered the person, decide pixel by pixel: the cleaned
                # (inpainted) image vs a plate with the person removed too. Different → it is the
                # person (a thumb under a letter, hips under a button); same → background (the
                # gap between fingers). Outside the front elements keep the original cut-out.
                # The cut-out model also trims the person where text starts, so the gaps
                # between letters near the person are decided the same way (original pixels).
                g = max(15, int(0.02 * min(H, W))) | 1
                zone = cv2.dilate(front.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * g + 1, 2 * g + 1))) > 0
                keep = alphas[k] * (~front)
                body = cv2.dilate(((alphas[k] > 0.3) | zone).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
                plate, _ = A.inpaint(Image.fromarray(clean), body)
                cand = np.where(front[..., None], clean, rgb).astype(np.float32)
                d = np.linalg.norm(cand - plate.astype(np.float32), axis=2)
                inside = np.clip((d - 25.0) / 35.0, 0, 1) * zone
                inside = np.where(front, inside, np.maximum(inside, alphas[k]))
                # keep only pieces that touch the person
                n, lab, st, _ = cv2.connectedComponentsWithStats((inside > 0.5).astype(np.uint8), connectivity=8)
                touch = cv2.dilate((keep > 0.5).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
                ok = np.zeros(n, bool)
                for i in range(1, n):
                    if st[i, 4] > 30 and touch[lab == i].any():
                        ok[i] = True
                near = cv2.dilate(ok[lab].astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
                alphas[k] = np.maximum(keep * (~zone), np.where(near, inside, 0)).astype(np.float32)
                alphas[k] = np.maximum(alphas[k], keep * zone * (alphas[k] > 0.5))
                colours[k] = clean
                for j in beneath:
                    alphas[k], colours[k] = over_beneath(rgb, alphas[k], colours[k], alphas[j])
            else:
                alphas[k], colours[k] = compute(L, clean)
            restored[k] = True

    # "under": [ids] — this element sits beneath those layers in the design (a button behind a
    # shoulder): drop their pixels from it and stack it below them
    ids = [L.get("id") for L in layers]
    for i, L in enumerate(layers):
        for oid in L.get("under", []):
            if oid in ids:
                alphas[i] = alphas[i] * (1 - alphas[ids.index(oid)])

    # later layers own their pixels: remove them from layers underneath (restored ones stay whole)
    owned = np.zeros((H, W), np.float32)
    for i in range(len(alphas) - 1, -1, -1):
        if not restored[i]:
            alphas[i] = alphas[i] * (1 - owned)
        owned = np.maximum(owned, alphas[i])

    meta = {"source": {"w": W, "h": H}, "input": str(src), "layers": []}
    hole = owned > 0.08
    import cv2
    for L, al in zip(layers, alphas):  # drop shadows / glows around a layer: grow its hole
        g = int(L.get("holeGrow", 0))
        if g > 0:
            hole |= cv2.dilate((al > 0.08).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * g + 1, 2 * g + 1))) > 0
    if not a.no_inpaint and hole.any():
        hole = close_gaps(hole)
        # Big layers (a person, a photo card) and small ones (text, buttons) touching each
        # other merge into one huge hole that only gets a smooth fill. So: fill everything
        # (smooth) first — the person disappears from the context — then let LaMa redo the
        # small holes with real texture around them. The other order makes LaMa extend the
        # person (skin, clothes) into the text holes.
        big = np.zeros((H, W), bool)
        for al, rst in zip(alphas, restored):
            m = al > 0.08
            if m.mean() > 0.03 or rst:
                big |= cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        small = hole & ~big
        if small.any() and big.any():
            first, how = A.inpaint(img, hole)
            bg, how2 = A.inpaint(Image.fromarray(first), small)
            how = f"{how}+{how2}"
        else:
            bg, how = A.inpaint(img, hole)
        A.log(f"background: inpaint={how}")
    else:
        bg = rgb
    Image.fromarray(bg).save(out / "background.png")
    under = bg.astype(np.float32)
    for i, L in enumerate(layers):
        if L.get("mask") == "color":
            alphas[i] = color_matte(rgb, under, alphas[i], hex_rgb(L["color"]))
        under = under * (1 - alphas[i][..., None]) + colours[i].astype(np.float32) * alphas[i][..., None]
    meta["layers"].append({"id": "background", "src": "background.png", "role": "background",
                           "x": 0, "y": 0, "w": W, "h": H, "depth": 0.05, "z": 0})
    preview = bg.astype(np.float32) * 0.45
    zorder = list(range(len(layers)))
    for i, L in enumerate(layers):
        targets = [ids.index(o) for o in L.get("under", []) if o in ids]
        if targets:
            zorder[i] = min(targets) - 0.5
    zrank = {i: r + 1 for r, i in enumerate(sorted(range(len(layers)), key=lambda i: zorder[i]))}
    for i, (L, al, col) in enumerate(zip(layers, alphas, colours)):
        pil, b = A.crop_rgba(col, al)
        if pil is None:
            A.log(f"  {L['id']}: empty mask, skipped")
            continue
        name = f"{L['id']}.png"
        pil.save(out / name)
        entry = {"id": L["id"], "src": name, "role": L.get("role", "decor"),
                 "x": b[0], "y": b[1], "w": b[2], "h": b[3], "z": zrank[i]}
        if "depth" in L:
            entry["depth"] = L["depth"]
        if "note" in L:
            entry["note"] = L["note"]
        meta["layers"].append(entry)
        preview = preview * (1 - al[..., None]) + col.astype(np.float32) * al[..., None]
        A.log(f"  {entry['role']:8s} {L['id']}  {b[2]}×{b[3]}")
    Image.fromarray(np.clip(preview, 0, 255).astype(np.uint8)).save(out / "preview.png")
    (out / "layers.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    A.log(f"layers.json → {out / 'layers.json'}")
    print(out / "layers.json")


if __name__ == "__main__":
    main()
