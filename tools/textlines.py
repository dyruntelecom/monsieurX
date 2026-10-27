"""Repère les lignes de texte d'une zone (pour caler le texte traduit) :
python3 tools/textlines.py <page> x0 y0 x1 y1
Affiche pour chaque ligne : gauche, haut, ligne de base, droite, hauteur des capitales, texte lu.
"""
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

page, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
img = Image.open(page).convert("L")
crop = img.crop((x0, y0, x1, y1))
crop.save("/tmp/_tl.png")
tsv = subprocess.run(["tesseract", "/tmp/_tl.png", "-", "--psm", "6", "tsv"],
                     capture_output=True, text=True).stdout.splitlines()[1:]
g = np.array(crop)
lines = {}
for row in tsv:
    f = row.split("\t")
    if len(f) < 12 or f[0] != "5" or not f[11].strip():
        continue
    key = (f[2], f[3], f[4])
    l, t, w, h = map(int, f[6:10])
    lines.setdefault(key, []).append((l, t, w, h, f[11]))
for words in lines.values():
    l = min(w[0] for w in words); r = max(w[0] + w[2] for w in words)
    t = min(w[1] for w in words); b = max(w[1] + w[3] for w in words)
    prof = (g[t:b + 1, l:r] < 120).sum(1)
    thr = 0.3 * prof.max()
    rows = np.nonzero(prof > thr)[0]
    base = t + rows[-1] + 1
    top = t + rows[0]
    print(f"{l + x0:4d} {t + y0:5d} base {base + y0:5d} right {r + x0:4d} cap {base - top:3d}  {' '.join(w[4] for w in words)}")
