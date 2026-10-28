// Private pages (/stats, /admin): sign-in with a 6-digit code from an authenticator app (TOTP, RFC 6238),
// then a signed session cookie valid 30 days. This cookie only exists for the site owner on /stats and /admin;
// readers never get one.
// The old password (STATS_PASSWORD, HTTP Basic) still works if a client sends it, but the browser is no longer asked for it.
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const TOTP_SECRET = (Bun.env.TOTP_SECRET || "").replace(/[\s=]/g, "").toUpperCase();
const STATS_PASSWORD = Bun.env.STATS_PASSWORD || "";
const COOKIE = "storink_admin";
const SESSION_DAYS = 30;

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of s) {
    const i = B32.indexOf(ch); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function newSecret(): string {
  const bytes = randomBytes(20); let bits = 0, value = 0, out = "";
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

const KEY = TOTP_SECRET ? base32Decode(TOTP_SECRET) : Buffer.alloc(0);
// Session signing key derived from the TOTP secret: changing the secret signs everyone out.
const SIGN_KEY = createHmac("sha256", KEY).update("storink-session").digest();

function hotp(counter: number): string {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", KEY).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

let lastUsedStep = 0; // a code is accepted once only
function checkCode(code: string): boolean {
  if (!KEY.length || !/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 30_000);
  for (const d of [0, -1, 1]) {
    const s = step + d;
    if (s <= lastUsedStep) continue;
    const a = Buffer.from(hotp(s)), b = Buffer.from(code);
    if (timingSafeEqual(a, b)) { lastUsedStep = s; return true; }
  }
  return false;
}

// Failed attempts, in memory only (never stored): 5 tries per 15 minutes, all clients together.
let fails: number[] = [];
const blocked = () => { const now = Date.now(); fails = fails.filter((t) => now - t < 15 * 60_000); return fails.length >= 5; };

const sign = (payload: string) => createHmac("sha256", SIGN_KEY).update(payload).digest("base64url");
function sessionCookie(): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const v = `${exp}.${sign(String(exp))}`;
  return `${COOKIE}=${v}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
}
function validSession(req: Request): boolean {
  if (!KEY.length) return false;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([A-Za-z0-9_-]+)`).exec(req.headers.get("cookie") || "");
  if (!m) return false;
  const exp = Number(m[1]); if (!(exp > Date.now())) return false;
  const a = Buffer.from(sign(m[1])), b = Buffer.from(m[2]);
  return a.length === b.length && timingSafeEqual(a, b);
}
function validBasic(req: Request): boolean {
  if (!STATS_PASSWORD) return false;
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return false;
  try { const [, pass] = atob(h.slice(6)).split(/:(.*)/s); return pass === STATS_PASSWORD; } catch { return false; }
}

export const authorized = (req: Request) => validSession(req) || validBasic(req);

const safeNext = (n: string | null) => (n && /^\/(stats|admin)(\/[\w\/.-]*)?(\?[\w=&%.-]*)?$/.test(n) ? n : "/stats");

/** What an unauthenticated visitor gets: the sign-in page (or a 401 for a non-browser request). */
export function askAuth(req: Request, url: URL): Response {
  if (!KEY.length) {
    // No authenticator configured yet: keep the old password prompt.
    return new Response("Accès réservé", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Stats Storink", charset="UTF-8"' } });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Accès réservé", { status: 401 });
  return new Response(null, { status: 303, headers: { location: `/login?next=${encodeURIComponent(url.pathname + url.search)}`, "cache-control": "no-store" } });
}

const page = (next: string, msg = "") => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Connexion · Storink</title>
<style>
:root{color-scheme:light dark;--bg:#f4f1ea;--fg:#1d1d1f;--mute:#6b6b6b;--line:#d8d2c4;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--fg:#ececec;--mute:#9a9a9a;--line:#33353a;--err:#f2b8b5}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.4 system-ui,-apple-system,sans-serif}
form{width:min(320px,100% - 32px);display:grid;gap:14px}
h1{font-size:20px;margin:0}p{margin:0;color:var(--mute);font-size:14px}
input{font:600 28px/1 ui-monospace,monospace;letter-spacing:.3em;text-align:center;padding:14px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit}
button{font:600 16px system-ui;padding:14px;border:0;border-radius:10px;background:var(--fg);color:var(--bg);cursor:pointer}
.err{color:var(--err)}
</style></head><body>
<form method="post" action="/login">
<h1>Storink · accès privé</h1>
<p>Code à 6 chiffres de ton application d'authentification.</p>
${msg ? `<p class="err">${msg}</p>` : ""}
<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus aria-label="Code">
<input type="hidden" name="next" value="${next.replace(/[&"<>]/g, "")}">
<button>Entrer</button>
</form></body></html>`;

const htmlRes = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", ...extra } });

/** /login (GET: form, POST: check code) and /logout. Returns null for any other path. */
export async function handleLogin(req: Request, url: URL): Promise<Response | null> {
  if (url.pathname === "/logout") {
    return new Response(null, { status: 303, headers: { location: "/", "set-cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } });
  }
  if (url.pathname !== "/login") return null;
  if (!KEY.length) return new Response(null, { status: 303, headers: { location: "/stats" } });
  if (req.method === "GET") {
    const next = safeNext(url.searchParams.get("next"));
    if (validSession(req)) return new Response(null, { status: 303, headers: { location: next } });
    return htmlRes(page(next));
  }
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  if (origin && new URL(origin).host !== host) return new Response("Origine refusée", { status: 403 });
  const form = await req.formData().catch(() => new FormData());
  const next = safeNext(String(form.get("next") || ""));
  if (blocked()) return htmlRes(page(next, "Trop d'essais. Réessaie dans un quart d'heure."), 429);
  if (!checkCode(String(form.get("code") || "").replace(/\s/g, ""))) {
    fails.push(Date.now());
    return htmlRes(page(next, "Code incorrect ou déjà utilisé."), 401);
  }
  return new Response(null, { status: 303, headers: { location: next, "set-cookie": sessionCookie() } });
}

// Test hook: current code for a secret (used by tools/totp.ts).
export const codeFor = (secret: string, t = Date.now()) => {
  const key = base32Decode(secret.toUpperCase());
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(Math.floor(t / 30_000)));
  const h = createHmac("sha1", key).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, "0");
};
