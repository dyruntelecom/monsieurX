"""Repère automatiquement les bulles et cartouches d'une planche et lit leur texte (OCR).

python3 tools/find_balloons.py <page.png> [<image annotée.png>]
Affiche une ligne par zone : numéro, point de départ (x, y), boîte, texte lu.
Le point sert de "seed" dans les fichiers de lettrage (tools/lettering-src/).
"""
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

page = sys.argv[1]
im = Image.open(page).convert("RGB")
g = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY)
h, w = g.shape
n, lab, st, cen = cv2.connectedComponentsWithStats((g >= 215).astype(np.uint8), connectivity=4)
found = []
for l in range(1, n):
    x, y, bw, bh, area = st[l]
    if area < 1500 or area > 0.12 * h * w or bw < 40 or bh < 18:
        continue
    if x == 0 or y == 0 or x + bw == w or y + bh == h or bw > 0.75 * w or bh > 0.5 * h:
        continue
    comp = (lab == l).astype(np.uint8)
    cnts, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    filled = np.zeros_like(comp)
    cv2.drawContours(filled, cnts, -1, 1, -1)
    if area / filled.sum() > 0.97 or area / (bw * bh) < 0.35:  # pas de texte dedans, ou forme trop découpée
        continue
    holes = (filled > 0) & (comp == 0) & (g < 120)
    if holes.sum() < 60:
        continue
    ys, xs = np.nonzero(holes)
    # point de départ : un pixel de fond de bulle proche du centre du texte
    cx, cy = int(np.median(xs)), int(np.median(ys))
    cand = np.argwhere(comp > 0)
    d = (cand[:, 0] - cy) ** 2 + (cand[:, 1] - cx) ** 2
    sy, sx = cand[np.argmin(d)]
    crop = im.crop((x, y, x + bw, y + bh)).resize((bw * 2, bh * 2))
    crop.save("/tmp/_fb.png")
    txt = subprocess.run(["tesseract", "/tmp/_fb.png", "-", "--psm", "6"], capture_output=True, text=True).stdout
    txt = " ".join(txt.split())
    found.append((int(y), int(x), int(sx), int(sy), int(bw), int(bh), txt))
found.sort()
ann = im.copy()
d = ImageDraw.Draw(ann)
f = ImageFont.load_default(size=28) if hasattr(ImageFont, "load_default") else None
for i, (y, x, sx, sy, bw, bh, txt) in enumerate(found):
    print(f"{i:2d} ({sx},{sy}) box {x},{y},{bw}x{bh} | {txt}")
    d.rectangle([x, y, x + bw, y + bh], outline=(255, 0, 0), width=3)
    d.text((x + 2, y + 2), str(i), fill=(255, 0, 0), font=f)
if len(sys.argv) > 2:
    ann.save(sys.argv[2])
