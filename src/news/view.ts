// Stories reader for a generated news edition: full-screen portrait slides, one bubble per screen.
import { type Catalog, type Series, type Episode, pick, mediaUrl, episodeList } from "../content";
import { t, uiLang, langName, fmtDate, DICTS, DEFAULT_LANG } from "../i18n";
import { head, config } from "../render";
import { esc } from "../md";

export function newsReaderPage(c: Catalog, s: Series, e: Episode, preview: boolean, storyId: string): string | null {
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
  // One story per page: the reader shows only this story, then offers the next one.
  const pos = stories.findIndex((st) => st.id === storyId);
  if (pos < 0) return null;
  const offset = stories.slice(0, pos).reduce((n, st) => n + st.slides.length, 0); // index in the day's flat page list (stats)
  const story = stories[pos];
  const nextSt = stories[pos + 1];
  const storyUrl = (id: string, l = lang) => `/${l}/${s.slug}/${e.episode}/${id}`;

  const versions = [...(s.episodes.get(e.episode) || new Map()).values()].filter((v) => preview || v.status === "published");
  const others = versions.filter((v) => v.lang !== e.lang);
  const list = episodeList(s, preview);
  const idx = list.findIndex((x) => x.id === e.episode);
  const older = list.slice(idx + 1, idx + 4).map((x) => x.id);
  const date = fmtDate(L, e.published || e.episode);
  const tDict = { ...(DICTS.get(DEFAULT_LANG)!.news), ...(DICTS.get(L)?.news || {}) };
  const dayUrl = `/${L}/${s.slug}#d${e.episode}`;
  const data = { series: s.slug, episode: e.episode, lang, key: `storink:${s.slug}:${e.episode}:${lang}:${story.id}`, stories: [story], offset,
    position: pos + 1, total: stories.length, next: nextSt ? { url: storyUrl(nextSt.id), headline: nextSt.headline } : null, dayUrl, t: tDict, date };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const first = story.slides[0];

  return `${head({
    lang, title: `${story.headline} · ${pick(s.title, L)}`, description: `${pick(s.title, L)} · ${date}`,
    path: storyUrl(story.id), image: first?.src, type: "article", noindex: e.status !== "published",
    alternates: versions.map((v) => ({ lang: v.lang, path: storyUrl(story.id, v.lang) })),
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
      <a id="ixBtn" href="${esc(dayUrl)}" aria-label="${esc(t(L, "news.allToday", { date }))}"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></a>
      <a id="close" href="${esc(dayUrl)}" aria-label="${esc(t(L, "news.close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></a>
    </div>
    <h1 id="headline"></h1>
  </header>
  <section id="bubble" aria-live="polite"><p id="who"></p><p id="text"></p></section>
  <footer id="foot"></footer>
  <section id="end" hidden>
    <p class="end-date">${esc(date)} · ${esc(t(L, "news.storyN", { n: pos + 1, total: stories.length }))}</p>
    ${nextSt ? `<p class="end-label">${esc(t(L, "news.next"))}</p>
    <a class="next-card" href="${esc(storyUrl(nextSt.id))}">${nextSt.slides[0]?.src ? `<img src="${esc(nextSt.slides[0].src!)}" alt="">` : ""}<span>${esc(nextSt.headline)}</span></a>`
      : `<h2>${esc(t(L, "news.end"))}</h2><p>${esc(t(L, "news.lastStory"))} ${esc(t(L, "news.endText"))}</p>`}
    <p class="end-actions"><a class="btn" href="${esc(dayUrl)}">${esc(t(L, "news.allToday", { date }))}</a><button class="btn" id="again">${esc(t(L, "news.again"))}</button></p>
    ${others.length ? `<p class="end-langs">${others.map((v) => `<a href="${esc(storyUrl(story.id, v.lang))}" hreflang="${esc(v.lang)}">${esc(langName(v.lang))}</a>`).join(" · ")}</p>` : ""}
    <p class="end-ai">${esc(t(L, "news.ai"))}</p>
  </section>
  ${stories.length ? "" : `<section id="empty"><p>${esc(t(L, "news.empty"))}</p></section>`}
  <button id="prevArea" aria-label="${esc(t(L, "reader.prev"))}"></button>
  <button id="nextArea" aria-label="${esc(t(L, "reader.next"))}"></button>
</main>
<div id="tip" class="gone">${esc(t(L, "news.hint"))}</div>

<script id="ep-data" type="application/json">${json}</script>
<script src="/news.js?v=${config.version}"></script>
</body></html>`;
}
