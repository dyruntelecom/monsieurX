// Server-rendered pages of the site: home (catalog), series, fixed pages, 404, locked episode.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, type Catalog, type Series, type Episode, pick, episodeList, seriesLangs, bestVersion, seriesCover, mediaUrl } from "./content";
import { t, tr, uiLang, langName, fmtDate, fmtDay, routeOf, UI_LANGS } from "./i18n";
import { esc, markdown } from "./md";

export const config = {
  siteUrl: (Bun.env.SITE_URL || "https://storink.com").replace(/\/$/, ""),
  adsEnabled: Bun.env.ADS_ENABLED === "1",
  version: (Bun.env.RAILWAY_GIT_COMMIT_SHA || String(Date.now())).slice(0, 8),
};

export interface Head {
  lang: string; title: string; description?: string; path: string;
  image?: string | null; type?: string; noindex?: boolean;
  alternates?: { lang: string; path: string }[];
  shareDescription?: string;
  fonts?: string; // stylesheet link(s) for fonts; defaults to the site fonts
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=IBM+Plex+Sans+Condensed:wght@400;600&display=swap">`;

export function head(h: Head, extra = ""): string {
  const abs = (p: string) => (p.startsWith("http") ? p : config.siteUrl + p);
  return `<!doctype html><html lang="${esc(h.lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(h.title)}</title>
${h.description ? `<meta name="description" content="${esc(h.description)}">` : ""}
<link rel="canonical" href="${esc(abs(h.path))}">
${(h.alternates || []).map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(abs(a.path))}">`).join("")}
<meta property="og:site_name" content="Storink"><meta property="og:title" content="${esc(h.title)}">
${h.shareDescription || h.description ? `<meta property="og:description" content="${esc(h.shareDescription || h.description)}">` : ""}
<meta property="og:type" content="${esc(h.type || "website")}"><meta property="og:url" content="${esc(abs(h.path))}">
${h.image ? `<meta property="og:image" content="${esc(abs(h.image))}"><meta name="twitter:card" content="summary_large_image">` : ""}
${h.noindex ? `<meta name="robots" content="noindex">` : ""}
<meta name="theme-color" content="#0c0e12"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
${h.fonts ?? FONTS}${extra}`;
}

/** Disabled advertising slot: renders nothing until ADS_ENABLED=1 (the integration itself is not built yet). */
export const adSlot = (name: string) => (config.adsEnabled ? `<aside class="ad-slot" data-slot="${esc(name)}" aria-hidden="true"></aside>` : "");

function langSwitch(lang: string, paths: Record<string, string>): string {
  const langs = UI_LANGS.filter((l) => paths[l]);
  if (langs.length < 2) return "";
  return `<nav class="langs" aria-label="${esc(t(lang, "site.language"))}">${langs.map((l) =>
    l === uiLang(lang) ? `<span aria-current="true">${esc(l.toUpperCase())}</span>` : `<a href="${esc(paths[l])}" hreflang="${l}" lang="${l}">${esc(l.toUpperCase())}</a>`).join("")}</nav>`;
}

export function page(h: Head, body: string, switchPaths: Record<string, string>): string {
  const L = h.lang;
  return `${head(h, `<link rel="stylesheet" href="/site.css?v=${config.version}">`)}</head><body>
<a class="skip" href="#main">${esc(t(L, "site.skip"))}</a>
<header class="top"><a class="brand" href="/${esc(uiLang(L))}">Storink</a>
<nav class="menu"><a href="/${esc(uiLang(L))}">${esc(t(L, "site.series"))}</a><a href="/${esc(uiLang(L))}/${esc(routeOf(L, "about"))}">${esc(t(L, "site.about"))}</a></nav>
${langSwitch(L, switchPaths)}</header>
<main id="main">${body}</main>
<footer class="foot"><p class="ai">${esc(t(L, "site.ai"))}</p>
<nav><a href="/${esc(uiLang(L))}/${esc(routeOf(L, "about"))}">${esc(t(L, "site.about"))}</a><a href="/${esc(uiLang(L))}/${esc(routeOf(L, "credits"))}">${esc(t(L, "site.credits"))}</a><a href="/${esc(uiLang(L))}/${esc(routeOf(L, "legal"))}">${esc(t(L, "site.legal"))}</a><a href="/${esc(uiLang(L))}/${esc(routeOf(L, "privacy"))}">${esc(t(L, "site.privacy"))}</a></nav>
<p class="copy">© ${new Date().getFullYear()} Storink</p></footer>
</body></html>`;
}

const allLangPaths = (fn: (l: string) => string) => Object.fromEntries(UI_LANGS.map((l) => [l, fn(l)]));

function authorNames(c: Catalog, slugs: string[]): string {
  return slugs.map((a) => c.authors.get(a)?.name || a).join(", ");
}

function langTags(langs: string[], current?: string): string {
  return `<span class="tags">${langs.map((l) => `<span class="tag${l === current ? " on" : ""}" title="${esc(langName(l))}">${esc(l.toUpperCase())}</span>`).join("")}</span>`;
}

// ——— home ———
// Featured episode for the hero demo: content/site.json → { featured: { series, episode, lang, page } }.
function featured(c: Catalog) {
  let f: any = {};
  try { f = JSON.parse(readFileSync(join(CONTENT, "site.json"), "utf8")).featured || {}; } catch {}
  const s = c.series.get(f.series);
  const versions = s?.episodes.get(String(f.episode));
  const e = versions && (versions.get(f.lang) ?? [...versions.values()][0]);
  if (!s || !e || e.status !== "published" || !e.pages.length) return null;
  const idx = Math.min(Math.max(0, Number(f.page) || 0), e.pages.length - 1);
  const pg = e.pages[idx];
  const src = mediaUrl(e, pg.src, s.dir);
  if (!src) return null;
  return { s, e, pg, src, zones: pg.zones.filter((z) => !(z[0] === 0 && z[1] === 0 && z[2] === 1 && z[3] === 1)) };
}

export function homePage(c: Catalog, lang: string): string {
  const L = uiLang(lang);
  const list = [...c.series.values()].filter((s) => s.status === "published")
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.slug.localeCompare(b.slug));
  const f = featured(c);
  const epHref = f ? `/${f.e.lang}/${f.s.slug}/${f.e.episode}` : "#series";
  const epName = f ? `${pick(f.s.title, L)}, ${f.e.title}` : "";

  const demo = f ? `<figure class="demo">
<a class="demo-page" href="${esc(epHref)}" style="aspect-ratio:${f.pg.w}/${f.pg.h}" aria-label="${esc(t(L, "home.readFeatured", { series: f ? pick(f.s.title, L) : "", n: f ? (f.e.number ?? f.e.episode) : "" }))}">
<img src="${esc(f.src)}" alt="${esc(t(L, "home.demoAlt", { series: pick(f.s.title, L) }))}" width="${f.pg.w}" height="${f.pg.h}" fetchpriority="high">
<span class="demo-spot" aria-hidden="true"></span></a>
<figcaption>${esc(t(L, "home.demoCaption", { series: pick(f.s.title, L), episode: f.e.title }))}</figcaption>
<script type="application/json" id="demo-zones">${JSON.stringify(f.zones)}</script>
</figure>` : "";

  const how = (tr(L, "home.how") as { title: string; text: string }[]).map((h) =>
    `<div class="how-item"><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div>`).join("");

  const rows = list.map((s) => {
    const n = episodeList(s).length; const langs = seriesLangs(s);
    const cover = seriesCover(s, L);
    return `<li><a class="series-row" href="/${esc(L)}/${esc(s.slug)}">
<span class="cover">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ""}</span>
<span class="meta"><span class="title">${esc(pick(s.title, L))}</span>
${s.tagline ? `<span class="tagline">${esc(pick(s.tagline, L))}</span>` : ""}
<span class="by">${esc(t(L, "catalog.by"))} ${esc(authorNames(c, s.authors))}</span>
<span class="facts"><span class="count${n ? "" : " soon"}">${esc(t(L, "catalog.episodes", { n }))}</span>${langs.length ? langTags(langs, L) : ""}</span></span></a></li>`;
  }).join("");

  const next = (tr(L, "home.next") as { title: string; text: string }[]).map((x) =>
    `<li><h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></li>`).join("");

  const body = `<section class="intro${f ? "" : " no-demo"}">
<div class="intro-copy"><h1>${esc(t(L, "home.title"))}</h1>
<p class="lead">${esc(t(L, "home.lead"))}</p>
<p class="cta">${f ? `<a class="btn primary" href="${esc(epHref)}">${esc(t(L, "home.readFeatured", { series: f ? pick(f.s.title, L) : "", n: f ? (f.e.number ?? f.e.episode) : "" }))}</a>` : ""}<a class="btn" href="#series">${esc(t(L, "home.seeSeries"))}</a></p></div>
${demo}</section>
<section class="how" aria-labelledby="how-h"><h2 id="how-h">${esc(t(L, "home.howTitle"))}</h2><div class="how-grid">${how}</div></section>
<section class="series" id="series" aria-labelledby="ser-h"><h2 id="ser-h">${esc(t(L, "home.seriesTitle"))}</h2>
${list.length ? `<ul class="series-list">${rows}</ul>` : `<p class="muted">${esc(t(L, "catalog.empty"))}</p>`}</section>
<section class="next" aria-labelledby="next-h"><h2 id="next-h">${esc(t(L, "home.nextTitle"))}</h2><ul class="next-list">${next}</ul></section>
${adSlot("home")}
<script src="/home.js?v=${config.version}" defer></script>`;
  return page({ lang: L, title: `Storink · ${t(L, "home.title")}`, description: t(L, "home.lead"), path: `/${L}`, image: f ? mediaUrl(f.e, f.e.ogImage || f.e.cover, f.s.dir) : null,
    alternates: UI_LANGS.map((l) => ({ lang: l, path: `/${l}` })) }, body, allLangPaths((l) => `/${l}`));
}

// ——— series ———
export function seriesPage(c: Catalog, s: Series, lang: string, preview: boolean): string {
  const L = uiLang(lang);
  const eps = episodeList(s, preview);
  const cover = seriesCover(s, L);
  const items = eps.map(({ id, versions }) => {
    const e = bestVersion(versions, L);
    const others = [...versions.keys()];
    const img = mediaUrl(e, e.cover || e.pages[0]?.src, s.dir);
    const head = s.type === "news" ? fmtDate(L, e.published) : t(L, "series.episode", { n: e.number ?? id });
    const date = e.broadcastDate ? t(L, "series.broadcast", { date: fmtDate(L, e.broadcastDate) }) : e.published && s.type !== "news" ? t(L, "series.published", { date: fmtDate(L, e.published) }) : "";
    return `<li><a class="ep" href="/${esc(e.lang)}/${esc(s.slug)}/${esc(id)}">
<span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}</span>
<span class="meta"><span class="eyebrow">${esc(head)}${e.status === "draft" ? ` · ${esc(t(L, "reader.draft"))}` : ""}</span>
<span class="title">${esc(e.title)}</span>
${date ? `<span class="date">${esc(date)}</span>` : ""}
<span class="facts">${langTags(others, e.lang)}${e.access === "subscribers" ? `<span class="tag lock">${esc(t(L, "series.subscribers"))}</span>` : ""}</span></span>
<span class="go" aria-hidden="true">${esc(t(L, "series.read"))} →</span></a></li>`;
  }).join("");
  const desc = pick(s.description, L) || pick(s.tagline, L);
  const body = `<p class="crumb"><a href="/${esc(L)}">← ${esc(t(L, "series.back"))}</a></p>
<section class="series-head">${cover ? `<img class="series-cover" src="${esc(cover)}" alt="">` : ""}
<div><h1 class="display">${esc(pick(s.title, L))}</h1>
<p class="by">${esc(t(L, "catalog.by"))} ${esc(authorNames(c, s.authors))}</p>
${desc ? `<p class="lead">${esc(desc)}</p>` : ""}
${s.notice ? `<p class="notice">${esc(pick(s.notice, L))}</p>` : ""}
${s.aiAssisted ? `<p class="ai-badge">${esc(t(L, "site.aiShort"))}</p>` : ""}</div></section>
${s.type === "news" ? newsDays(s, eps, L) : `<section aria-labelledby="eps-h"><h2 id="eps-h" class="eyebrow">${esc(t(L, "series.episodes"))}</h2>
${eps.length ? `<ul class="eps">${items}</ul>` : `<p class="muted">${esc(t(L, "series.comingSoon"))}</p>`}</section>`}
${adSlot("series")}`;
  return page({ lang: L, title: `${pick(s.title, L)} · Storink`, description: desc, path: `/${L}/${s.slug}`, image: cover,
    alternates: UI_LANGS.map((l) => ({ lang: l, path: `/${l}/${s.slug}` })) }, body, allLangPaths((l) => `/${l}/${s.slug}`));
}

/** News series: one section per day (the date is the heading), one card per story. */
function newsDays(s: Series, eps: { id: string; versions: Map<string, Episode> }[], L: string): string {
  if (!eps.length) return `<p class="muted">${esc(t(L, "series.comingSoon"))}</p>`;
  return eps.map(({ id, versions }) => {
    const e = bestVersion(versions, L);
    const cards = (e.stories || []).map((st) => {
      const img = mediaUrl(e, st.slides[0]?.image, s.dir);
      return `<li><a class="story-card" href="/${esc(e.lang)}/${esc(s.slug)}/${esc(id)}/${esc(st.id)}">
<span class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}</span>
<span class="title">${esc(pick(st.headline, e.lang))}</span>
<span class="style">${esc(pick(st.style?.name, L))}</span></a></li>`;
    }).join("");
    return `<section class="day" id="d${esc(id)}" aria-labelledby="h${esc(id)}"><h2 id="h${esc(id)}">${esc(fmtDay(L, e.published || id))}</h2><ul class="story-grid">${cards}</ul></section>`;
  }).join("");
}

// ——— fixed pages (content/pages/<page>.<lang>.md) ———
export function staticPage(name: string, lang: string): string | null {
  const L = uiLang(lang);
  let file = join(CONTENT, "pages", `${name}.${L}.md`);
  if (!existsSync(file)) file = join(CONTENT, "pages", `${name}.fr.md`);
  if (!existsSync(file)) return null;
  const { title, html } = markdown(readFileSync(file, "utf8"));
  return page({ lang: L, title: `${title} · Storink`, path: `/${L}/${routeOf(L, name)}`, noindex: name === "legal",
    alternates: UI_LANGS.map((l) => ({ lang: l, path: `/${l}/${routeOf(l, name)}` })) },
  `<article class="prose"><h1 class="display">${esc(title)}</h1>${html}</article>`, allLangPaths((l) => `/${l}/${routeOf(l, name)}`));
}

export function notFoundPage(lang: string): string {
  const L = uiLang(lang);
  return page({ lang: L, title: `${t(L, "notFound.title")} · Storink`, path: `/${L}`, noindex: true },
    `<section class="prose"><h1 class="display">${esc(t(L, "notFound.title"))}</h1><p>${esc(t(L, "notFound.text"))}</p><p><a href="/${esc(L)}">${esc(t(L, "notFound.back"))}</a></p></section>`, {});
}

export function lockedPage(s: Series, e: Episode, lang: string): string {
  const L = uiLang(lang);
  const cover = mediaUrl(e, e.cover || e.pages[0]?.src, s.dir);
  return page({ lang: L, title: `${e.title} · ${pick(s.title, L)} · Storink`, path: `/${e.lang}/${s.slug}/${e.episode}`, image: cover, noindex: true },
    `<p class="crumb"><a href="/${esc(L)}/${esc(s.slug)}">← ${esc(pick(s.title, L))}</a></p>
<section class="series-head">${cover ? `<img class="series-cover" src="${esc(cover)}" alt="">` : ""}<div><p class="eyebrow">${esc(e.eyebrow || "")}</p><h1 class="display">${esc(e.title)}</h1>
<p class="notice">${esc(t(L, "locked.title"))}</p><p class="lead">${esc(t(L, "locked.text"))}</p></div></section>`, {});
}
