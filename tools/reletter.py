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
    "condensed": FONT_DIR / "Oswald-Variable.ttf",
    "script": FONT_DIR / "Caveat-Variable.ttf",
}


def balloon_mask(gray, seed, light=215):
    """Intérieur de la bulle (texte compris) à partir d'un point placé dans le texte.

    Parmi les zones claires tout près du point, on garde la plus grande de taille
    raisonnable (les creux des lettres sont minuscules, le fond de la bulle ne l'est pas).
    """
    h, w = gray.shape
    n, lab, stats, _ = cv2.connectedComponentsWithStats((gray >= light).astype(np.uint8), connectivity=4)
    x, y = seed
    best = None
    for r in (10, 20, 30):
        win = lab[max(0, y - r):y + r, max(0, x - r):x + r]
        cands = []
        for l in np.unique(win):
            if not l:
                continue
            bx, by, bw, bh, area = stats[l]
            touches = bx == 0 or by == 0 or bx + bw == w or by + bh == h  # marges de la page
            if 800 < area < 0.12 * h * w and not touches and bw < 0.75 * w and bh < 0.5 * h:
                cands.append(l)
        if cands:
            best = max(cands, key=lambda l: stats[l, cv2.CC_STAT_AREA])
            break
    if best is None:
        raise ValueError(f"bulle {seed} : aucun fond de bulle trouvé autour du point")
    comp = (lab == best).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cnts, -1, 1, thickness=cv2.FILLED)
    return filled, comp


def caption_rect(gray, seed, half=15):
    """Cartouche rectangulaire : on part du point et on cherche le trait du cadre de chaque côté."""
    h, w = gray.shape
    x, y = seed

    def scan(dx, dy):
        cx, cy = x, y
        while 1 < cx < w - 2 and 1 < cy < h - 2:
            cx += dx
            cy += dy
            line = gray[y - half:y + half, cx] if dx else gray[cy, x - 3 * half:x + 3 * half]
            if (line < 90).mean() > 0.9:
                return cx if dx else cy
        return cx if dx else cy

    x0, x1, y0, y1 = scan(-1, 0), scan(1, 0), scan(0, -1), scan(0, 1)
    filled = np.zeros_like(gray, dtype=np.uint8)
    filled[y0 + 3:y1 - 2, x0 + 3:x1 - 2] = 1
    comp = filled & (gray >= 200)
    return filled, comp


def wrap_in_mask(text, font, mask, line_gap=1.12, align="center", max_lines=None):
    """Coupe le texte en lignes qui tiennent dans la forme ; renvoie [(ligne, x, y)] ou None."""
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        return None
    cap = -font.getbbox("H", anchor="ls")[1]  # hauteur des capitales
    lh = int(font.size * line_gap)
    cy = (ys.min() + ys.max()) / 2
    def xpos(span, ln):
        if align == "left":
            return span[0]
        return (span[0] + span[1]) / 2 - font.getlength(ln) / 2

    forced = [l.split() for l in text.split("|")] if "|" in text else None
    words = text.replace("|", " ").split()
    rng = [len(forced)] if forced else range(1, min(len(words), max_lines or 99) + 1)
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
            return [(l, xpos(spans[i], l), top + i * lh + cap) for i, l in enumerate(lines)]
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
            out.append((ln, xpos(spans[i], ln), top + i * lh + cap))
        return out
    return None


def do_balloon(img, gray, block, draw):
    if "ellipse" in block:  # bulle ouverte (qui touche le bord de la case) : forme donnée à la main
        x0, y0, x1, y1 = block["ellipse"]
        filled = np.zeros_like(gray, dtype=np.uint8)
        cv2.ellipse(filled, ((x0 + x1) // 2, (y0 + y1) // 2), ((x1 - x0) // 2, (y1 - y0) // 2), 0, 0, 360, 1, -1)
        comp = filled & (gray >= 200)
    else:
      try:
        filled, comp = balloon_mask(gray, block["seed"], block.get("light", 215))
      except ValueError:
        if block["type"] != "caption":
            raise
        filled, comp = caption_rect(gray, block["seed"])
    # couleur de fond : médiane des pixels clairs de la bulle
    rgb = np.array(img)
    bg = np.median(rgb[comp > 0], axis=0).astype(np.uint8)
    # effacer le texte en restant à distance du trait de contour
    inner = cv2.erode(filled, np.ones((5, 5), np.uint8), iterations=1)
    rgb[inner > 0] = bg
    img.paste(Image.fromarray(rgb))
    cap = block["type"] == "caption"
    mx = block.get("margin", 12 if cap else 6)
    my = block.get("margin_y", 4 if cap else mx)
    fit = cv2.erode(filled, np.ones((2 * my + 1, 2 * mx + 1), np.uint8))
    size = block.get("max", 21)
    while size >= 12:
        font = ImageFont.truetype(str(FONTS[block.get("font", "comic")]), size)
        placed = wrap_in_mask(block["text"], font, fit, align=block.get("align", "left" if block["type"] == "caption" else "center"), max_lines=block.get("max_lines"))
        if placed:
            break
        size -= 1
    else:
        raise ValueError(f"bulle {block['seed']} : le texte ne rentre pas")
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
    rects = block.get("rects", [block["rect"]] if "rect" in block else [])
    rgb = np.array(img)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    for x0, y0, x1, y1 in rects:
        sub = rgb[y0:y1, x0:x1].astype(np.int16)
        region = cv2.cvtColor(rgb[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
        # encre : nettement plus sombre que le papier autour (fond estimé par un filtre médian) ;
        # les tampons rouges (rouge >> vert) sont épargnés
        paper = cv2.medianBlur(region, 31).astype(np.int16)
        red = (sub[:, :, 0] - sub[:, :, 1]) > 55
        ink = (((paper - region) > block.get("ink_contrast", 28)) & ~red).astype(np.uint8)
        ink = cv2.dilate(ink, np.ones((3, 3), np.uint8), iterations=2)
        bgr[y0:y1, x0:x1] = cv2.inpaint(bgr[y0:y1, x0:x1], ink * 255, 5, cv2.INPAINT_TELEA)
    img.paste(Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    color = tuple(block.get("color", (22, 20, 18)))
    # chaque ligne : {"text", "y" (ligne de base), option "x" (ou "cx" pour centrer), "size", "font", "underline"}
    layer = Image.new("L", (img.width * 2, img.height * 2), 0)
    ld = ImageDraw.Draw(layer)
    lines = []
    last = None  # ligne de base précédente : un paragraphe trop long pousse les suivants vers le bas
    for item in block["lines"]:
        gap = block.get("para_gap", 0.9) * block.get("lh", 28)
        if block.get("flow", True) and last is not None and item["y"] < last + gap + block.get("lh", 28) * 0.6:
            item = {**item, "y": int(last + gap + block.get("lh", 28) * 0.6)}
        if "para" not in item:
            lines.append(item)
            last = item["y"]
            continue
        # paragraphe : coupé automatiquement à la largeur donnée, interligne "lh"
        size = item.get("size", block.get("size", 20))
        f = ImageFont.truetype(str(FONTS[item.get("font", block.get("font", "typewriter"))]), size)
        width = item.get("width", block.get("width", 850))
        lh = item.get("lh", block.get("lh", int(size * 1.35)))
        cur, y = "", item["y"]
        plain = lambda t: t.replace("**", "")
        for word in item["para"].split():
            trial = (cur + " " + word).strip()
            if f.getlength(plain(trial)) > width and cur:
                lines.append({**{k: v for k, v in item.items() if k not in ("para", "y")}, "text": cur, "y": y})
                cur, y = word, y + lh
            else:
                cur = trial
        lines.append({**{k: v for k, v in item.items() if k not in ("para", "y")}, "text": cur, "y": y})
        last = y
    bottom = max(r[3] for r in rects) if rects else None
    if bottom and lines and lines[-1]["y"] > bottom - 4 and lines[-1].get("size", 0) != 15:
        print(f"  ATTENTION texte au-delà de la zone : ligne de base {lines[-1]['y']} > {bottom}")
    for item in lines:
        size = item.get("size", block.get("size", 20))
        fname = item.get("font", block.get("font", "typewriter"))
        font = ImageFont.truetype(str(FONTS[fname]), size * 2)
        bold = ImageFont.truetype(str(FONTS[fname + "-bold" if fname + "-bold" in FONTS else fname]), size * 2)
        # segments en gras entre ** **
        segs, b = [], False
        for k, part in enumerate(item["text"].split("**")):
            if part:
                segs.append((part, b))
            b = not b
        text = item["text"].replace("**", "")
        tw = sum((bold if bb else font).getlength(t) for t, bb in segs)
        if "cx" in item:
            x = item["cx"] - tw / 4
        else:
            x = item.get("x", block.get("left", 0))
        cx = x * 2
        if item.get("angle"):  # ligne inclinée (texte sur une feuille de biais), angle en degrés, sens horaire
            asc, desc = font.getmetrics()
            tmp = Image.new("L", (int(tw) + 20, asc + desc + 20), 0)
            td = ImageDraw.Draw(tmp)
            tx = 10
            for t, bb in segs:
                td.text((tx, asc + 10), t, font=bold if bb else font, anchor="ls", fill=255,
                        stroke_width=item.get("weight", block.get("weight", 0)), stroke_fill=255)
                tx += (bold if bb else font).getlength(t)
            rot = tmp.rotate(-item["angle"], resample=Image.BICUBIC, expand=True)
            # le point (10, asc+10) devient, après rotation avec expand, décalé : on recalcule sa position
            import math
            a = math.radians(item["angle"])
            w0, h0 = tmp.size
            cxr, cyr = w0 / 2, h0 / 2
            px, py = 10 - cxr, asc + 10 - cyr
            rx = px * math.cos(a) - py * math.sin(a) + rot.width / 2
            ry = px * math.sin(a) + py * math.cos(a) + rot.height / 2
            layer.paste(255, (int(cx - rx), int(item["y"] * 2 - ry)), rot)
            continue
        for t, bb in segs:
            ld.text((cx, item["y"] * 2), t, font=bold if bb else font, anchor="ls", fill=255,
                    stroke_width=item.get("weight", block.get("weight", 0)), stroke_fill=255)
            cx += (bold if bb else font).getlength(t)
        if item.get("underline") is not None:
            uy = (item["y"] + item.get("underline_offset", 15)) * 2
            w = tw + item["underline"] * 2
            ld.line([(x * 2, uy), (x * 2 + w, uy)], fill=255, width=item.get("underline_width", 3) * 2)
    alpha = layer.resize(img.size, Image.LANCZOS)
    img.paste(Image.new("RGB", img.size, color), (0, 0), alpha)


def load_font(name, size, weight=None):
    f = ImageFont.truetype(str(FONTS[name]), size)
    if weight:
        f.set_variation_by_axes([weight])
    return f


def font_for_cap(name, cap, weight=None):
    """Taille de police dont les capitales mesurent `cap` pixels."""
    size = cap
    for _ in range(4):
        f = load_font(name, size, weight)
        h = -f.getbbox("H", anchor="ls")[1]
        size = max(6, round(size * cap / h))
    return load_font(name, size, weight)


def do_plain(img, block):
    """Texte sur aplat (couverture) : la zone est repeinte de sa couleur, puis le texte est posé."""
    rgb = np.array(img)
    for x0, y0, x1, y1 in block["rects"]:
        color = block.get("fill") or np.median(rgb[y0:y1, x0:x1].reshape(-1, 3), axis=0)
        rgb[y0:y1, x0:x1] = color
    img.paste(Image.fromarray(rgb))
    layer = Image.new("L", (img.width * 2, img.height * 2), 0)
    for it in block["lines"]:
        f = font_for_cap(it.get("font", "condensed"), it["cap"] * 2, it.get("weight"))
        w = f.getlength(it["text"])
        sq = it.get("squeeze", 1.0)
        if "fit" in it and w * sq > it["fit"] * 2:
            sq = it["fit"] * 2 / w  # resserrer les lettres plutôt que réduire la hauteur
        asc, desc = f.getmetrics()
        tmp = Image.new("L", (int(w) + 4, asc + desc), 0)
        ImageDraw.Draw(tmp).text((0, asc), it["text"], font=f, anchor="ls", fill=255)
        tmp = tmp.resize((max(1, int(tmp.width * sq)), tmp.height), Image.LANCZOS)
        x = it["x"] if "x" in it else round(it["cx"] - tmp.width / 4)
        layer.paste(255, (x * 2, it["y"] * 2 - asc), tmp)
    alpha = layer.resize(img.size, Image.LANCZOS)
    img.paste(Image.new("RGB", img.size, tuple(block.get("color", (240, 236, 228)))), (0, 0), alpha)


def main(spec_path, src, dst):
    spec = json.loads(Path(spec_path).read_text())
    img = Image.open(src).convert("RGB")
    gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
    draw = ImageDraw.Draw(img)
    for block in spec["blocks"]:
        if block["type"] in ("balloon", "caption"):
            try:
                s = do_balloon(img, gray, block, draw)
                print(f"  bulle {block['seed']} : corps {s}")
            except ValueError as e:
                print("  ERREUR", e)
        elif block["type"] == "plain":
            do_plain(img, block)
        elif block["type"] == "typed":
            do_typed(img, block, draw)
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        draw = ImageDraw.Draw(img)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, quality=92) if dst.endswith(".webp") else img.save(dst)


if __name__ == "__main__":
    main(*sys.argv[1:4])
