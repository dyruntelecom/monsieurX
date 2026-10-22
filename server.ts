// Monsieur X — liseuse + statistiques d'audience anonymes.
// Sert le dossier ./public et enregistre des événements dans SQLite (volume Railway monté sur /data).
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { join, normalize } from "node:path";

const PORT = Number(Bun.env.PORT || 8080);
const DATA_DIR = Bun.env.DATA_DIR || (existsSync("/data") ? "/data" : "./data");
const STATS_PASSWORD = Bun.env.STATS_PASSWORD || "";
const SALT = Bun.env.STATS_SALT || "monsieur-x";
const PUBLIC = join(import.meta.dir, "public");
const LABELS: string[] = await Bun.file(join(import.meta.dir, "labels.json")).json();

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(join(DATA_DIR, "stats.db"), { create: true });
db.exec("PRAGMA journal_mode=WAL;");
db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL, day TEXT NOT NULL, t TEXT NOT NULL,
  sid TEXT, vid TEXT, p INTEGER, m TEXT, src TEXT, dev TEXT, country TEXT
)`);
db.exec("CREATE INDEX IF NOT EXISTS ev_t ON events(t, day)");
const insert = db.prepare(
  "INSERT INTO events (ts, day, t, sid, vid, p, m, src, dev, country) VALUES (?,?,?,?,?,?,?,?,?,?)",
);

const TYPES = new Set(["view", "start", "page", "mode"]);

function sourceOf(ref: string, q: string): string {
  const utm = /[?&]utm_source=([^&]+)/.exec(q || "");
  if (utm) return decodeURIComponent(utm[1]).toLowerCase().slice(0, 40);
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (/linkedin|lnkd/.test(h)) return "linkedin";
    if (/facebook|fb\.|messenger/.test(h)) return "facebook";
    if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
    if (/t\.co$|twitter|x\.com/.test(h)) return "x";
    if (/google/.test(h)) return "google";
    if (/mail|outlook/.test(h)) return "e-mail";
    return h.slice(0, 40);
  } catch { return "autre"; }
}

async function visitorId(req: Request, day: string): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const ua = req.headers.get("user-agent") || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${SALT}|${day}|${ip}|${ua}`));
  return Buffer.from(buf).toString("hex").slice(0, 16); // daily, non-reversible: no IP is stored
}

async function track(req: Request): Promise<Response> {
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    const b = JSON.parse(text);
    if (!TYPES.has(b.t)) return new Response(null, { status: 400 });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const ua = req.headers.get("user-agent") || "";
    if (/bot|crawl|spider|preview|facebookexternalhit|linkedinbot|slurp/i.test(ua)) return new Response(null, { status: 204 });
    const dev = /iPad|Tablet/i.test(ua) ? "tablette" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "ordinateur";
    const country = (req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || "").slice(0, 2) || null;
    const p = Number.isInteger(b.p) && b.p >= 0 && b.p < LABELS.length ? b.p : null;
    const m = b.m === "case" || b.m === "page" ? b.m : null;
    const src = b.t === "view" ? sourceOf(String(b.ref || ""), String(b.q || "")) : null;
    insert.run(now, day, b.t, String(b.sid || "").slice(0, 40), await visitorId(req, day), p, m, src, dev, country);
  } catch { /* ignore malformed beacons */ }
  return new Response(null, { status: 204 });
}

function authorized(req: Request): boolean {
  if (!STATS_PASSWORD) return false;
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  const [, pass] = atob(h.slice(6)).split(/:(.*)/s);
  return pass === STATS_PASSWORD;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number) => n.toLocaleString("fr-FR");

function bars(rows: { k: string; v: number }[], total?: number) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<table class="bars">${rows.map((r) => `<tr><th>${esc(r.k)}</th><td><i style="width:${(r.v / max) * 100}%"></i></td><td class="n">${fmt(r.v)}${total ? ` <small>${Math.round((r.v / Math.max(1, total)) * 100)} %</small>` : ""}</td></tr>`).join("")}</table>`;
}

function statsPage(range: number): string {
  const since = new Date(Date.now() - (range - 1) * 864e5).toISOString().slice(0, 10);
  const one = (sql: string) => (db.query(sql).get(since) as any)?.n ?? 0;
  const views = one("SELECT COUNT(*) n FROM events WHERE t='view' AND day>=?");
  const visitors = one("SELECT COUNT(DISTINCT vid||day) n FROM events WHERE t='view' AND day>=?");
  const starts = one("SELECT COUNT(DISTINCT sid) n FROM events WHERE t='start' AND day>=?");
  const last = LABELS.length - 1;
  const finished = (db.query("SELECT COUNT(DISTINCT sid) n FROM events WHERE t='page' AND p=? AND day>=?").get(last, since) as any).n;
  const perDay = db.query("SELECT day k, COUNT(*) v FROM events WHERE t='view' AND day>=? GROUP BY day ORDER BY day").all(since) as any[];
  const sources = db.query("SELECT src k, COUNT(*) v FROM events WHERE t='view' AND day>=? GROUP BY src ORDER BY v DESC LIMIT 12").all(since) as any[];
  const devices = db.query("SELECT dev k, COUNT(DISTINCT sid) v FROM events WHERE t='view' AND day>=? GROUP BY dev ORDER BY v DESC").all(since) as any[];
  const modes = db.query("SELECT m k, COUNT(DISTINCT sid) v FROM events WHERE t='start' AND day>=? GROUP BY m ORDER BY v DESC").all(since) as any[];
  const countries = db.query("SELECT country k, COUNT(DISTINCT sid) v FROM events WHERE t='view' AND country IS NOT NULL AND day>=? GROUP BY country ORDER BY v DESC LIMIT 10").all(since) as any[];
  const reach = new Map((db.query("SELECT p, COUNT(DISTINCT sid) v FROM events WHERE t='page' AND day>=? GROUP BY p").all(since) as any[]).map((r) => [r.p, r.v]));
  const funnel = LABELS.map((l, i) => ({ k: i === 0 ? l : /^\d/.test(l) ? "Planche " + l : l, v: reach.get(i) || 0 })).slice(1);
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + " %" : "—");
  const tabs = [1, 7, 30, 365].map((r) => `<a href="?d=${r}" class="${r === range ? "on" : ""}">${r === 1 ? "Aujourd'hui" : r === 365 ? "12 mois" : r + " jours"}</a>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stats · Monsieur X</title>
<style>
:root{--bg:#0c0e12;--ink:#16191f;--line:#2a2f38;--fg:#efe4cf;--mut:#8d96a3;--red:#c8352b;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:24px max(16px,env(safe-area-inset-left)) 48px}
main{max-width:980px;margin:0 auto;display:grid;gap:28px}
h1{font-size:1.6rem;margin:0}h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:0 0 10px;font-weight:600}
.tabs{display:flex;gap:6px;flex-wrap:wrap}.tabs a{color:var(--mut);text-decoration:none;border:1px solid var(--line);padding:6px 12px}.tabs a.on{color:var(--bg);background:var(--fg);border-color:var(--fg)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi{background:var(--ink);border:1px solid var(--line);padding:14px}
.kpi b{display:block;font-size:2rem;font-variant-numeric:tabular-nums}.kpi span{color:var(--mut);font-size:.85rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px}
table.bars{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.bars th{text-align:left;font-weight:400;padding:3px 10px 3px 0;white-space:nowrap;width:1%;color:var(--fg)}
.bars td{padding:3px 0}.bars td i{display:block;height:12px;background:var(--red);min-width:2px}.bars td.n{text-align:right;padding-left:10px;white-space:nowrap;width:1%}
small{color:var(--mut)}.note{color:var(--mut);font-size:.85rem;max-width:70ch}
</style></head><body><main>
<div><h1>Monsieur X · audience</h1><p class="note">Épisode 1 · Popov. Statistiques anonymes : aucune adresse IP ni cookie n'est enregistré.</p></div>
<nav class="tabs">${tabs}</nav>
<section class="kpis">
<div class="kpi"><b>${fmt(views)}</b><span>Ouvertures</span></div>
<div class="kpi"><b>${fmt(visitors)}</b><span>Visiteurs uniques (par jour)</span></div>
<div class="kpi"><b>${fmt(starts)}</b><span>Ont commencé la lecture · ${pct(starts, views)}</span></div>
<div class="kpi"><b>${fmt(finished)}</b><span>Sont allés jusqu'au bout · ${pct(finished, starts)}</span></div>
</section>
<section><h2>Lecture planche par planche (lecteurs ayant atteint la page)</h2>${bars(funnel, starts)}</section>
<div class="grid">
<section><h2>Ouvertures par jour</h2>${perDay.length ? bars(perDay) : '<p class="note">Pas encore de données.</p>'}</section>
<section><h2>Provenance</h2>${sources.length ? bars(sources, views) : '<p class="note">Pas encore de données.</p>'}</section>
<section><h2>Appareil</h2>${devices.length ? bars(devices) : '<p class="note">—</p>'}</section>
<section><h2>Mode de lecture choisi</h2>${modes.length ? bars(modes.map((r) => ({ k: r.k === "case" ? "Case par case" : "Page par page", v: r.v }))) : '<p class="note">—</p>'}</section>
${countries.length ? `<section><h2>Pays</h2>${bars(countries)}</section>` : ""}
</div>
<p class="note">Astuce : ajoutez <code>?utm_source=nom</code> au lien pour suivre une diffusion précise (ex. <code>?utm_source=newsletter</code>).</p>
</main></body></html>`;
}

const TYPES_MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon" };

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/e" && req.method === "POST") return track(req);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname === "/stats") {
      if (!authorized(req)) return new Response("Accès réservé", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Stats Monsieur X", charset="UTF-8"' } });
      const d = [1, 7, 30, 365].includes(Number(url.searchParams.get("d"))) ? Number(url.searchParams.get("d")) : 30;
      return new Response(statsPage(d), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path === "/" || path === "") path = "/index.html";
    const file = Bun.file(join(PUBLIC, path));
    if (!file.size || !join(PUBLIC, path).startsWith(PUBLIC)) return new Response("Page introuvable", { status: 404 });
    const ext = path.slice(path.lastIndexOf("."));
    const cache = ext === ".html" ? "no-cache" : "public, max-age=604800";
    return new Response(file, { headers: { "content-type": TYPES_MIME[ext] || file.type, "cache-control": cache, "x-content-type-options": "nosniff" } });
  },
});
console.log(`Monsieur X en ligne sur :${PORT} (données: ${DATA_DIR})`);
