// Reader page for one episode version. The markup is the original Monsieur X reader, with every
// episode-specific value coming from the manifest and every interface string from i18n/.
import { type Catalog, type Series, type Episode, pick, mediaUrl } from "./content";
import { t, uiLang, langName, DICTS, DEFAULT_LANG } from "./i18n";
import { head, config } from "./render";
import { esc } from "./md";

export function readerPage(c: Catalog, s: Series, e: Episode, preview: boolean): string {
  const L = uiLang(e.lang);
  const R = (k: string) => esc(t(L, "reader." + k));
  const url = (rel?: string) => mediaUrl(e, rel, s.dir);
  const pages = e.pages.map((p) => ({ src: url(p.src), thumb: p.thumb ? url(p.thumb) : null, w: p.w, h: p.h, label: p.label, kind: p.kind, zones: p.zones }));
  const cover = url(e.cover) || pages[0]?.src || null;
  const og = url(e.ogImage) || cover;
  const versions = [...(s.episodes.get(e.episode) || new Map()).values()].filter((v) => preview || v.status === "published");
  const seriesTitle = pick(s.title, L);
  const path = `/${e.lang}/${s.slug}/${e.episode}`;
  const tDict = (DICTS.get(L) ?? DICTS.get(DEFAULT_LANG))!.reader;

  const data = {
    series: s.slug, episode: e.episode, lang: e.lang,
    key: `storink:${s.slug}:${e.episode}:${e.lang}`,
    pages, t: tDict,
  };
  // </script> can't appear in JSON embedded in a script tag
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  const others = versions.filter((v) => v.lang !== e.lang);
  const versionLinks = others.length
    ? `<p class="hint versions">${R("versions")} : ${others.map((v) => `<a href="/${esc(v.lang)}/${esc(s.slug)}/${esc(v.episode)}${preview ? "?preview=1" : ""}" hreflang="${esc(v.lang)}" lang="${esc(v.lang)}">${esc(langName(v.lang))}</a>`).join(" · ")}</p>`
    : "";

  return `${head({
    lang: e.lang,
    title: `${seriesTitle} · ${e.title}`,
    description: e.description || e.blurb,
    path, image: og, type: "book", noindex: e.status !== "published",
    alternates: versions.map((v) => ({ lang: v.lang, path: `/${v.lang}/${s.slug}/${v.episode}` })),
    shareDescription: e.shareDescription,
    fonts: `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Special+Elite&family=IBM+Plex+Sans+Condensed:wght@400;600&display=swap">`,
  }, `<link rel="stylesheet" href="/reader.css?v=${config.version}">
${pages[1] ? `<link rel="preload" as="image" href="${esc(pages[Math.min(1, pages.length - 1)].src!)}">` : ""}`)}</head><body>

<section id="intro" aria-label="${esc(t(L, "reader.cover"))}">
  ${cover ? `<img src="${esc(cover)}" alt="${esc(t(L, "reader.cover"))} : ${esc(seriesTitle)}, ${esc(e.title)}">` : ""}
  <div class="intro-text">
    <nav class="crumbs"><a href="/${esc(L)}">Storink</a><span aria-hidden="true">/</span><a href="/${esc(L)}/${esc(s.slug)}">${esc(seriesTitle)}</a></nav>
    ${e.status !== "published" ? `<span class="stamp draft">${R("draft")}</span>` : e.stamp ? `<span class="stamp">${esc(e.stamp)}</span>` : ""}
    ${e.eyebrow ? `<div class="eyebrow">${esc(e.eyebrow)}</div>` : ""}
    <h1>${esc(seriesTitle)}</h1>
    <p class="sub">${esc(e.title)}</p>
    ${e.blurb ? `<p class="blurb">${esc(e.blurb)}</p>` : ""}
    ${pages.length ? "" : `<p class="blurb">${R("noPages")}</p>`}
    <div class="actions">
      <button class="btn primary" id="go">${R("readPanels")}</button>
      <button class="btn" id="goPage">${R("readPages")}</button>
    </div>
    <p class="hint" id="resume" hidden></p>
    ${versionLinks}
    ${pages.length ? `<p class="hint">${R("hint")}</p>` : ""}
    <p class="hint fine">${s.notice ? esc(pick(s.notice, L)) + " " : ""}${s.aiAssisted ? esc(t(L, "site.ai")) : ""}</p>
  </div>
</section>

<main id="stage" aria-label="${R("reading")}">
  <div id="rig"><img id="pg" alt="" draggable="false"><div id="spot"></div></div>
  <div id="fade"></div>
</main>

<nav id="bar" aria-label="${R("controls")}">
  <button id="home" class="wide" title="${R("home")}" aria-label="${R("home")}"><svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg></button>
  <button id="prev" title="${R("prev")}" aria-label="${R("prev")}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
  <div id="where"><span class="lbl" id="lbl"></span><div id="prog"><i></i></div></div>
  <button id="next" title="${R("next")}" aria-label="${R("next")}"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
  <button id="zoom" aria-pressed="false" title="${R("zoom")}" aria-label="Zoom"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M10.5 8v5M8 10.5h5"/></svg><span class="tag">1×</span></button>
  <button id="mode" aria-pressed="true" title="${R("mode")}"><span class="tag" id="modeTag">${R("modePanel")}</span></button>
  <button id="ixBtn" title="${R("allPages")}" aria-label="${R("allPages")}"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="7"/><rect x="14" y="4" width="6" height="7"/><rect x="4" y="14" width="6" height="7"/><rect x="14" y="14" width="6" height="7"/></svg></button>
  <button id="fs" class="wide" title="${R("fullscreen")}" aria-label="${R("fullscreen")}"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>
</nav>

<section id="index" hidden aria-label="${R("allPages")}">
  <div class="ix-head"><h2>${R("allPages")}</h2><button class="btn" id="ixClose">${R("close")}</button></div>
  <div id="grid"></div>
</section>
<div id="tip" class="gone">${R("tip")}</div>

<script id="ep-data" type="application/json">${json}</script>
<script src="/reader.js?v=${config.version}"></script>
</body></html>`;
}
