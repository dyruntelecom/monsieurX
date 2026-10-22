// Interface translations: one JSON file per language in i18n/. Adding a language = adding a file.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./content";

export type Dict = Record<string, any>;
export const DICTS = new Map<string, Dict>();
for (const f of readdirSync(join(ROOT, "i18n")).filter((f) => f.endsWith(".json")).sort()) {
  DICTS.set(f.slice(0, -5), JSON.parse(readFileSync(join(ROOT, "i18n", f), "utf8")));
}
export const DEFAULT_LANG = DICTS.has("fr") ? "fr" : [...DICTS.keys()][0];
export const UI_LANGS = [...DICTS.keys()];

/** Interface language to use for a URL language (an episode may exist in a language the interface is not translated into). */
export const uiLang = (lang: string) => (DICTS.has(lang) ? lang : DICTS.has("en") ? "en" : DEFAULT_LANG);

export function t(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const get = (d: Dict | undefined) => key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), d);
  let v = get(DICTS.get(uiLang(lang)));
  if (v == null) v = get(DICTS.get(DEFAULT_LANG));
  if (v == null) return key;
  if (typeof v === "object" && "other" in v) {
    const n = Number(vars.n ?? 0);
    v = n === 0 && v.zero ? v.zero : n === 1 ? v.one : v.other;
  }
  return String(v).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/** Raw value (array or object) from the dictionary, with the default language as fallback. */
export function tr(lang: string, key: string): any {
  const get = (d: Dict | undefined) => key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), d);
  return get(DICTS.get(uiLang(lang))) ?? get(DICTS.get(DEFAULT_LANG)) ?? [];
}

/** Name of a language in its own language when we have a dictionary for it, else the code. */
export const langName = (code: string) => DICTS.get(code)?.langName ?? (new Intl.DisplayNames([code], { type: "language" }).of(code) || code);

export function fmtDate(lang: string, iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString(DICTS.get(uiLang(lang))?.locale || lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Picks the best interface language from an Accept-Language header. */
export function negotiate(header: string | null): string {
  const prefs = (header || "").split(",").map((p) => {
    const [tag, q] = p.trim().split(";q=");
    return { l: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const p of prefs) if (DICTS.has(p.l)) return p.l;
  return DEFAULT_LANG;
}

/** Route slug for a fixed page ("about" → "a-propos" in French), and the reverse lookup. */
export const routeOf = (lang: string, page: string) => DICTS.get(uiLang(lang))?.routes?.[page] ?? page;
export function pageFromRoute(lang: string, slug: string): string | null {
  const routes = DICTS.get(uiLang(lang))?.routes ?? {};
  for (const [page, s] of Object.entries(routes)) if (s === slug) return page;
  return null;
}
