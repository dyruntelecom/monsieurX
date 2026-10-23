// Stories reader for a generated news edition: full-screen portrait slides, one bubble per screen.
import { type Catalog, type Series, type Episode, pick, mediaUrl, episodeList } from "../content";
import { t, uiLang, langName, fmtDate, DICTS, DEFAULT_LANG } from "../i18n";
import { head, config } from "../render";
import { esc } from "../md";

export function newsReaderPage(c: Catalog, s: Series, e: Episode, preview: boolean): string {
  const L = uiLang(e.lang);
  const lang = e.lang;
  const stories = (e.stories || []).map((st) => ({
    id: st.id,
    headline: pick(st.headline, lang),
    style: pick(st.style?.name, lang),
    sources: st.sources || [],
    slides: st.slides.map((sl) => ({
      src: mediaUrl(e, sl.image, s.dir), w: sl.w, h: sl.h,
      text: pick(sl.text, lang), who: sl.kind === "speech" && sl.speaker ? pick(sl.speaker, lang) : "",
    })).filter((sl) => sl.src),
  })).filter((st) => st.slides.length);

  const versions = [...(s.episodes.get(e.episode) || new Map()).values()].filter((v) => preview || v.status === "published");
  const others = versions.filter((v) => v.lang !== e.lang);
  const list = episodeList(s, preview);
  const idx = list.findIndex((x) => x.id === e.episode);
  const older = list.slice(idx + 1, idx + 4).map((x) => x.id);
  const date = fmtDate(L, e.published || e.episode);
  const tDict = { ...(DICTS.get(DEFAULT_LANG)!.news), ...(DICTS.get(L)?.news || {}) };
  const data = { series: s.slug, episode: e.episode, lang, key: `storink:${s.slug}:${e.episode}:${lang}`, stories, t: tDict, date, older, seriesUrl: `/${L}/${s.slug}` };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const first = stories[0]?.slides[0];

  return `${head({
    lang, title: `${pick(s.title, L)} · ${date}`, description: stories.map((x) => x.headline).slice(0, 3).join(" · "),
    path: `/${lang}/${s.slug}/${e.episode}`, image: first?.src, type: "article", noindex: e.status !== "published",
    alternates: versions.map((v) => ({ lang: v.lang, path: `/${v.lang}/${s.slug}/${v.episode}` })),
    fonts: `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Patrick+Hand+SC&family=IBM+Plex+Sans+Condensed:wght@400;600&display=swap">`,
  }, `<link rel="stylesheet" href="/news.css?v=${config.version}">${first ? `<link rel="preload" as="image" href="${esc(first.src!)}">` : ""}`)}</head><body>
<div id="bg" aria-hidden="true"></div>
<main id="frame" aria-label="${esc(pick(s.title, L))}, ${esc(date)}">
  <img id="img" alt="" draggable="false">
  <div id="shade" aria-hidden="true"></div>
  <header id="top">
    <div id="bars" aria-hidden="true"></div>
    <div id="meta">
      <a id="brand" href="/${esc(L)}/${esc(s.slug)}">${esc(pick(s.title, L))}</a>
      <span id="count"></span>
      <button id="ixBtn" aria-label="${esc(t(L, "news.stories"))}"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
      <a id="close" href="/${esc(L)}/${esc(s.slug)}" aria-label="${esc(t(L, "news.close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></a>
    </div>
    <h1 id="headline"></h1>
  </header>
  <section id="bubble" aria-live="polite"><p id="who"></p><p id="text"></p></section>
  <footer id="foot"></footer>
  <section id="end" hidden>
    <p class="end-date">${esc(date)}</p>
    <h2>${esc(t(L, "news.end"))}</h2>
    <p>${esc(t(L, "news.endText"))}</p>
    <p class="end-actions"><button class="btn primary" id="again">${esc(t(L, "news.again"))}</button><a class="btn" href="/${esc(L)}/${esc(s.slug)}">${esc(t(L, "news.previous"))}</a></p>
    ${others.length ? `<p class="end-langs">${others.map((v) => `<a href="/${esc(v.lang)}/${esc(s.slug)}/${esc(v.episode)}" hreflang="${esc(v.lang)}">${esc(langName(v.lang))}</a>`).join(" · ")}</p>` : ""}
    <p class="end-ai">${esc(t(L, "news.ai"))}</p>
  </section>
  ${stories.length ? "" : `<section id="empty"><p>${esc(t(L, "news.empty"))}</p></section>`}
  <button id="prevArea" aria-label="${esc(t(L, "reader.prev"))}"></button>
  <button id="nextArea" aria-label="${esc(t(L, "reader.next"))}"></button>
</main>
<div id="tip" class="gone">${esc(t(L, "news.hint"))}</div>
<section id="index" hidden aria-label="${esc(t(L, "news.stories"))}">
  <div class="ix-head"><h2>${esc(date)}</h2><button class="btn" id="ixClose">${esc(t(L, "news.close"))}</button></div>
  <ol id="ixList"></ol>
  ${others.length ? `<p class="ix-langs">${others.map((v) => `<a href="/${esc(v.lang)}/${esc(s.slug)}/${esc(v.episode)}" hreflang="${esc(v.lang)}">${esc(langName(v.lang))}</a>`).join(" · ")}</p>` : ""}
</section>
<script id="ep-data" type="application/json">${json}</script>
<script src="/news.js?v=${config.version}"></script>
</body></html>`;
}
