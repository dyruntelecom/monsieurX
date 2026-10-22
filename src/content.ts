// Content catalog: everything Storink shows comes from content/ (series.json + one manifest.json
// per episode and language). Nothing about a given series lives in code.
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative, sep } from "node:path";

export const ROOT = resolve(import.meta.dir, "..");
export const CONTENT = join(ROOT, "content");
export const SERIES_DIR = join(CONTENT, "series");

export type Text = Record<string, string>; // { fr: "...", en: "..." }
export type Zone = [number, number, number, number]; // x, y, w, h as fractions of the page

export type PageKind = "cover" | "comic" | "spread" | "doc" | "credits";
export interface Page {
  src: string; thumb?: string; w: number; h: number;
  label: string; kind: PageKind; zones: Zone[];
}

export type Status = "draft" | "published";
export type Access = "free" | "subscribers";

export interface Episode {
  series: string;
  episode: string;          // folder name, used in the URL: "1", "2", or a date for news series
  number?: number;
  lang: string;
  title: string;
  eyebrow?: string;
  blurb?: string;
  description?: string;
  shareDescription?: string;
  authors: string[];
  published?: string;       // YYYY-MM-DD
  broadcastDate?: string;   // YYYY-MM-DD (Monsieur X: date of the original radio show)
  status: Status;
  access: Access;
  cover?: string;
  ogImage?: string;
  stamp?: string;
  pages: Page[];
  // computed
  dir: string;              // absolute folder of this manifest
}

export type SeriesType = "comic" | "news";
export interface Series {
  slug: string;
  type: SeriesType;
  status: Status;
  authors: string[];
  aiAssisted?: boolean;
  cover?: string;
  order?: number;
  title: Text;
  tagline?: Text;
  description?: Text;
  notice?: Text;
  frequency?: "daily" | "weekly"; // news series
  // computed
  dir: string;
  episodes: Map<string, Map<string, Episode>>; // episode -> lang -> version
}

export interface Author { slug: string; name: string; bio?: Text; url?: string }

export interface Catalog {
  series: Map<string, Series>;
  authors: Map<string, Author>;
  errors: string[];
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const LANG = /^[a-z]{2}$/;
const KINDS = new Set<PageKind>(["cover", "comic", "spread", "doc", "credits"]);

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}
const dirs = (p: string) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()).sort() : []);

/** Resolves a path written in a manifest (relative to `base`) and returns it relative to SERIES_DIR, or null if it escapes `fence`. */
export function mediaPath(base: string, rel: string, fence: string): string | null {
  const abs = resolve(base, rel);
  if (!(abs + sep).startsWith(fence + sep) && abs !== fence) return null;
  if (!existsSync(abs)) return null;
  return relative(SERIES_DIR, abs).split(sep).join("/");
}

export function loadCatalog(): Catalog {
  const errors: string[] = [];
  const authors = new Map<string, Author>();
  const aDir = join(CONTENT, "authors");
  if (existsSync(aDir)) for (const f of readdirSync(aDir).filter((f) => f.endsWith(".json"))) {
    try { const a = readJson(join(aDir, f)); authors.set(a.slug || f.slice(0, -5), { slug: a.slug || f.slice(0, -5), ...a }); }
    catch (e) { errors.push(`authors/${f}: ${(e as Error).message}`); }
  }

  const series = new Map<string, Series>();
  for (const slug of dirs(SERIES_DIR)) {
    const sdir = join(SERIES_DIR, slug);
    const where = `series/${slug}`;
    if (!SLUG.test(slug)) { errors.push(`${where}: nom de dossier invalide (minuscules, chiffres et tirets)`); continue; }
    let s: Series;
    try { s = { ...readJson(join(sdir, "series.json")), slug, dir: sdir, episodes: new Map() }; }
    catch (e) { errors.push(`${where}/series.json: ${(e as Error).message}`); continue; }
    s.type = s.type === "news" ? "news" : "comic";
    s.status = s.status === "draft" ? "draft" : "published";
    s.authors = Array.isArray(s.authors) ? s.authors : [];
    if (!s.title || typeof s.title !== "object") { errors.push(`${where}: "title" manquant`); continue; }
    for (const a of s.authors) if (!authors.has(a)) errors.push(`${where}: auteur inconnu "${a}" (ajouter content/authors/${a}.json)`);

    for (const ep of dirs(join(sdir, "episodes"))) {
      if (!SLUG.test(ep)) { errors.push(`${where}/episodes/${ep}: nom de dossier invalide`); continue; }
      for (const lang of dirs(join(sdir, "episodes", ep))) {
        const edir = join(sdir, "episodes", ep, lang);
        const ew = `${where}/episodes/${ep}/${lang}`;
        if (!LANG.test(lang)) { errors.push(`${ew}: la langue doit être un code à deux lettres (fr, en…)`); continue; }
        const mf = join(edir, "manifest.json");
        if (!existsSync(mf)) { errors.push(`${ew}: manifest.json manquant`); continue; }
        let e: Episode;
        try { e = readJson(mf); } catch (err) { errors.push(`${ew}/manifest.json: ${(err as Error).message}`); continue; }
        e = {
          ...e, series: slug, episode: ep, lang, dir: edir,
          authors: Array.isArray(e.authors) && e.authors.length ? e.authors : s.authors,
          status: e.status === "published" ? "published" : "draft",
          access: e.access === "subscribers" ? "subscribers" : "free",
          pages: Array.isArray(e.pages) ? e.pages : [],
        };
        if (!e.title) errors.push(`${ew}: "title" manquant`);
        e.pages = e.pages.filter((p, i) => {
          const pw = `${ew} planche n°${i}`;
          if (!p || typeof p.src !== "string") { errors.push(`${pw}: "src" manquant`); return false; }
          if (!KINDS.has(p.kind)) { errors.push(`${pw}: "kind" doit valoir cover, comic, spread, doc ou credits`); p.kind = "comic"; }
          if (!(p.w > 0 && p.h > 0)) { errors.push(`${pw}: "w" et "h" (taille en pixels) manquants`); return false; }
          if (!mediaPath(edir, p.src, sdir)) { errors.push(`${pw}: fichier introuvable ${p.src}`); return false; }
          if (p.thumb && !mediaPath(edir, p.thumb, sdir)) { errors.push(`${pw}: miniature introuvable ${p.thumb}`); delete p.thumb; }
          p.zones = Array.isArray(p.zones) ? p.zones.filter((z) => Array.isArray(z) && z.length === 4 && z.every((n) => typeof n === "number")) : [];
          p.label = String(p.label ?? i);
          return true;
        });
        if (!s.episodes.has(ep)) s.episodes.set(ep, new Map());
        s.episodes.get(ep)!.set(lang, e);
      }
    }
    series.set(slug, s);
  }
  return { series, authors, errors };
}

// ——— helpers used by the pages ———

export const pick = (t: Text | undefined, lang: string): string => (t ? t[lang] ?? t.fr ?? t.en ?? Object.values(t)[0] ?? "" : "");

export function isVisible(e: Episode, preview: boolean): boolean { return preview || e.status === "published"; }

/** Published episodes of a series, ordered for display (news: newest first; comics: by number). */
export function episodeList(s: Series, preview = false): { id: string; versions: Map<string, Episode> }[] {
  const out: { id: string; versions: Map<string, Episode> }[] = [];
  for (const [id, versions] of s.episodes) {
    const vis = new Map([...versions].filter(([, e]) => isVisible(e, preview)));
    if (vis.size) out.push({ id, versions: vis });
  }
  const first = (x: { versions: Map<string, Episode> }) => [...x.versions.values()][0];
  if (s.type === "news") out.sort((a, b) => String(first(b).published || b.id).localeCompare(String(first(a).published || a.id)));
  else out.sort((a, b) => (first(a).number ?? (Number(a.id) || 0)) - (first(b).number ?? (Number(b.id) || 0)) || a.id.localeCompare(b.id));
  return out;
}

export function seriesLangs(s: Series, preview = false): string[] {
  const set = new Set<string>();
  for (const { versions } of episodeList(s, preview)) for (const l of versions.keys()) set.add(l);
  return [...set].sort();
}

/** Picks the version of an episode to show for a UI language: same language if it exists, else the first one. */
export function bestVersion(versions: Map<string, Episode>, lang: string): Episode {
  return versions.get(lang) ?? versions.get("fr") ?? versions.get("en") ?? [...versions.values()][0];
}

export function mediaUrl(e: { dir: string }, rel: string | undefined, fenceDir: string): string | null {
  if (!rel) return null;
  const p = mediaPath(e.dir, rel, fenceDir);
  return p ? "/media/" + p.split("/").map(encodeURIComponent).join("/") : null;
}

export function seriesCover(s: Series, lang: string): string | null {
  if (s.cover) { const u = mediaUrl({ dir: s.dir }, s.cover, s.dir); if (u) return u; }
  const list = episodeList(s);
  if (list.length) { const e = bestVersion(list[0].versions, lang); return mediaUrl(e, e.cover || e.pages[0]?.src, s.dir); }
  return null;
}
