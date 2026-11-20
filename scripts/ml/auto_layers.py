#!/usr/bin/env python3
"""Split a flat image into animation layers.

  python auto_layers.py INPUT.jpg --out DIR [--no-text] [--no-subject] [--no-depth] [--no-inpaint]
                        [--text-lang uk-UA,en-US] [--subject-min 0.03]

Writes into DIR:
  background.png   the plate with subject/text removed and the holes inpainted
  subject.png      cut-out of the main subject (RGBA, cropped to its box)
  text_N.png       one RGBA layer per text block (cropped), role guessed: text/price/legal/cta
  depth.png        relative depth map of the whole image (white = near)
  layers.json      layer list for `oleg-motion scene --layers`
  preview.png      colour-coded masks to eyeball the split

Every step degrades gracefully: a missing model or package skips that step and says so,
and the result is still a valid layers.json (at worst a single background layer).
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
import models  # noqa: E402

LOG = []


def log(msg):
    LOG.append(msg)
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------- text
PRICE_RE = re.compile(r"(\d\s*%|%|₴|грн|uah|\$|€|£|zł|руб|\d+[.,]\d{2}\b|-\s*\d{1,2}\s*%)", re.I)
DATE_RE = re.compile(r"\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b")
CTA_RE = re.compile(r"(купи|замов|до каталогу|детальн|дізнат|перейти|shop|buy|order|learn more|more|подробн|заказ|в каталог|get|try|sign up)", re.I)


def detect_text(path, W, H, langs):
    try:
        from ocrmac import ocrmac
    except Exception:  # noqa: BLE001
        log("text: skipped (ocrmac not available — macOS only; pass text boxes manually if needed)")
        return []
    try:
        ann = ocrmac.OCR(str(path), recognition_level="accurate", language_preference=langs).recognize()
    except Exception as e:  # noqa: BLE001
        log(f"text: OCR failed ({e})")
        return []
    boxes = []
    for text, conf, (x, y, w, h) in ann:
        if conf < 0.3 or not text.strip():
            continue
        # Vision boxes are normalized with a bottom-left origin.
        boxes.append({"text": text.strip(), "x": x * W, "y": (1 - y - h) * H, "w": w * W, "h": h * H, "conf": conf})
    log(f"text: {len(boxes)} lines found")
    return boxes


def group_lines(lines):
    """Merge OCR lines that belong to one visual block (stacked headline, price + %, ...)."""
    blocks = []
    for ln in sorted(lines, key=lambda b: (b["y"], b["x"])):
        placed = False
        for bl in blocks:
            gap_y = ln["y"] - (bl["y"] + bl["h"])
            overlap_x = min(bl["x"] + bl["w"], ln["x"] + ln["w"]) - max(bl["x"], ln["x"])
            size_ratio = max(ln["h"], bl["lh"]) / max(1, min(ln["h"], bl["lh"]))
            if gap_y < 0.6 * max(ln["h"], bl["lh"]) and overlap_x > -0.3 * min(ln["w"], bl["w"]) and size_ratio < 1.8:
                x1, y1 = min(bl["x"], ln["x"]), min(bl["y"], ln["y"])
                x2, y2 = max(bl["x"] + bl["w"], ln["x"] + ln["w"]), max(bl["y"] + bl["h"], ln["y"] + ln["h"])
                bl.update(x=x1, y=y1, w=x2 - x1, h=y2 - y1, lh=max(bl["lh"], ln["h"]))
                bl["text"] += "\n" + ln["text"]
                bl["lines"].append(ln)
                placed = True
                break
        if not placed:
            blocks.append({**ln, "lh": ln["h"], "lines": [ln]})
    return blocks


def classify(block, H):
    t = block["text"]
    if DATE_RE.search(t) or block["lh"] < 0.022 * H:  # dates/periods before prices: "20.10.2026" is not a price
        return "legal"
    if PRICE_RE.search(t):
        return "price"
    if CTA_RE.search(t) and len(t) < 40:
        return "cta"
    return "text"


def text_mask(img, block, seg_session):
    """Pixel mask of one text block: segmentation of the padded crop, refined by colour contrast."""
    W, H = img.size
    pad_x, pad_y = block["lh"] * 0.45, block["lh"] * 0.45
    x1, y1 = int(max(0, block["x"] - pad_x)), int(max(0, block["y"] - pad_y))
    x2, y2 = int(min(W, block["x"] + block["w"] + pad_x)), int(min(H, block["y"] + block["h"] + pad_y))
    crop = img.crop((x1, y1, x2, y2))
    arr = np.asarray(crop).astype(np.float32)
    m_col, color, tol, cover = glyph_seed(arr, block, x1, y1)
    if cover > 0.55:  # the box is mostly one colour → a button/badge plate, not letters
        pm = plate_mask(np.asarray(img), block, color, tol)
        if pm is not None:
            ys, xs = np.nonzero(pm)
            return pm, (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    m = m_col
    if seg_session is not None:
        try:
            from rembg import remove
            import cv2
            a = np.asarray(remove(crop, session=seg_session, only_mask=True)).astype(np.float32) / 255.0
            if 0.05 < a.mean() < 0.9 and m_col.any():
                # segmentation adds 3D extrusions, outlines and shadows — but only right next to the
                # glyph colour; on its own it also grabs trunks, leaves or products beside the text
                k = max(3, int(block["lh"] * 0.18)) | 1
                near = cv2.dilate(m_col, np.ones((k, k), np.uint8)) > 0
                m = np.maximum(np.where(near, a, 0), m_col)
        except Exception as e:  # noqa: BLE001
            log(f"text: segmentation refine failed ({e})")
    m = keep_near_glyphs(m, block, x1, y1)
    full = np.zeros((H, W), np.float32)
    full[y1:y2, x1:x2] = m
    return full, (x1, y1, x2, y2)


def glyph_seed(arr, block, ox, oy):
    """Pixels of the glyph colour. Busy photo backgrounds break 'differs from the border colour',
    so find the text colour itself: k-means inside the OCR line boxes, take the cluster that is
    farthest from the local background and big enough to be letters (or a CTA pill)."""
    import cv2
    h, w, _ = arr.shape
    border = np.concatenate([arr[0], arr[-1], arr[:, 0], arr[:, -1]])
    bg = np.median(border, axis=0)
    inside = np.zeros((h, w), bool)
    for ln in block.get("lines", [block]):
        bx1, by1 = int(max(0, ln["x"] - ox)), int(max(0, ln["y"] - oy))
        bx2, by2 = int(min(w, ln["x"] + ln["w"] - ox)), int(min(h, ln["y"] + ln["h"] - oy))
        inside[by1:by2, bx1:bx2] = True
    px = arr[inside].reshape(-1, 3)
    if len(px) < 50:
        return np.zeros((h, w), np.float32)
    K = 4
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
    _, lab, centers = cv2.kmeans(px.astype(np.float32), K, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    share = np.bincount(lab.ravel(), minlength=K) / len(px)
    score = [np.linalg.norm(c - bg) if share[i] >= 0.06 else -1 for i, c in enumerate(centers)]
    c = centers[int(np.argmax(score))]
    gap = np.linalg.norm(c - bg)
    tol = max(30.0, 0.4 * gap)
    seed = (np.linalg.norm(arr - c, axis=2) < tol) & inside
    seed = cv2.morphologyEx(seed.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return seed.astype(np.float32), c, tol, seed[inside].mean() if inside.any() else 0


def plate_mask(rgb, block, color, tol):
    """A CTA button / price badge: the 'glyph colour' is really a plate behind the text.
    Grow it over the whole image near the text, take the piece under the text and fill its holes
    (the letters), so the layer is the complete button."""
    import cv2
    H, W, _ = rgb.shape
    lh = block["lh"]
    x1, y1 = int(max(0, block["x"] - 4 * lh)), int(max(0, block["y"] - 1.5 * lh))
    x2, y2 = int(min(W, block["x"] + block["w"] + 4 * lh)), int(min(H, block["y"] + block["h"] + 1.5 * lh))
    reg = rgb[y1:y2, x1:x2].astype(np.float32)
    close = (np.linalg.norm(reg - color, axis=2) < tol).astype(np.uint8)
    close = cv2.morphologyEx(close, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(close, connectivity=8)
    cx, cy = int(block["x"] + block["w"] / 2 - x1), int(block["y"] + block["h"] / 2 - y1)
    # the component that covers most of the text box
    box = lab[int(block["y"] - y1):int(block["y"] + block["h"] - y1), int(block["x"] - x1):int(block["x"] + block["w"] - x1)]
    ids, cnt = np.unique(box[box > 0], return_counts=True)
    if not len(ids):
        return None
    comp = (lab == ids[np.argmax(cnt)]).astype(np.uint8)
    cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cs, -1, 1, thickness=-1)
    # a "plate" that grew into a whole background area is not a plate
    if filled.sum() > 12 * block["w"] * block["h"]:
        return None
    full = np.zeros((H, W), np.float32)
    full[y1:y2, x1:x2] = filled
    return full


def keep_near_glyphs(m, block, ox, oy):
    """Drop mask pieces that are not text: segmentation of a crop also grabs the most salient
    thing next to the text (a leaf, a hand, a product). Keep only connected pieces that lie
    mostly inside the OCR line boxes (slightly grown to include 3D extrusions and shadows)."""
    import cv2
    h, w = m.shape
    boxes = np.zeros((h, w), np.uint8)
    for ln in block.get("lines", [block]):
        g = 0.2 * ln["h"]
        bx1, by1 = int(max(0, ln["x"] - g - ox)), int(max(0, ln["y"] - g - oy))
        bx2, by2 = int(min(w, ln["x"] + ln["w"] + g - ox)), int(min(h, ln["y"] + ln["h"] + g - oy))
        boxes[by1:by2, bx1:bx2] = 1
    n, lab, stats, _ = cv2.connectedComponentsWithStats((m > 0.5).astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    for i in range(1, n):
        comp = lab == i
        area = stats[i, cv2.CC_STAT_AREA]
        if area and boxes[comp].mean() >= 0.6:
            keep[i] = True
    hard = keep[lab]
    # keep soft edges around kept pieces only
    near = cv2.dilate(hard.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    return np.where(near & (boxes > 0), m, 0).astype(np.float32)


# ---------------------------------------------------------------- subject
def subject_mask(img, session):
    from rembg import remove
    a = np.asarray(remove(img, session=session, only_mask=True)).astype(np.float32) / 255.0
    return a


# ---------------------------------------------------------------- inpainting
def inpaint(img, hole):
    """Fill hole (bool HxW) — LaMa ONNX per region, OpenCV Telea as fallback."""
    import cv2
    rgb = np.asarray(img).copy()
    if not hole.any():
        return rgb, "none"
    try:
        sess = models.ort_session(models.ensure("lama", quiet=True))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(hole.astype(np.uint8), 8)
        out = rgb.copy()
        H, W = hole.shape
        big = np.zeros((H, W), bool)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if area < 16:
                continue
            if area > 0.03 * H * W:
                # LaMa sees almost only hole in a crop this size and invents grey texture;
                # such holes sit under photos/cards and are barely visible → smooth fill below
                big |= labels == i
                continue
            side = int(max(w, h) * 1.8) + 32
            cx, cy = x + w // 2, y + h // 2
            x1, y1 = max(0, cx - side // 2), max(0, cy - side // 2)
            x2, y2 = min(W, x1 + side), min(H, y1 + side)
            x1, y1 = max(0, x2 - side), max(0, y2 - side)
            crop = out[y1:y2, x1:x2]
            # mask every hole inside the crop, not only this one: otherwise LaMa copies content
            # of a neighbouring, not-yet-filled hole (e.g. the frame of the next photo card)
            mcrop = (labels[y1:y2, x1:x2] >= i).astype(np.float32)
            ci = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
            cm = (cv2.resize(mcrop, (512, 512), interpolation=cv2.INTER_NEAREST) > 0.5).astype(np.float32)
            ci = ci * (1 - cm[..., None])  # this ONNX export does not blank the hole itself
            feed = {sess.get_inputs()[0].name: ci.transpose(2, 0, 1)[None], sess.get_inputs()[1].name: cm[None, None]}
            res = sess.run(None, feed)[0][0].transpose(1, 2, 0)
            if res.max() <= 1.5:
                res = res * 255.0
            res = cv2.resize(np.clip(res, 0, 255).astype(np.uint8), (x2 - x1, y2 - y1), interpolation=cv2.INTER_LANCZOS4)
            soft = cv2.GaussianBlur(mcrop, (0, 0), 2)[..., None]
            out[y1:y2, x1:x2] = (res * soft + crop * (1 - soft)).astype(np.uint8)
        if big.any():
            f = 8
            sw, sh = max(8, W // f), max(8, H // f)
            small = cv2.resize(out, (sw, sh), interpolation=cv2.INTER_AREA)
            # any low-res pixel touching the hole is a hole pixel, or thin bright edges leak in
            cover = cv2.resize(big.astype(np.float32), (sw, sh), interpolation=cv2.INTER_AREA) > 0.001
            hs = cv2.dilate(cover.astype(np.uint8), np.ones((3, 3), np.uint8))
            filled = cv2.inpaint(small, hs * 255, 5, cv2.INPAINT_TELEA)
            up = cv2.GaussianBlur(cv2.resize(filled, (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
            soft = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 3)[..., None]
            out = (up * soft + out * (1 - soft)).astype(np.uint8)
        return out, "lama"
    except Exception as e:  # noqa: BLE001
        log(f"inpaint: LaMa unavailable ({e}); using OpenCV Telea")
        filled = cv2.inpaint(rgb, hole.astype(np.uint8) * 255, 7, cv2.INPAINT_TELEA)
        blur = cv2.GaussianBlur(filled, (0, 0), 6)
        m = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 3)[..., None]
        return (blur * m + filled * (1 - m)).astype(np.uint8), "telea"


# ---------------------------------------------------------------- depth
def depth_map(img):
    import cv2
    sess = models.ort_session(models.ensure("depth", quiet=True))
    W, H = img.size
    scale = 518 / max(W, H)
    w, h = max(14, int(round(W * scale / 14)) * 14), max(14, int(round(H * scale / 14)) * 14)
    x = np.asarray(img.resize((w, h), Image.BICUBIC)).astype(np.float32) / 255.0
    x = (x - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])
    out = sess.run(None, {sess.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0]
    d = np.squeeze(out).astype(np.float32)
    d = (d - d.min()) / max(1e-6, d.max() - d.min())  # relative inverse depth: 1 = near
    d = cv2.resize(d, (W, H), interpolation=cv2.INTER_CUBIC)
    # edge-aware smoothing so depth steps follow image edges (less stretching at borders)
    guide = np.asarray(img.convert("L")).astype(np.float32) / 255.0
    try:
        d = cv2.ximgproc.guidedFilter(guide, d, 8, 1e-3)  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        d = cv2.bilateralFilter(d, 9, 0.1, 9)
    return np.clip(d, 0, 1)


# ---------------------------------------------------------------- helpers
def crop_rgba(rgb, alpha, pad=4):
    ys, xs = np.where(alpha > 0.02)
    if not len(xs):
        return None, None
    H, W = alpha.shape
    x1, y1 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x2, y2 = min(W, xs.max() + pad + 1), min(H, ys.max() + pad + 1)
    rgba = np.dstack([rgb[y1:y2, x1:x2], (alpha[y1:y2, x1:x2] * 255).astype(np.uint8)])
    return Image.fromarray(rgba, "RGBA"), (int(x1), int(y1), int(x2 - x1), int(y2 - y1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-text", action="store_true")
    ap.add_argument("--no-subject", action="store_true")
    ap.add_argument("--no-depth", action="store_true")
    ap.add_argument("--no-inpaint", action="store_true", help="leave cut-outs in the plate (cheaper, but parallax shows doubles)")
    ap.add_argument("--text-lang", default="uk-UA,en-US,ru-RU")
    ap.add_argument("--subject-min", type=float, default=0.03, help="ignore subjects smaller than this share of the image")
    a = ap.parse_args()

    import cv2
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    img = ImageOps.exif_transpose(Image.open(a.input)).convert("RGB")
    W, H = img.size
    rgb = np.asarray(img)
    log(f"input {W}×{H}")

    seg = None
    if not (a.no_subject and a.no_text):
        try:
            from rembg import new_session
            seg = new_session(models.REMBG_MODEL)
        except Exception as e:  # noqa: BLE001
            log(f"subject: rembg unavailable ({e})")

    layers = []
    occupied = np.zeros((H, W), np.float32)

    # text blocks first: they are protected and must not end up inside the subject
    text_layers = []
    if not a.no_text:
        tmp = out / "_ocr_input.png"
        img.save(tmp)
        lines = detect_text(tmp, W, H, a.text_lang.split(","))
        tmp.unlink(missing_ok=True)
        for i, bl in enumerate(group_lines(lines)):
            m, _ = text_mask(img, bl, seg)
            m = cv2.GaussianBlur(cv2.dilate(m, np.ones((3, 3), np.uint8)), (0, 0), 0.8)
            role = classify(bl, H)
            pil, box = crop_rgba(rgb, m)
            if pil is None:
                continue
            name = f"text_{i + 1}.png"
            pil.save(out / name)
            occupied = np.maximum(occupied, m)
            text_layers.append({"id": f"{role}_{i + 1}", "src": name, "role": role, "x": box[0], "y": box[1], "w": box[2], "h": box[3], "text": bl["text"]})
            log(f"  {role:6s} {bl['text'][:60]!r}")

    # subject
    subj = None
    if not a.no_subject and seg is not None:
        try:
            s = subject_mask(img, seg)
            s = np.clip(s - occupied * 1.2, 0, 1)
            share = float((s > 0.5).mean())
            if a.subject_min <= share <= 0.85:
                subj = s
                log(f"subject: {share:.0%} of the image")
            else:
                log(f"subject: ignored ({share:.0%} of the image)")
        except Exception as e:  # noqa: BLE001
            log(f"subject: failed ({e})")

    # depth
    depth = None
    if not a.no_depth:
        try:
            depth = depth_map(img)
            Image.fromarray((depth * 255).astype(np.uint8)).save(out / "depth.png")
            log("depth: ok")
        except Exception as e:  # noqa: BLE001
            log(f"depth: skipped ({e})")

    # background plate
    hole = occupied > 0.3
    if subj is not None:
        hole |= subj > 0.4
    hole = cv2.dilate(hole.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    if a.no_inpaint or not hole.any():
        plate, how = rgb, "none"
    else:
        plate, how = inpaint(img, hole)
    log(f"background: inpaint={how}")
    Image.fromarray(plate).save(out / "background.png")
    layers.append({"id": "background", "src": "background.png", "role": "background", "x": 0, "y": 0, "w": W, "h": H, "depth": 0.05, "z": 0, **({"depthMap": "depth.png"} if depth is not None else {})})

    z = 1
    if subj is not None:
        pil, box = crop_rgba(rgb, subj)
        if pil is not None:
            pil.save(out / "subject.png")
            d = 0.6
            if depth is not None:
                d = float(np.clip(0.35 + 0.6 * depth[subj > 0.5].mean(), 0.35, 0.95))
            layers.append({"id": "subject", "src": "subject.png", "role": "subject", "x": box[0], "y": box[1], "w": box[2], "h": box[3], "depth": round(d, 2), "z": z})
            z += 1
    for tl in text_layers:
        layers.append({**tl, "depth": 0.7, "z": z})
        z += 1

    # preview: background dimmed, subject green, text blue/price red
    prev = (np.asarray(img).astype(np.float32) * 0.45)
    if subj is not None:
        prev[subj > 0.5] = prev[subj > 0.5] * 0.4 + np.array([60, 220, 90]) * 0.6
    colors = {"text": [70, 140, 255], "price": [255, 70, 70], "legal": [200, 120, 255], "cta": [255, 200, 40]}
    for tl in text_layers:
        x, y, w, h = tl["x"], tl["y"], tl["w"], tl["h"]
        al = np.asarray(Image.open(out / tl["src"]))[..., 3] > 60
        reg = prev[y:y + h, x:x + w]
        reg[al] = reg[al] * 0.3 + np.array(colors[tl["role"]]) * 0.7
    Image.fromarray(np.clip(prev, 0, 255).astype(np.uint8)).save(out / "preview.png")

    meta = {"source": {"w": W, "h": H}, "input": str(Path(a.input).resolve()), "layers": layers, "log": LOG}
    (out / "layers.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    log(f"layers.json → {out / 'layers.json'}")
    print(out / "layers.json")


if __name__ == "__main__":
    main()
