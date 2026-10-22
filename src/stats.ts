// Anonymous audience statistics (SQLite on the Railway volume). No IP address and no cookie is stored:
// the visitor id is a daily, salted, non-reversible hash; the session id lives in sessionStorage.
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Catalog, Episode } from "./content";

export const TYPES = new Set(["view", "start", "page", "mode"]);
const KEEP_BACKUPS = 14;

export function openStats(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "stats.db");
  const existed = existsSync(dbPath);
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL, day TEXT NOT NULL, t TEXT NOT NULL,
    sid TEXT, vid TEXT, p INTEGER, m TEXT, src TEXT, dev TEXT, country TEXT
  )`);

  const backupDir = join(dataDir, "backups");
  const backup = (tag: string) => {
    mkdirSync(backupDir, { recursive: true });
    const file = join(backupDir, `stats-${new Date().toISOString().slice(0, 10)}-${tag}.db`);
    if (!existsSync(file)) db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return file;
  };

  // Migration v2 (Storink): add series / episode / language to every event. Additive only.
  const cols = new Set((db.query("PRAGMA table_info(events)").all() as any[]).map((c) => c.name));
  if (!cols.has("series")) {
    if (existed) console.log("Sauvegarde avant migration :", backup("avant-storink"));
    db.transaction(() => {
      db.exec("ALTER TABLE events ADD COLUMN series TEXT");
      db.exec("ALTER TABLE events ADD COLUMN ep TEXT");
      db.exec("ALTER TABLE events ADD COLUMN lang TEXT");
      // Every event recorded before Storink belongs to the only episode that existed.
      const n = db.prepare("UPDATE events SET series='monsieur-x', ep='1', lang='fr' WHERE series IS NULL").run().changes;
      console.log(`Migration des stats : ${n} événements rattachés à monsieur-x / 1 / fr`);
    })();
  }
  db.exec("CREATE INDEX IF NOT EXISTS ev_t ON events(t, day)");
  db.exec("CREATE INDEX IF NOT EXISTS ev_ep ON events(series, ep, lang, t)");

  // Daily rolling backup, the last KEEP_BACKUPS kept.
  const daily = () => {
    try {
      backup("quotidien");
      const files = readdirSync(backupDir).filter((f) => f.endsWith("-quotidien.db")).sort();
      for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) unlinkSync(join(backupDir, f));
    } catch (e) { console.error("Sauvegarde quotidienne impossible", e); }
  };
  daily();
  setInterval(daily, 6 * 3600e3);

  const insert = db.prepare(
    "INSERT INTO events (ts, day, t, sid, vid, p, m, src, dev, country, series, ep, lang) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  return { db, insert, exportTo: (file: string) => db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`) };
}
export type Stats = ReturnType<typeof openStats>;

export function sourceOf(ref: string, q: string): string {
  const utm = /[?&]utm_source=([^&]+)/.exec(q || "");
  if (utm) { try { return decodeURIComponent(utm[1]).toLowerCase().slice(0, 40); } catch { return utm[1].toLowerCase().slice(0, 40); } }
  if (!ref) return "direct";
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (/(^|\.)storink\.com$|up\.railway\.app$|^localhost$/.test(h)) return "storink";
    if (/linkedin|lnkd/.test(h)) return "linkedin";
    if (/facebook|fb\.|messenger/.test(h)) return "facebook";
    if (/whatsapp|wa\.me/.test(h)) return "whatsapp";
    if (/t\.co$|twitter|x\.com/.test(h)) return "x";
    if (/google/.test(h)) return "google";
    if (/mail|outlook/.test(h)) return "e-mail";
    return h.slice(0, 40);
  } catch { return "autre"; }
}

async function visitorId(req: Request, day: string, salt: string): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const ua = req.headers.get("user-agent") || "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${day}|${ip}|${ua}`));
  return Buffer.from(buf).toString("hex").slice(0, 16); // daily, non-reversible: no IP is stored
}

export async function track(req: Request, stats: Stats, catalog: Catalog, salt: string): Promise<Response> {
  try {
    const text = await req.text();
    if (text.length > 2000) return new Response(null, { status: 413 });
    const b = JSON.parse(text);
    if (!TYPES.has(b.t)) return new Response(null, { status: 400 });
    const ua = req.headers.get("user-agent") || "";
    if (/bot|crawl|spider|preview|facebookexternalhit|linkedinbot|slurp/i.test(ua)) return new Response(null, { status: 204 });
    // Beacons from the legacy reader (still open in someone's tab) carry no episode: it can only be Monsieur X 1 (fr).
    const series = typeof b.s === "string" ? b.s : "monsieur-x";
    const ep = typeof b.e === "string" ? b.e : "1";
    const lang = typeof b.l === "string" ? b.l : "fr";
    const episode = catalog.series.get(series)?.episodes.get(ep)?.get(lang);
    if (!episode) return new Response(null, { status: 204 });
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const dev = /iPad|Tablet/i.test(ua) ? "tablette" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "ordinateur";
    const country = (req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || "").slice(0, 2) || null;
    const p = Number.isInteger(b.p) && b.p >= 0 && b.p < episode.pages.length ? b.p : null;
    const m = b.m === "case" || b.m === "page" ? b.m : null;
    const src = b.t === "view" ? sourceOf(String(b.ref || ""), String(b.q || "")) : null;
    stats.insert.run(now, day, b.t, String(b.sid || "").slice(0, 40), await visitorId(req, day, salt), p, m, src, dev, country, series, ep, lang);
  } catch { /* ignore malformed beacons */ }
  return new Response(null, { status: 204 });
}

// ——— /stats page ———

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const fmt = (n: number) => n.toLocaleString("fr-FR");

function bars(rows: { k: string; v: number }[], total?: number) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return `<table class="bars">${rows.map((r) => `<tr><th>${esc(r.k)}</th><td><i style="width:${(r.v / max) * 100}%"></i></td><td class="n">${fmt(r.v)}${total ? ` <small>${Math.round((r.v / Math.max(1, total)) * 100)} %</small>` : ""}</td></tr>`).join("")}</table>`;
}

function plateLabel(e: Episode, i: number): string {
  const pg = e.pages[i];
  if (!pg) return `n°${i}`;
  return pg.kind === "comic" || pg.kind === "spread" ? "Planche " + pg.label : pg.label;
}

export function statsPage(stats: Stats, catalog: Catalog, q: URLSearchParams): string {
  const { db } = stats;
  const range = [1, 7, 30, 365].includes(Number(q.get("d"))) ? Number(q.get("d")) : 30;
  const fSeries = q.get("s") || "", fEp = q.get("e") || "", fLang = q.get("l") || "";
  const since = new Date(Date.now() - (range - 1) * 864e5).toISOString().slice(0, 10);

  const where: string[] = ["day>=?"]; const args: any[] = [since];
  if (fSeries) { where.push("series=?"); args.push(fSeries); }
  if (fEp) { where.push("ep=?"); args.push(fEp); }
  if (fLang) { where.push("lang=?"); args.push(fLang); }
  const W = where.join(" AND ");
  const all = (sql: string, ...extra: any[]) => db.query(sql).all(...extra, ...args) as any[];
  const one = (sql: string, ...extra: any[]) => ((db.query(sql).get(...extra, ...args) as any)?.n ?? 0) as number;

  const views = one(`SELECT COUNT(*) n FROM events WHERE t='view' AND ${W}`);
  const visitors = one(`SELECT COUNT(DISTINCT vid||day) n FROM events WHERE t='view' AND ${W}`);
  const starts = one(`SELECT COUNT(DISTINCT sid) n FROM events WHERE t='start' AND ${W}`);

  // "Finished" = reached the last page of the episode version they were reading.
  let finished = 0;
  const versions: Episode[] = [];
  for (const s of catalog.series.values()) for (const [, vs] of s.episodes) for (const e of vs.values()) versions.push(e);
  const inFilter = (e: Episode) => (!fSeries || e.series === fSeries) && (!fEp || e.episode === fEp) && (!fLang || e.lang === fLang);
  for (const e of versions.filter(inFilter)) {
    if (!e.pages.length) continue;
    finished += (db.query(`SELECT COUNT(DISTINCT sid) n FROM events WHERE t='page' AND p=? AND series=? AND ep=? AND lang=? AND ${W}`)
      .get(e.pages.length - 1, e.series, e.episode, e.lang, ...args) as any).n;
  }

  const perDay = all(`SELECT day k, COUNT(*) v FROM events WHERE t='view' AND ${W} GROUP BY day ORDER BY day`);
  const sources = all(`SELECT src k, COUNT(*) v FROM events WHERE t='view' AND ${W} GROUP BY src ORDER BY v DESC LIMIT 12`);
  const devices = all(`SELECT dev k, COUNT(DISTINCT sid) v FROM events WHERE t='view' AND ${W} GROUP BY dev ORDER BY v DESC`);
  const modes = all(`SELECT m k, COUNT(DISTINCT sid) v FROM events WHERE t='start' AND ${W} GROUP BY m ORDER BY v DESC`);
  const countries = all(`SELECT country k, COUNT(DISTINCT sid) v FROM events WHERE t='view' AND country IS NOT NULL AND ${W} GROUP BY country ORDER BY v DESC LIMIT 10`);
  const byEpisode = all(`SELECT series||' · '||ep||' · '||lang k, COUNT(*) v FROM events WHERE t='view' AND ${W} GROUP BY series, ep, lang ORDER BY v DESC LIMIT 20`);

  // Page-by-page funnel needs one episode version: the filtered one, or the only one with data.
  let funnelEp: Episode | undefined;
  const candidates = versions.filter(inFilter).filter((e) => e.pages.length);
  const withData = candidates.filter((e) => (db.query(`SELECT 1 FROM events WHERE series=? AND ep=? AND lang=? AND ${W} LIMIT 1`).get(e.series, e.episode, e.lang, ...args)));
  if (candidates.length === 1) funnelEp = candidates[0]; else if (withData.length === 1) funnelEp = withData[0];
  let funnel = "";
  if (funnelEp) {
    const e = funnelEp;
    const reach = new Map((db.query(`SELECT p, COUNT(DISTINCT sid) v FROM events WHERE t='page' AND series=? AND ep=? AND lang=? AND ${W} GROUP BY p`).all(e.series, e.episode, e.lang, ...args) as any[]).map((r) => [r.p, r.v]));
    const st = (db.query(`SELECT COUNT(DISTINCT sid) n FROM events WHERE t='start' AND series=? AND ep=? AND lang=? AND ${W}`).get(e.series, e.episode, e.lang, ...args) as any).n;
    const rows = e.pages.map((_, i) => ({ k: plateLabel(e, i), v: reach.get(i) || 0 })).slice(1);
    funnel = `<section><h2>Lecture planche par planche · ${esc(e.series)} ${esc(e.episode)} (${esc(e.lang)})</h2>${bars(rows, st)}</section>`;
  } else {
    funnel = `<section><h2>Lecture planche par planche</h2><p class="note">Choisissez une série, un épisode et une langue pour voir jusqu'où les lecteurs vont.</p></section>`;
  }

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + " %" : "—");
  const link = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ d: String(range), s: fSeries, e: fEp, l: fLang });
    for (const [k, v] of Object.entries(over)) p.set(k, String(v));
    for (const k of [...p.keys()]) if (!p.get(k)) p.delete(k);
    return "?" + p.toString();
  };
  const tabs = [1, 7, 30, 365].map((r) => `<a href="${link({ d: r })}" class="${r === range ? "on" : ""}">${r === 1 ? "Aujourd'hui" : r === 365 ? "12 mois" : r + " jours"}</a>`).join("");

  const seriesOpts = [...catalog.series.values()].map((s) => `<option value="${esc(s.slug)}"${s.slug === fSeries ? " selected" : ""}>${esc(s.title.fr || Object.values(s.title)[0])}</option>`).join("");
  const epSet = new Set<string>(); const langSet = new Set<string>();
  for (const e of versions) { if (!fSeries || e.series === fSeries) { epSet.add(e.episode); langSet.add(e.lang); } }
  for (const r of db.query("SELECT DISTINCT ep, lang FROM events WHERE ep IS NOT NULL").all() as any[]) { epSet.add(r.ep); langSet.add(r.lang); }
  const epOpts = [...epSet].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)).map((e) => `<option${e === fEp ? " selected" : ""}>${esc(e)}</option>`).join("");
  const langOpts = [...langSet].sort().map((l) => `<option${l === fLang ? " selected" : ""}>${esc(l)}</option>`).join("");
  const filterLabel = [fSeries || "toutes les séries", fEp ? "épisode " + fEp : "", fLang].filter(Boolean).join(" · ");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Stats · Storink</title>
<style>
:root{--bg:#0c0e12;--ink:#16191f;--line:#2a2f38;--fg:#efe4cf;--mut:#8d96a3;--red:#c8352b;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:24px max(16px,env(safe-area-inset-left)) 48px}
main{max-width:980px;margin:0 auto;display:grid;gap:28px}
h1{font-size:1.6rem;margin:0}h2{font-size:.85rem;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:0 0 10px;font-weight:600}
.tabs{display:flex;gap:6px;flex-wrap:wrap}.tabs a{color:var(--mut);text-decoration:none;border:1px solid var(--line);padding:6px 12px}.tabs a.on{color:var(--bg);background:var(--fg);border-color:var(--fg)}
form.f{display:flex;gap:8px;flex-wrap:wrap;align-items:end}form.f label{display:grid;gap:4px;font-size:.8rem;color:var(--mut)}
form.f select,form.f button{font:inherit;background:var(--ink);color:var(--fg);border:1px solid var(--line);padding:6px 10px;min-width:9rem}
form.f button{min-width:0;cursor:pointer}form.f a{color:var(--mut);font-size:.85rem;padding:8px 4px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi{background:var(--ink);border:1px solid var(--line);padding:14px}
.kpi b{display:block;font-size:2rem;font-variant-numeric:tabular-nums}.kpi span{color:var(--mut);font-size:.85rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px}
table.bars{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.bars th{text-align:left;font-weight:400;padding:3px 10px 3px 0;white-space:nowrap;width:1%;color:var(--fg)}
.bars td{padding:3px 0}.bars td i{display:block;height:12px;background:var(--red);min-width:2px}.bars td.n{text-align:right;padding-left:10px;white-space:nowrap;width:1%}
small{color:var(--mut)}.note{color:var(--mut);font-size:.85rem;max-width:70ch}a{color:var(--fg)}
</style></head><body><main>
<div><h1>Storink · audience</h1><p class="note">${esc(filterLabel)}. Statistiques anonymes : aucune adresse IP ni cookie n'est enregistré.</p></div>
<nav class="tabs">${tabs}</nav>
<form class="f" method="get">
<input type="hidden" name="d" value="${range}">
<label>Série<select name="s"><option value="">Toutes</option>${seriesOpts}</select></label>
<label>Épisode<select name="e"><option value="">Tous</option>${epOpts}</select></label>
<label>Langue<select name="l"><option value="">Toutes</option>${langOpts}</select></label>
<button>Filtrer</button>${fSeries || fEp || fLang ? `<a href="?d=${range}">Effacer</a>` : ""}
</form>
<section class="kpis">
<div class="kpi"><b>${fmt(views)}</b><span>Ouvertures</span></div>
<div class="kpi"><b>${fmt(visitors)}</b><span>Visiteurs uniques (par jour)</span></div>
<div class="kpi"><b>${fmt(starts)}</b><span>Ont commencé la lecture · ${pct(starts, views)}</span></div>
<div class="kpi"><b>${fmt(finished)}</b><span>Sont allés jusqu'au bout · ${pct(finished, starts)}</span></div>
</section>
${funnel}
<div class="grid">
${!fEp ? `<section><h2>Ouvertures par épisode</h2>${byEpisode.length ? bars(byEpisode, views) : '<p class="note">Pas encore de données.</p>'}</section>` : ""}
<section><h2>Ouvertures par jour</h2>${perDay.length ? bars(perDay) : '<p class="note">Pas encore de données.</p>'}</section>
<section><h2>Provenance</h2>${sources.length ? bars(sources, views) : '<p class="note">Pas encore de données.</p>'}</section>
<section><h2>Appareil</h2>${devices.length ? bars(devices) : '<p class="note">—</p>'}</section>
<section><h2>Mode de lecture choisi</h2>${modes.length ? bars(modes.map((r) => ({ k: r.k === "case" ? "Case par case" : "Page par page", v: r.v }))) : '<p class="note">—</p>'}</section>
${countries.length ? `<section><h2>Pays</h2>${bars(countries)}</section>` : ""}
</div>
<p class="note">Astuce : ajoutez <code>?utm_source=nom</code> au lien pour suivre une diffusion précise (ex. <code>?utm_source=newsletter</code>). Sauvegarde complète de la base : <a href="/stats/export">télécharger stats.db</a>.</p>
</main></body></html>`;
}
