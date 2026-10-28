// Storink — comic platform. Bun server, no build step.
// Pages are rendered from content/ (series, episodes, manifests) and i18n/ (interface strings).
import { join, normalize, sep } from "node:path";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadCatalog, SERIES_DIR, GEN_DIR, DATA_DIR, type Catalog, episodeList, bestVersion, isVisible } from "./src/content";
import { negotiate, uiLang, UI_LANGS, pageFromRoute, routeOf } from "./src/i18n";
import { homePage, seriesPage, staticPage, notFoundPage, lockedPage, config } from "./src/render";
import { readerPage } from "./src/reader";
import { openStats, track, statsPage } from "./src/stats";
import { newsReaderPage } from "./src/news/view";
import { adminHome, adminEdition, adminPost } from "./src/news/admin";
import { startScheduler, setOnChange, loadConfig as loadNewsConfig } from "./src/news/pipeline";
import { startSocial } from "./src/news/social";
import { renderCard } from "./src/news/cards";
import { authorized, askAuth, handleLogin } from "./src/auth";

const PORT = Number(Bun.env.PORT || 8080);
const SALT = Bun.env.STATS_SALT || "monsieur-x";
// Set once storink.com answers in HTTPS: every other host (www, the old *.up.railway.app address) then redirects to it.
const CANONICAL_HOST = (Bun.env.CANONICAL_HOST || "").toLowerCase();
const DEV = !Bun.env.RAILWAY_ENVIRONMENT && Bun.env.NODE_ENV !== "production"; // content reloads on every request in local dev
const PUBLIC = join(import.meta.dir, "public");

let catalog: Catalog = loadCatalog();
const report = (c: Catalog) => { if (c.errors.length) console.warn("Contenu : " + c.errors.length + " problème(s)\n- " + c.errors.join("\n- ")); };
report(catalog);
const getCatalog = () => { if (DEV) { catalog = loadCatalog(); } return catalog; };

const stats = openStats(DATA_DIR);

// Storink Daily: reload the catalog whenever the pipeline or the review page writes an edition.
setOnChange(() => { catalog = loadCatalog(); });
startScheduler();
startSocial(loadNewsConfig().series);

// ——— responses ———
const html = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", ...extra } });
const redirect = (to: string, status = 301) => new Response(null, { status, headers: { location: to, "cache-control": status === 301 ? "public, max-age=3600" : "no-store", vary: "accept-language" } });

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".avif": "image/avif", ".json": "application/json", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
};
const IMAGE = new Set([".webp", ".jpg", ".jpeg", ".png", ".svg", ".avif"]);

function serveFile(root: string, rel: string, cache: string, allowed?: Set<string>): Response | null {
  let path: string;
  try { path = normalize(decodeURIComponent(rel)); } catch { return null; }
  const abs = join(root, path);
  if (!(abs + sep).startsWith(root + sep) && abs !== root) return null;
  const ext = abs.slice(abs.lastIndexOf(".")).toLowerCase();
  if (allowed && !allowed.has(ext)) return null;
  const file = Bun.file(abs);
  if (!existsSync(abs) || !statSync(abs).isFile() || !file.size) return null;
  // Brand images are fetched cross-origin (setting up social pages from the browser).
  const cors: Record<string, string> = rel.replace(/^\//, "").startsWith("brand/") ? { "access-control-allow-origin": "*" } : {};
  return new Response(file, { headers: { "content-type": MIME[ext] || file.type, "cache-control": cache, "x-content-type-options": "nosniff", ...cors } });
}

// ——— host redirects (www → apex, old Railway address → storink.com) ———
function hostRedirect(req: Request, url: URL): Response | null {
  if (!CANONICAL_HOST) return null;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host).toLowerCase().split(":")[0];
  if (host === CANONICAL_HOST || host === "localhost" || host === "127.0.0.1") return null;
  if (url.pathname === "/e" || url.pathname === "/health") return null; // beacons from tabs still open on the old address
  const target = `https://${CANONICAL_HOST}`;
  if (host.endsWith(".up.railway.app") && (url.pathname === "/" || url.pathname === "/index.html")) {
    return redirect(`${target}/fr/monsieur-x/1${url.search}`); // the browser keeps #p12-style anchors on its own
  }
  return redirect(`${target}${url.pathname}${url.search}`);
}

// Addresses of the original single-episode reader.
const LEGACY_EP = "/media/monsieur-x/episodes/1/fr/";
function legacyRedirect(url: URL): Response | null {
  const p = url.pathname;
  if (p === "/index.html") return redirect("/fr/monsieur-x/1" + url.search);
  if (/^\/(pages|thumbs)\/[\w.-]+\.webp$/.test(p)) return redirect(LEGACY_EP + p.slice(1));
  if (p === "/og.jpg") return redirect(LEGACY_EP + "og.jpg");
  return null;
}

function sitemap(c: Catalog): string {
  const urls = new Set<string>();
  for (const l of UI_LANGS) { urls.add(`/${l}`); for (const pg of ["about", "credits"]) urls.add(`/${l}/${routeOf(l, pg)}`); }
  for (const s of c.series.values()) {
    if (s.status !== "published") continue;
    for (const l of UI_LANGS) urls.add(`/${l}/${s.slug}`);
    for (const { id, versions } of episodeList(s)) for (const e of versions.values()) {
      if (e.access !== "free") continue;
      if (e.format === "stories") for (const st of e.stories || []) urls.add(`/${e.lang}/${s.slug}/${id}/${st.id}`);
      else urls.add(`/${e.lang}/${s.slug}/${id}`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u) => `<url><loc>${config.siteUrl}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    const hr = hostRedirect(req, url); if (hr) return hr;
    if (path === "/e" && req.method === "POST") return track(req, stats, getCatalog(), SALT);
    if (path === "/health") return new Response("ok");
    const lg = await handleLogin(req, url); if (lg) return lg;
    if (path === "/admin" || path.startsWith("/admin/")) {
      if (!authorized(req)) return askAuth(req, url);
      const noStore = { "cache-control": "no-store" };
      if (req.method === "POST") {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
        if (origin && new URL(origin).host !== host) return new Response("Origine refusée", { status: 403 });
        try { const form = await req.formData().catch(() => new FormData()); return redirect(await adminPost(path, form), 303); }
        catch (e) { return html(`<p>Erreur : ${String((e as Error).message).replace(/[<&]/g, "")}</p><p><a href="/admin">Retour</a></p>`, 500, noStore); }
      }
      if (path === "/admin" || path === "/admin/") return html(adminHome(), 200, noStore);
      const m = /^\/admin\/[a-z0-9-]+\/(\d{4}-\d{2}-\d{2})$/.exec(path);
      const out = m && adminEdition(m[1], url.searchParams.get("ok") ? "Modifications enregistrées et en ligne." : "");
      return out ? html(out, 200, noStore) : html("Édition introuvable", 404, noStore);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response(null, { status: 405 });

    if (path === "/stats" || path === "/stats/") {
      if (!authorized(req)) return askAuth(req, url);
      return html(statsPage(stats, getCatalog(), url.searchParams), 200, { "cache-control": "no-store" });
    }
    if (path === "/stats/export") {
      if (!authorized(req)) return askAuth(req, url);
      const dir = mkdtempSync(join(tmpdir(), "storink-"));
      const file = join(dir, "stats.db");
      stats.exportTo(file);
      const bytes = await Bun.file(file).arrayBuffer();
      rmSync(dir, { recursive: true, force: true });
      return new Response(bytes, { headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="storink-stats-${new Date().toISOString().slice(0, 10)}.db"`, "cache-control": "no-store" } });
    }

    const lr = legacyRedirect(url); if (lr) return lr;

    // Share cards (title + bubble burned in): /cards/<series>/<day>/<story>/<n>-<lang>.jpg — public, needed by Instagram's API.
    const card = /^\/cards\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/([a-z0-9-]+)\/(\d+)-([a-z]{2})\.jpg$/.exec(path);
    if (card) {
      try {
        const [, series, day, story, n, l] = card;
        const bytes = renderCard({ series, day, storyId: story, slide: Number(n) - 1, lang: l, dateLabel: l === "fr" ? day.split("-").reverse().join(".") : new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) });
        return new Response(bytes, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
      } catch { return new Response("Introuvable", { status: 404 }); }
    }
    if (path.startsWith("/gen/")) {
      return serveFile(GEN_DIR, path.slice(5), "public, max-age=86400", IMAGE) ?? new Response("Introuvable", { status: 404 });
    }
    if (path.startsWith("/media/")) {
      return serveFile(SERIES_DIR, path.slice(7), "public, max-age=86400", IMAGE) ?? new Response("Introuvable", { status: 404 });
    }
    if (path === "/robots.txt") return new Response(`User-agent: *\nDisallow: /stats\nDisallow: /admin\nDisallow: /login\nSitemap: ${config.siteUrl}/sitemap.xml\n`, { headers: { "content-type": "text/plain" } });
    if (path === "/sitemap.xml") return new Response(sitemap(getCatalog()), { headers: { "content-type": "application/xml" } });

    if (path === "/") return redirect("/" + negotiate(req.headers.get("accept-language")), 302);

    // /:lang, /:lang/:page-or-series, /:lang/:series/:episode
    const parts = path.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    const c = getCatalog();
    const preview = url.searchParams.get("preview") === "1";
    if (parts.length && /^[a-z]{2}$/.test(parts[0])) {
      const [lang, a, b] = parts;
      if (parts.length === 1) return UI_LANGS.includes(lang) ? html(homePage(c, lang)) : redirect("/" + uiLang(lang), 302);
      if (parts.length === 2) {
        const pg = pageFromRoute(lang, a);
        if (pg) { const out = staticPage(pg, lang); if (out) return html(out); }
        const s = c.series.get(a);
        if (s && (s.status === "published" || preview)) return html(seriesPage(c, s, lang, preview));
      }
      // News series: /:lang/:series/:day lists the day on the series page; /:lang/:series/:day/:story reads one story.
      if (parts.length === 3 && c.series.get(a)?.type === "news") return redirect(`/${uiLang(lang)}/${a}#d${b}`, 302);
      if (parts.length === 4) {
        const s = c.series.get(a);
        const versions = s?.type === "news" ? s.episodes.get(b) : undefined;
        if (s && versions) {
          const e = versions.get(lang) ?? (() => { const vis = [...versions.values()].filter((v) => isVisible(v, preview)); return vis.length ? bestVersion(new Map(vis.map((v) => [v.lang, v])), lang) : undefined; })();
          if (e && isVisible(e, preview)) {
            if (e.lang !== lang) return redirect(`/${e.lang}/${a}/${b}/${parts[3]}${url.search}`, 302);
            const out = newsReaderPage(c, s, e, preview, parts[3]);
            if (out) return html(out);
          }
        }
      }
      if (parts.length === 3) {
        const s = c.series.get(a);
        const versions = s?.episodes.get(b);
        if (s && versions) {
          const e = versions.get(lang);
          if (e && isVisible(e, preview)) {
            if (e.access === "subscribers") return html(lockedPage(s, e, lang)); // accounts and subscriptions: not built yet
            return html(readerPage(c, s, e, preview));
          }
          // Episode not available in this language: send to the version that exists.
          const vis = new Map([...versions].filter(([, v]) => isVisible(v, preview)));
          if (vis.size) { const alt = bestVersion(vis, lang); return redirect(`/${alt.lang}/${s.slug}/${b}${url.search}`, 302); }
        }
      }
      if (parts.length >= 1) return html(notFoundPage(lang), 404);
    }

    const file = serveFile(PUBLIC, path, path.endsWith(".js") || path.endsWith(".css") ? "public, max-age=604800" : "public, max-age=86400");
    if (file) return file;
    return html(notFoundPage(negotiate(req.headers.get("accept-language"))), 404);
  },
});
console.log(`Storink en ligne sur :${PORT} (données: ${DATA_DIR}${CANONICAL_HOST ? `, domaine: ${CANONICAL_HOST}` : ""})`);
