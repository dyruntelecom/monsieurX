#!/usr/bin/env python3
"""Builds a hand-made Storink Daily edition for content/news/import/<day>/.

  tools/edition.py split  <page.png> <out_dir> <story_id>   # cuts a 2x2 comic page into <story_id>/1..4.jpg (JPEG: needed by Instagram and the share cards)
  tools/edition.py single <img> <out_dir> <story_id> <n>    # adds one separate image as slide n
  tools/edition.py build  <script.json> <out_dir>           # writes manifest.json for every story that has its images

Gutters are found automatically (bright, low-variance rows/columns near the middle of the page).
"""
import json, sys, os
from PIL import Image, ImageStat

def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert("RGB").save(path, "JPEG", quality=88, optimize=True, progressive=True)

def gutter(img, axis):
    """Index of the gutter line along axis (0 = vertical gutter → x, 1 = horizontal gutter → y), searched in the middle 30%."""
    g = img.convert("L")
    W, H = g.size
    size = W if axis == 0 else H
    best, best_score = None, -1e9
    lo, hi = int(size * 0.35), int(size * 0.65)
    for i in range(lo, hi):
        box = (i, 0, i + 1, H) if axis == 0 else (0, i, W, i + 1)
        st = ImageStat.Stat(g.crop(box))
        score = st.mean[0] - 2.5 * st.stddev[0]       # bright and uniform
        if score > best_score: best, best_score = i, score
    # widen to the whole gutter band
    def ok(i):
        box = (i, 0, i + 1, H) if axis == 0 else (0, i, W, i + 1)
        st = ImageStat.Stat(g.crop(box)); return st.mean[0] - 2.5 * st.stddev[0] > best_score - 25
    a = best
    while a > 0 and ok(a - 1): a -= 1
    b = best
    while b < size - 1 and ok(b + 1): b += 1
    return a, b

def trim(img):
    """Removes a near-white outer margin."""
    g = img.convert("L"); W, H = g.size
    def blank(box):
        st = ImageStat.Stat(g.crop(box)); return st.mean[0] > 235 and st.stddev[0] < 12
    l, t, r, b = 0, 0, W, H
    while l < W // 10 and blank((l, 0, l + 1, H)): l += 1
    while r > W - W // 10 and blank((r - 1, 0, r, H)): r -= 1
    while t < H // 10 and blank((0, t, W, t + 1)): t += 1
    while b > H - H // 10 and blank((0, b - 1, W, b)): b -= 1
    return img.crop((l, t, r, b))

def split(page, out, sid):
    img = trim(Image.open(page))
    W, H = img.size
    x0, x1 = gutter(img, 0); y0, y1 = gutter(img, 1)
    boxes = [(0, 0, x0, y0), (x1 + 1, 0, W, y0), (0, y1 + 1, x0, H), (x1 + 1, y1 + 1, W, H)]
    for n, bx in enumerate(boxes, 1):
        panel = trim(img.crop(bx))
        i = 3  # small inset: drops any anti-aliased gutter edge
        save(panel.crop((i, i, panel.width - i, panel.height - i)), os.path.join(out, sid, f"{n}.jpg"))
    print(f"{sid}: page {W}x{H}, gutters x {x0}-{x1}, y {y0}-{y1}, cases " + ", ".join(f"{b[2]-b[0]}x{b[3]-b[1]}" for b in boxes))

def build(script, out):
    src = json.load(open(script))
    styles = {s["id"]: s for s in json.load(open(os.path.join(os.path.dirname(__file__), "..", "content", "news", "styles.json")))}
    stories = []
    for st in src["stories"]:
        slides = []
        for k, s in enumerate(st["slides"], 1):
            p = os.path.join(out, st["id"], f"{k}.jpg")
            if not os.path.exists(p): break
            w, h = Image.open(p).size
            slides.append({**s, "image": f"{st['id']}/{k}.jpg", "w": w, "h": h})
        if len(slides) != len(st["slides"]): continue
        stories.append({"id": st["id"], "status": "published", "style": {"id": st["style"], "name": styles[st["style"]]["name"]},
                        "headline": st["headline"], "sources": st["sources"], "cast": st.get("cast", []), "slides": slides})
    day = src["day"]
    prev = {}
    mp = os.path.join(out, "manifest.json")
    if os.path.exists(mp): prev = json.load(open(mp))
    ed = {"series": "daily", "episode": day, "langs": ["en", "fr"], "baseLang": "en", "title": {"en": day, "fr": day},
          "published": day, "status": "published", "importVersion": prev.get("importVersion", 0) + 1, "stories": stories}
    json.dump(ed, open(mp, "w"), ensure_ascii=False, indent=2)
    print(f"{len(stories)} sujets complets sur {len(src['stories'])} · importVersion {ed['importVersion']}")

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "split": split(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "single": save(Image.open(sys.argv[2]), os.path.join(sys.argv[3], sys.argv[4], f"{sys.argv[5]}.jpg"))
    elif cmd == "build": build(sys.argv[2], sys.argv[3])
