"""Relettrage d'une planche : remplace le texte des bulles sans toucher au dessin.

Usage : python3 tools/reletter.py <spec.json> <page_source> <page_sortie>

Le fichier spec décrit chaque bloc de texte :
  {"type": "balloon", "seed": [x, y], "text": "...", "max": 24}
      Bulle ou cartouche fermé : l'intérieur clair est retrouvé à partir du point
      `seed`, le texte français est effacé avec la couleur de fond de la bulle,
      puis le texte anglais est centré et ajusté à la forme de la bulle.
  {"type": "typed", "rect": [x0, y0, x1, y1], "lines": [...], "size": 21, ...}
      Texte dactylographié posé sur le papier (pages bis) : les lettres sont
      effacées par retouche (inpainting), puis le texte est retapé ligne à ligne.
Coordonnées en pixels de l'image source.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "assets" / "fonts"
FONTS = {
    "comic": FONT_DIR / "Kalam-Regular.ttf",
    "typewriter": FONT_DIR / "CourierPrime-Regular.ttf",
    "typewriter-bold": FONT_DIR / "CourierPrime-Bold.ttf",
}


def balloon_mask(gray, seed, light=150):
    """Intérieur de la bulle (texte compris) à partir d'un point."""
    h, w = gray.shape
    lightm = (gray >= light).astype(np.uint8)
    x, y = seed
    if not lightm[y, x]:  # point tombé sur une lettre : chercher le clair le plus proche
        ys, xs = np.nonzero(lightm[max(0, y - 25):y + 25, max(0, x - 25):x + 25])
        d = (ys + max(0, y - 25) - y) ** 2 + (xs + max(0, x - 25) - x) ** 2
        i = int(np.argmin(d))
        y, x = int(ys[i] + max(0, y - 25)), int(xs[i] + max(0, x - 25))
    n, lab = cv2.connectedComponents(lightm, connectivity=4)
    comp = (lab == lab[y, x]).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cnts, -1, 1, thickness=cv2.FILLED)
    area = filled.sum()
    if area > 0.15 * h * w:
        raise SystemExit(f"bulle {seed} : la zone déborde ({area} px), vérifier le point")
    return filled, comp


def wrap_in_mask(text, font, mask, line_gap=1.12):
    """Coupe le texte en lignes qui tiennent dans la forme ; renvoie [(ligne, x, y)] ou None."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return None
    cap = -font.getbbox("ÉH", anchor="ls")[1]  # hauteur des capitales accentuées
    lh = int(font.size * line_gap)
    cy = (ys.min() + ys.max()) / 2
    forced = [l.split() for l in text.split("|")] if "|" in text else None
    words = text.replace("|", " ").split()
    rng = [len(forced)] if forced else range(1, len(words) + 1)
    for n in rng:
        top = int(cy - ((n - 1) * lh + cap) / 2)
        spans = []
        for i in range(n):
            band = mask[max(0, top + i * lh): top + i * lh + cap]
            if band.shape[0] == 0:
                spans = None
                break
            cols = np.all(band > 0, axis=0)
            if not cols.any():
                spans = None
                break
            # plus long segment continu de colonnes libres sur toute la hauteur de ligne
            idx = np.nonzero(cols)[0]
            breaks = np.nonzero(np.diff(idx) > 1)[0]
            starts = np.r_[idx[0], idx[breaks + 1]]
            ends = np.r_[idx[breaks], idx[-1]]
            k = int(np.argmax(ends - starts))
            spans.append((starts[k], ends[k]))
        if spans is None:
            continue
        if forced:
            lines = [" ".join(l) for l in forced]
            if any(font.getlength(l) > spans[i][1] - spans[i][0] for i, l in enumerate(lines)):
                return None
            return [(l, (spans[i][0] + spans[i][1]) / 2 - font.getlength(l) / 2, top + i * lh + cap)
                    for i, l in enumerate(lines)]
        lines, cur, li = [], [], 0
        ok = True
        for wd in words:
            trial = " ".join(cur + [wd])
            if li >= n:
                ok = False
                break
            if font.getlength(trial) <= spans[li][1] - spans[li][0]:
                cur.append(wd)
            else:
                if not cur:
                    ok = False
                    break
                lines.append(" ".join(cur))
                cur, li = [wd], li + 1
                if li >= n or font.getlength(wd) > spans[li][1] - spans[li][0]:
                    ok = False
                    break
        if not ok:
            continue
        lines.append(" ".join(cur))
        if len(lines) != n:
            continue
        out = []
        for i, ln in enumerate(lines):
            x0, x1 = spans[i]
            x = (x0 + x1) / 2 - font.getlength(ln) / 2
            out.append((ln, x, top + i * lh + cap))
        return out
    return None


def do_balloon(img, gray, block, draw):
    filled, comp = balloon_mask(gray, block["seed"])
    # couleur de fond : médiane des pixels clairs de la bulle
    rgb = np.array(img)
    bg = np.median(rgb[comp > 0], axis=0).astype(np.uint8)
    # effacer le texte en restant à distance du trait de contour
    inner = cv2.erode(filled, np.ones((5, 5), np.uint8), iterations=1)
    rgb[inner > 0] = bg
    img.paste(Image.fromarray(rgb))
    margin = block.get("margin", 6)
    fit = cv2.erode(filled, np.ones((3, 3), np.uint8), iterations=margin)
    size = block.get("max", 24)
    while size >= 12:
        font = ImageFont.truetype(str(FONTS[block.get("font", "comic")]), size)
        placed = wrap_in_mask(block["text"], font, fit)
        if placed:
            break
        size -= 1
    else:
        raise SystemExit(f"bulle {block['seed']} : le texte ne rentre pas")
    # rendu à 2x avec un léger épaississement (≈ un demi-pixel), puis réduction
    ink = tuple(block.get("ink", (20, 20, 20)))
    big = ImageFont.truetype(font.path, size * 2)
    layer = Image.new("L", (img.width * 2, img.height * 2), 0)
    ld = ImageDraw.Draw(layer)
    for ln, x, y in placed:
        ld.text((x * 2, y * 2), ln, font=big, anchor="ls", fill=255,
                stroke_width=block.get("weight", 1), stroke_fill=255)
    alpha = layer.resize(img.size, Image.LANCZOS)
    img.paste(Image.new("RGB", img.size, ink), (0, 0), alpha)
    return size


def do_typed(img, block, draw):
    x0, y0, x1, y1 = block["rect"]
    rgb = np.array(img)
    region = cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    ink = (region < block.get("ink_threshold", 140)).astype(np.uint8)
    ink = cv2.dilate(ink, np.ones((3, 3), np.uint8), iterations=2)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    sub = cv2.inpaint(bgr[y0:y1, x0:x1], ink * 255, 5, cv2.INPAINT_TELEA)
    bgr[y0:y1, x0:x1] = sub
    img.paste(Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    color = tuple(block.get("color", (28, 25, 22)))
    # chaque ligne : {"text", "y" (ligne de base), option "x", "size", "font", "underline"}
    layer = Image.new("L", (img.width * 2, img.height * 2), 0)
    ld = ImageDraw.Draw(layer)
    for item in block["lines"]:
        size = item.get("size", block["size"])
        font = ImageFont.truetype(str(FONTS[item.get("font", "typewriter")]), size * 2)
        x = item.get("x", block.get("left", x0))
        ld.text((x * 2, item["y"] * 2), item["text"], font=font, anchor="ls", fill=255,
                stroke_width=block.get("weight", 1), stroke_fill=255)
        if item.get("underline") is not None:
            uy = (item["y"] + item.get("underline_offset", 15)) * 2
            w = font.getlength(item["text"]) + item["underline"] * 2
            ld.line([(x * 2, uy), (x * 2 + w, uy)], fill=255, width=item.get("underline_width", 3) * 2)
    alpha = layer.resize(img.size, Image.LANCZOS)
    img.paste(Image.new("RGB", img.size, color), (0, 0), alpha)


def main(spec_path, src, dst):
    spec = json.loads(Path(spec_path).read_text())
    img = Image.open(src).convert("RGB")
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    draw = ImageDraw.Draw(img)
    for block in spec["blocks"]:
        if block["type"] == "balloon":
            s = do_balloon(img, gray, block, draw)
            print(f"  bulle {block['seed']} : corps {s}")
        elif block["type"] == "typed":
            do_typed(img, block, draw)
        draw = ImageDraw.Draw(img)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, quality=92) if dst.endswith(".webp") else img.save(dst)


if __name__ == "__main__":
    main(*sys.argv[1:4])
