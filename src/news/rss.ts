// Minimal RSS / Atom / RDF reader for the news pipeline (no dependency).
export interface FeedItem { id: string; source: string; title: string; summary: string; link: string; date: number }

const UA = "Mozilla/5.0 (compatible; StorinkNews/1.0; +https://storink.com)";

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;|&#8217;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? m[1] : "";
};

export function parseFeed(xml: string, source: string): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const title = decode(tag(b, "title"));
    let link = decode(tag(b, "link"));
    if (!link) { const m = /<link[^>]*href="([^"]+)"/i.exec(b); if (m) link = m[1]; }
    const summary = decode(tag(b, "description") || tag(b, "summary") || tag(b, "content"));
    const dateStr = decode(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated"));
    const date = Date.parse(dateStr) || Date.now();
    if (!title || !/^https?:\/\//.test(link)) continue;
    out.push({ id: "", source, title: title.slice(0, 300), summary: summary.slice(0, 600), link, date });
  }
  return out;
}

export async function fetchFeeds(feeds: { name: string; url: string }[], maxAgeHours = 30): Promise<{ items: FeedItem[]; errors: string[] }> {
  const errors: string[] = [];
  const since = Date.now() - maxAgeHours * 3600e3;
  const results = await Promise.all(feeds.map(async (f) => {
    try {
      const r = await fetch(f.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, */*" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseFeed(await r.text(), f.name).filter((i) => i.date >= since);
    } catch (e) { errors.push(`${f.name}: ${(e as Error).message}`); return []; }
  }));
  const seen = new Set<string>();
  const items = results.flat().filter((i) => { const k = i.link.split("?")[0]; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.date - a.date);
  items.forEach((it, n) => (it.id = "i" + n));
  return { items, errors };
}

/** Best-effort plain text of an article page, for the scriptwriter. Never published as such. */
export async function fetchArticleText(url: string, max = 7000): Promise<string> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000), redirect: "follow" });
    if (!r.ok) return "";
    let html = await r.text();
    html = html.replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, " ");
    const paras = [...html.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map((m) => decode(m[0])).filter((p) => p.length > 60);
    return paras.join("\n").slice(0, max);
  } catch { return ""; }
}
