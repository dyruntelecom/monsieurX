"""Génère les fichiers de lettrage JSON d'un épisode à partir des sources Python.

python3 tools/lettering-src/build.py [épisode]     (1 par défaut)

Sources : epN_comic.py (PAGES : bulles et cartouches) et epN_docs.py (DOCS : texte dactylographié,
LABELS : légendes, et facultativement RAW : blocs JSON tels quels, par exemple la couverture).
"""
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
ep = sys.argv[1] if len(sys.argv) > 1 else "1"
comic = importlib.import_module(f"ep{ep}_comic")
docs = importlib.import_module(f"ep{ep}_docs")
PAGES = comic.PAGES
DOCS, LABELS = getattr(docs, "DOCS", {}), getattr(docs, "LABELS", {})
RAW = getattr(docs, "RAW", {})
out = Path(__file__).resolve().parents[2] / f"content/series/monsieur-x/episodes/{ep}/en/lettering"
out.mkdir(parents=True, exist_ok=True)
skip = {"p00"} if ep == "1" else set()  # couverture de l'épisode 1 : fichier JSON écrit à la main
for page in sorted((set(PAGES) | set(DOCS) | set(LABELS) | set(RAW)) - skip):
    blocks = list(RAW.get(page, []))
    for it in PAGES.get(page, []):
        t, x, y, text = it[:4]
        b = {"type": t, "seed": [x, y], "text": text}
        if len(it) > 4:
            b.update(it[4])
        blocks.append(b)
    blocks += [{"type": "typed", **d[page]} for d in (DOCS, LABELS) if page in d]
    (out / f"{page}.json").write_text(json.dumps({"blocks": blocks}, ensure_ascii=False, indent=1))
