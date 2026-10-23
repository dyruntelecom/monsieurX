// OpenAI calls for the news pipeline: JSON chat (selection, scripts, translations) and image generation.
// Model ids come from OPENAI_TEXT_MODEL / OPENAI_IMAGE_MODEL, or are picked from the account's model list.
// NEWS_MOCK=1 replaces every call with local stand-ins, for tests without a key or network.

const API = "https://api.openai.com/v1";
export const MOCK = Bun.env.NEWS_MOCK === "1";
const key = () => Bun.env.OPENAI_API_KEY || "";
export const aiReady = () => MOCK || !!key();

const TEXT_PREFS = ["gpt-6.1-sol", "gpt-6-luna", "gpt-6-astra", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-4.1", "gpt-4o"];
const IMAGE_PREFS = ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "gpt-image-2", "gpt-image-1.5", "gpt-image-1"];

let models: { text: string; image: string } | null = null;

async function api(path: string, body?: unknown): Promise<any> {
  const r = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${key()}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(240000),
  });
  const text = await r.text();
  let json: any = null; try { json = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error(`OpenAI ${path} ${r.status}: ${json?.error?.message || text.slice(0, 300)}`);
  return json;
}

export async function resolveModels(): Promise<{ text: string; image: string }> {
  if (models) return models;
  if (MOCK) return (models = { text: "mock", image: "mock" });
  let ids: string[] = [];
  try { ids = ((await api("/models")).data || []).map((m: any) => m.id); } catch (e) { console.warn("Liste des modèles OpenAI indisponible :", (e as Error).message); }
  const choose = (env: string | undefined, prefs: string[], re: RegExp, fallback: string) =>
    env || prefs.find((p) => ids.includes(p)) || ids.filter((i) => re.test(i)).sort().reverse()[0] || fallback;
  models = {
    text: choose(Bun.env.OPENAI_TEXT_MODEL, TEXT_PREFS, /^gpt-\d/, "gpt-4.1"),
    image: choose(Bun.env.OPENAI_IMAGE_MODEL, IMAGE_PREFS, /^gpt-image/, "gpt-image-1"),
  };
  console.log(`News : modèles OpenAI retenus — texte ${models.text}, image ${models.image}`);
  return models;
}

function parseJson(s: string): any {
  try { return JSON.parse(s); } catch {}
  const m = /\{[\s\S]*\}/.exec(s);
  if (m) return JSON.parse(m[0]);
  throw new Error("réponse non JSON");
}

/** Chat call that must return a JSON object. `mock` is what NEWS_MOCK returns. */
export async function chatJson<T = any>(system: string, user: string, mock: () => T): Promise<T> {
  if (MOCK) return mock();
  const { text } = await resolveModels();
  const body: any = { model: text, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_object" } };
  let out: any;
  try { out = await api("/chat/completions", body); }
  catch (e) {
    if (!/response_format/i.test((e as Error).message)) throw e;
    delete body.response_format; out = await api("/chat/completions", body);
  }
  return parseJson(out.choices?.[0]?.message?.content || "");
}

/** Generates one image; returns the file bytes and extension. */
export async function generateImage(prompt: string, size: string, quality: string): Promise<{ bytes: Uint8Array; ext: string }> {
  if (MOCK) return { bytes: new TextEncoder().encode(mockSvg(prompt, size)), ext: "svg" };
  const { image } = await resolveModels();
  const body: any = { model: image, prompt, size, quality, n: 1, output_format: "webp", output_compression: 82 };
  let out: any;
  try { out = await api("/images/generations", body); }
  catch (e) {
    const msg = (e as Error).message;
    if (!/output_(format|compression)|quality/i.test(msg)) throw e;
    delete body.output_format; delete body.output_compression; if (/quality/i.test(msg)) delete body.quality;
    out = await api("/images/generations", body);
  }
  const d = out.data?.[0];
  if (d?.b64_json) {
    const bytes = Uint8Array.from(atob(d.b64_json), (c) => c.charCodeAt(0));
    const ext = bytes[0] === 0x89 ? "png" : bytes[0] === 0xff ? "jpg" : "webp";
    return { bytes, ext };
  }
  if (d?.url) {
    const r = await fetch(d.url); const bytes = new Uint8Array(await r.arrayBuffer());
    return { bytes, ext: (r.headers.get("content-type") || "image/png").split("/")[1].replace("jpeg", "jpg") };
  }
  throw new Error("OpenAI images : aucune image dans la réponse");
}

function mockSvg(prompt: string, size: string): string {
  const [w, h] = size.split("x").map(Number);
  const hue = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const words = prompt.replace(/[<&>]/g, "").split(/\s+/).slice(0, 60);
  const lines: string[] = []; let cur = "";
  for (const w2 of words) { if ((cur + " " + w2).length > 34) { lines.push(cur); cur = w2; } else cur = (cur + " " + w2).trim(); }
  if (cur) lines.push(cur);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,72%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},40%,35%)"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.28}" r="${w * 0.18}" fill="hsl(${(hue + 180) % 360},50%,60%)" opacity=".8"/>
<rect x="${w * 0.12}" y="${h * 0.45}" width="${w * 0.3}" height="${h * 0.3}" fill="#0004"/>
<text x="40" y="70" font-family="monospace" font-size="26" fill="#000a">MOCK IMAGE</text>
${lines.slice(0, 12).map((l, i) => `<text x="40" y="${120 + i * 34}" font-family="monospace" font-size="24" fill="#000c">${l}</text>`).join("")}
</svg>`;
}
