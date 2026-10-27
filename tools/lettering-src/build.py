"""Génère les fichiers de lettrage JSON (bulles) à partir de ep1_comic.py, en conservant les blocs 'typed'."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from ep1_comic import PAGES
from ep1_docs import DOCS, LABELS
out = Path(__file__).resolve().parents[2] / "content/series/monsieur-x/episodes/1/en/lettering"
out.mkdir(parents=True, exist_ok=True)
for page in sorted((set(PAGES) | set(DOCS) | set(LABELS)) - {"p00"}):
    items = PAGES.get(page, [])
    f = out / f"{page}.json"
    typed = [{"type": "typed", **d[page]} for d in (DOCS, LABELS) if page in d]
    blocks = []
    for it in items:
        t, x, y, text = it[:4]
        b = {"type": t, "seed": [x, y], "text": text}
        if len(it) > 4: b.update(it[4])
        blocks.append(b)
    f.write_text(json.dumps({"blocks": blocks + typed}, ensure_ascii=False, indent=1))
