"""Corrige les cases (zones) d'un épisode pour la lecture case par case.

python3 tools/fix_zones.py <série> <épisode> [--write]

Pour chaque planche : repère les bulles et cartouches (zones claires fermées contenant du texte),
supprime les fausses cases très fines, puis agrandit chaque case pour contenir entièrement
les bulles qui la touchent (ou, si aucune ne la touche, la case la plus proche en dessous).
Les cases corrigées sont écrites dans le manifeste de chaque langue (les dessins sont les mêmes).
Sans --write : affiche seulement ce qui changerait.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
serie, ep = sys.argv[1], sys.argv[2]
write = "--write" in sys.argv
base = ROOT / "content/series" / serie / "episodes" / ep
langs = sorted(d.name for d in base.iterdir() if (d / "manifest.json").exists())
ref = "fr" if "fr" in langs else langs[0]
man = {l: json.loads((base / l / "manifest.json").read_text()) for l in langs}


def text_boxes(path):
    """Boîtes (x0, y0, x1, y1) des bulles et cartouches de la planche."""
    g = cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2GRAY)
    h, w = g.shape
    n, lab, st, _ = cv2.connectedComponentsWithStats((g >= 215).astype(np.uint8), connectivity=4)
    out = []
    for l in range(1, n):
        x, y, bw, bh, area = st[l]
        if area < 1200 or area > 0.12 * h * w or bw < 30 or bh < 18:
            continue
        if x == 0 or y == 0 or x + bw == w or y + bh == h or bw > 0.75 * w or bh > 0.5 * h:
            continue
        comp = (lab == l).astype(np.uint8)
        cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        filled = np.zeros_like(comp)
        cv2.drawContours(filled, cnts, -1, 1, -1)
        if area / (bw * bh) < 0.35:
            continue
        holes = (filled > 0) & (comp == 0) & (g < 120)
        if holes.sum() < 60 or area / filled.sum() > 0.97:
            continue
        out.append((x - 3, y - 3, x + bw + 3, y + bh + 3))
    return out


def overlap(a, b):
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))


changed = 0
for i, pg in enumerate(man[ref]["pages"]):
    if pg.get("kind") != "comic" or not pg.get("zones"):
        continue
    W, H = pg["w"], pg["h"]
    full = [z for z in pg["zones"] if z == [0, 0, 1, 1]]
    zs = [[z[0] * W, z[1] * H, (z[0] + z[2]) * W, (z[1] + z[3]) * H] for z in pg["zones"] if z != [0, 0, 1, 1]]
    # fausses cases : bandes très fines
    zs = [z for z in zs if (z[3] - z[1]) > 0.07 * H and (z[2] - z[0]) > 0.07 * W]
    if not zs:
        continue
    boxes = text_boxes(base / ref / pg["src"])
    for b in boxes:
        area = (b[2] - b[0]) * (b[3] - b[1])
        ov = [overlap(b, z) for z in zs]
        if max(ov) >= 0.97 * area:
            continue
        if max(ov) > 0:
            k = int(np.argmax(ov))
        else:  # cartouche au-dessus d'une case : la case la plus proche qui le chevauche horizontalement
            cands = [(abs(z[1] - b[3]) + abs(z[3] - b[1]) * 0.1, k) for k, z in enumerate(zs)
                     if min(b[2], z[2]) - max(b[0], z[0]) > 0.5 * (b[2] - b[0])]
            if not cands:
                continue
            k = min(cands)[1]
        z = zs[k]
        zs[k] = [min(z[0], b[0]), min(z[1], b[1]), max(z[2], b[2]), max(z[3], b[3])]
    new = full + [[round(max(0, z[0]) / W, 4), round(max(0, z[1]) / H, 4),
                   round((min(W, z[2]) - max(0, z[0])) / W, 4), round((min(H, z[3]) - max(0, z[1])) / H, 4)] for z in zs]
    if new != pg["zones"]:
        changed += 1
        print(f"{pg['src']} ({pg['label']}): {len(pg['zones'])} -> {len(new)} cases")
        for l in langs:
            man[l]["pages"][i]["zones"] = new
if write:
    for l in langs:
        (base / l / "manifest.json").write_text(json.dumps(man[l], ensure_ascii=False, indent=2) + "\n")
print(f"{changed} planche(s) corrigée(s){'' if write else ' (simulation)'}")
