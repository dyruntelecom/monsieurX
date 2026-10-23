// Automatic posting of Storink Daily to social networks (X for now; Instagram and LinkedIn plug in the same way).
// Each story is posted at its own time slot through the day, never twice: state is kept next to the edition
// (social.json). Posting runs only when SOCIAL_ENABLED=1 and the network's keys are set.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, GEN_DIR, readEdition, pick } from "../content";
import { renderCard } from "./cards";
import { fmtDate } from "../i18n";

export interface SocialConfig {
  enabled: boolean;
  firstSlot: string;   // "08:00" local time
  lastSlot: string;    // "21:00"
  editionPost: string; // "07:30": the daily post with the link to the edition
  timezone: string;
  x: { langs: string[] };
}
export const loadSocial = (): SocialConfig => JSON.parse(readFileSync(join(CONTENT, "news", "social.json"), "utf8"));
const SITE = () => (Bun.env.SITE_URL || "https://storink.com").replace(/\/$/, "");
export const socialOn = () => Bun.env.SOCIAL_ENABLED === "1";

// ——— state ———
type State = { posted: Record<string, { id: string; at: string }>; errors: Record<string, string> };
const statePath = (series: string, day: string) => join(GEN_DIR, series, "episodes", day, "social.json");
export function readState(series: string, day: string): State {
  try { return JSON.parse(readFileSync(statePath(series, day), "utf8")); } catch { return { posted: {}, errors: {} }; }
}
function writeState(series: string, day: string, s: State) {
  const p = statePath(series, day); const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2)); renameSync(tmp, p);
}

// ——— X (OAuth 1.0a user context) ———
const pct = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
function xKeys(lang: string) {
  const L = lang.toUpperCase();
  const k = { ck: Bun.env.X_API_KEY, cs: Bun.env.X_API_SECRET, t: Bun.env[`X_${L}_ACCESS_TOKEN`], ts: Bun.env[`X_${L}_ACCESS_SECRET`] };
  return k.ck && k.cs && k.t && k.ts ? (k as Record<keyof typeof k, string>) : null;
}
export const xReady = (lang: string) => !!xKeys(lang);

function oauthHeader(method: string, url: string, keys: { ck: string; cs: string; t: string; ts: string }, query: Record<string, string> = {}) {
  const o: Record<string, string> = {
    oauth_consumer_key: keys.ck, oauth_nonce: randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: keys.t, oauth_version: "1.0",
  };
  const all = { ...query, ...o };
  const base = [method.toUpperCase(), pct(url), pct(Object.keys(all).sort().map((k) => `${pct(k)}=${pct(all[k])}`).join("&"))].join("&");
  o.oauth_signature = createHmac("sha1", `${pct(keys.cs)}&${pct(keys.ts)}`).update(base).digest("base64");
  return "OAuth " + Object.keys(o).sort().map((k) => `${pct(k)}="${pct(o[k])}"`).join(", ");
}

async function xMedia(lang: string, jpegBytes: Uint8Array): Promise<string> {
  const keys = xKeys(lang)!;
  const url = "https://api.x.com/2/media/upload";
  const form = new FormData();
  form.append("media", new Blob([jpegBytes], { type: "image/jpeg" }), "card.jpg");
  form.append("media_category", "tweet_image");
  const r = await fetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url, keys) }, body: form, signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  const id = j?.data?.id || j?.data?.media_id || j?.media_id_string;
  if (!r.ok || !id) throw new Error(`X media ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return String(id);
}

async function xPost(lang: string, text: string, mediaIds: string[]): Promise<string> {
  const keys = xKeys(lang)!;
  const url = "https://api.x.com/2/tweets";
  const body: any = { text };
  if (mediaIds.length) body.media = { media_ids: mediaIds.slice(0, 4) };
  const r = await fetch(url, { method: "POST", headers: { authorization: oauthHeader("POST", url, keys), "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j?.data?.id) throw new Error(`X post ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return String(j.data.id);
}

/** X counts every character as 1 except a few ranges; keep a margin under 280. */
const clip = (s: string, max = 270) => (s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…");

// ——— schedule ———
function localNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

export interface PlannedPost { key: string; network: "x"; lang: string; kind: "edition" | "story"; storyId?: string; at: number; label: string }

export function plan(series: string, day: string): PlannedPost[] {
  const cfg = loadSocial();
  const ed = readEdition(series, day);
  if (!ed) return [];
  const stories = ed.stories.filter((s) => s.status !== "hidden" && s.slides.length);
  const a = toMin(cfg.firstSlot), b = toMin(cfg.lastSlot);
  const step = stories.length > 1 ? (b - a) / (stories.length - 1) : 0;
  const out: PlannedPost[] = [];
  for (const lang of cfg.x.langs) {
    out.push({ key: `x:${lang}:edition`, network: "x", lang, kind: "edition", at: toMin(cfg.editionPost), label: "Édition du jour (avec lien)" });
    stories.forEach((st, i) => out.push({ key: `x:${lang}:${st.id}`, network: "x", lang, kind: "story", storyId: st.id, at: Math.round(a + i * step), label: pick(st.headline, lang) }));
  }
  return out.sort((p, q) => p.at - q.at);
}

export async function publish(series: string, day: string, p: PlannedPost): Promise<string> {
  const ed = readEdition(series, day);
  if (!ed) throw new Error("édition introuvable");
  const dateLabel = fmtDate(p.lang, day);
  const cardDate = p.lang === "fr" ? day.split("-").reverse().join(".") : dateLabel;
  if (p.kind === "edition") {
    const stories = ed.stories.filter((s) => s.status !== "hidden" && s.slides.length);
    const first = stories[0];
    const media = first ? [await xMedia(p.lang, renderCard({ series, day, storyId: first.id, slide: 0, lang: p.lang, dateLabel: cardDate }))] : [];
    const intro = p.lang === "fr"
      ? `Storink Daily · ${dateLabel}\nL'actualité du jour en BD, ${stories.length} sujets à lire écran par écran :`
      : `Storink Daily · ${dateLabel}\nToday's news in comics, ${stories.length} stories to read screen by screen:`;
    return xPost(p.lang, clip(`${intro}\n${SITE()}/${p.lang}/${series}?utm_source=x`, 280), media);
  }
  const st = ed.stories.find((s) => s.id === p.storyId);
  if (!st || st.status === "hidden") throw new Error("sujet masqué ou supprimé");
  const media: string[] = [];
  for (let k = 0; k < Math.min(4, st.slides.length); k++) media.push(await xMedia(p.lang, renderCard({ series, day, storyId: st.id, slide: k, lang: p.lang, dateLabel: cardDate })));
  // No URL in story posts: on X's pay-per-use pricing a post with a link costs much more. The cards carry storink.com.
  const tag = p.lang === "fr" ? "L'actu en BD" : "News in comics";
  return xPost(p.lang, clip(`${pick(st.headline, p.lang)}\n\n${tag} · Storink Daily`), media);
}

// ——— runner ———
let busy = false;
export async function tick(series: string) {
  if (busy || !socialOn()) return;
  const cfg = loadSocial();
  if (!cfg.enabled) return;
  const { day, minutes } = localNow(cfg.timezone);
  if (!readEdition(series, day)) return;
  busy = true;
  try {
    const state = readState(series, day);
    for (const p of plan(series, day)) {
      if (p.at > minutes || state.posted[p.key] || state.errors[p.key]?.startsWith("missed")) continue;
      if (minutes - p.at > 90) { state.errors[p.key] = "missed: créneau dépassé de plus de 90 min (service arrêté ?)"; writeState(series, day, state); continue; }
      if (p.network === "x" && !xReady(p.lang)) continue;
      if ((state.errors[p.key] || "").startsWith("x3:")) continue; // gave up after 3 failures
      try {
        const id = await publish(series, day, p);
        state.posted[p.key] = { id, at: new Date().toISOString() }; delete state.errors[p.key];
        console.log(`Social : publié ${p.key} (${id})`);
      } catch (e) {
        const prev = state.errors[p.key] || ""; const n = (Number(prev.match(/^x(\d):/)?.[1]) || 0) + 1;
        state.errors[p.key] = `x${n}: ${(e as Error).message}`;
        console.warn(`Social : échec ${p.key} :`, (e as Error).message);
      }
      writeState(series, day, state);
      break; // one post per tick: spreads the load and keeps a failure from cascading
    }
  } finally { busy = false; }
}

export function startSocial(series: string) {
  if (!socialOn()) { console.log("Social : SOCIAL_ENABLED absent, publication automatique coupée"); return; }
  setInterval(() => tick(series).catch((e) => console.error(e)), 3 * 60000);
  setTimeout(() => tick(series).catch((e) => console.error(e)), 45000);
  console.log(`Social : publication automatique active (X ${loadSocial().x.langs.filter(xReady).join(", ") || "sans clés"})`);
}
