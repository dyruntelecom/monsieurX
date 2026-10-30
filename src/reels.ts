// Reels: short vertical videos attached to a series (content/series/<slug>/reels/<id>/reel.json).
// reel.json: { "status": "published", "published": "YYYY-MM-DD", "order": 1,
//   "versions": { "fr": { "title", "blurb", "video": "fr.mp4", "poster": "fr.jpg" }, "en": {...} } }
// Shown as a "Reels" block on the series page and at /:lang/:series/reels/:id.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Series } from "./content";
import { pick } from "./content";
import { uiLang, UI_LANGS, fmtDate } from "./i18n";
import { esc } from "./md";
import { page } from "./render";

export interface ReelVersion { title: string; blurb?: string; video: string; poster?: string }
export interface Reel { id: string; status: string; published?: string; order?: number; versions: Record<string, ReelVersion> }

const STR: Record<string, Record<string, string>> = {
  fr: { reels: "Reels", sub: "Des récits courts, en format vertical, à partager.", back: "Retour à", watch: "Regarder", share: "Partager", copied: "Lien copié", download: "Télécharger la vidéo", episodes: "Lire les épisodes" },
  en: { reels: "Reels", sub: "Short vertical stories, made to share.", back: "Back to", watch: "Watch", share: "Share", copied: "Link copied", download: "Download the video", episodes: "Read the episodes" },
};
const s_ = (L: string, k: string) => (STR[L] || STR.en)[k];

export function loadReels(s: Series): Reel[] {
  const dir = join(s.dir, "reels");
  if (!existsSync(dir)) return [];
  const out: Reel[] = [];
  for (const id of readdirSync(dir)) {
    const f = join(dir, id, "reel.json");
    if (!existsSync(f)) continue;
    try { out.push({ id, ...JSON.parse(readFileSync(f, "utf8")) }); } catch (e) { console.warn(`reel ${s.slug}/${id} : ${(e as Error).message}`); }
  }
  return out.filter((r) => r.status === "published")
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(b.published).localeCompare(String(a.published)));
}

const ver = (r: Reel, L: string) => r.versions[L] || r.versions.en || Object.values(r.versions)[0];
const media = (s: Series, r: Reel, file?: string) => (file ? `/media/${s.slug}/reels/${r.id}/${file}` : "");

/** Block for the series page (empty string when the series has no reel). */
export function reelsSection(s: Series, lang: string): string {
  const L = uiLang(lang);
  const reels = loadReels(s);
  if (!reels.length) return "";
  const items = reels.map((r) => {
    const v = ver(r, L);
    return `<li><a class="reel-card" href="/${esc(L)}/${esc(s.slug)}/reels/${esc(r.id)}">
<span class="reel-thumb">${v.poster ? `<img src="${esc(media(s, r, v.poster))}" alt="" loading="lazy">` : ""}<span class="reel-play" aria-hidden="true">▶</span></span>
<span class="reel-title">${esc(v.title)}</span></a></li>`;
  }).join("");
  return `<section class="reels" id="reels" aria-labelledby="reels-h"><h2 id="reels-h" class="eyebrow">${esc(s_(L, "reels"))}</h2>
<p class="muted">${esc(s_(L, "sub"))}</p><ul class="reel-grid">${items}</ul></section>`;
}

export function reelPage(s: Series, id: string, lang: string): string | null {
  const L = uiLang(lang);
  const r = loadReels(s).find((x) => x.id === id);
  if (!r) return null;
  const v = ver(r, L);
  const video = media(s, r, v.video), poster = media(s, r, v.poster);
  const path = `/${L}/${s.slug}/reels/${r.id}`;
  const body = `<p class="crumb"><a href="/${esc(L)}/${esc(s.slug)}#reels">← ${esc(s_(L, "back"))} ${esc(pick(s.title, L))}</a></p>
<section class="reel-view">
<video class="reel-video" src="${esc(video)}" ${poster ? `poster="${esc(poster)}"` : ""} controls playsinline preload="metadata" width="1080" height="1920"></video>
<div class="reel-info"><p class="eyebrow">${esc(pick(s.title, L))} · ${esc(s_(L, "reels"))}${r.published ? ` · ${esc(fmtDate(L, r.published))}` : ""}</p>
<h1 class="display">${esc(v.title)}</h1>
${v.blurb ? `<p class="lead">${esc(v.blurb)}</p>` : ""}
<p class="cta"><button class="btn primary" type="button" id="reel-share" data-copied="${esc(s_(L, "copied"))}">${esc(s_(L, "share"))}</button>
<a class="btn" href="${esc(video)}" download>${esc(s_(L, "download"))}</a>
<a class="btn" href="/${esc(L)}/${esc(s.slug)}">${esc(s_(L, "episodes"))}</a></p></div></section>
<style>
.reel-view{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:32px;align-items:start}
.reel-video{width:100%;height:auto;aspect-ratio:9/16;background:#000;border-radius:6px}
@media (max-width:760px){.reel-view{grid-template-columns:1fr}.reel-video{max-height:82vh;width:auto;max-width:100%;margin:0 auto;display:block}}
</style>
<script>(function(){var b=document.getElementById('reel-share');if(!b)return;b.addEventListener('click',function(){var u=location.href.split('#')[0];
if(navigator.share){navigator.share({title:document.title,url:u}).catch(function(){});return;}
try{navigator.clipboard.writeText(u).then(function(){b.textContent=b.dataset.copied;});}catch(e){}});})();</script>`;
  const langs = Object.keys(r.versions).filter((l) => UI_LANGS.includes(l));
  return page({
    lang: L, title: `${v.title} · ${pick(s.title, L)} · Storink`, description: v.blurb, path, image: poster || null, type: "video.other",
    alternates: langs.map((l) => ({ lang: l, path: `/${l}/${s.slug}/reels/${r.id}` })),
  }, body, Object.fromEntries(langs.map((l) => [l, `/${l}/${s.slug}/reels/${r.id}`])));
}
