// Storink Daily: every morning, RSS → selection → script → images → published edition, then a notification.
// Editions live on the data volume: GEN_DIR/<series>/episodes/<YYYY-MM-DD>/manifest.json + <story>/<n>.<ext>.
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync, readdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { CONTENT, GEN_DIR, readEdition, type NewsEdition, type NewsStory, type NewsSlide, type Text } from "../content";
import { fetchFeeds, fetchArticleText, type FeedItem } from "./rss";
import { chatJson, generateImage, aiReady, MOCK } from "./ai";

export interface NewsConfig {
  series: string; baseLang: string; langs: string[]; storiesPerDay: number; slidesPerStory: number;
  timezone: string; publishHour: number; maxImagesPerDay: number; styleMode: "match" | "random"; imageSize: string; imageQuality: string;
  feeds: { name: string; url: string }[]; exclude: string[];
}
export interface Style { id: string; name: Text; fits: string; prompt: string }

export const loadConfig = (): NewsConfig => JSON.parse(readFileSync(join(CONTENT, "news", "config.json"), "utf8"));
export const loadStyles = (): Style[] => JSON.parse(readFileSync(join(CONTENT, "news", "styles.json"), "utf8"));

// Edition date and publication hour follow the readers' timezone (config "timezone"), not UTC.
function localNow(tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const today = () => { let tz = "Europe/Paris"; try { tz = loadConfig().timezone || tz; } catch {} return localNow(tz).day; };
const dayDir = (series: string, day: string) => join(GEN_DIR, series, "episodes", day);
const SITE = () => (Bun.env.SITE_URL || "https://storink.com").replace(/\/$/, "");

// ——— status shown on the admin page ———
export const status = { running: false, day: "", step: "", log: [] as string[], lastError: "" };
function log(msg: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  status.log.push(line); if (status.log.length > 200) status.log.shift();
  console.log("News :", msg);
}

// ——— edition storage (one writer at a time) ———
let chain: Promise<unknown> = Promise.resolve();
let onChange: () => void = () => {};
export function setOnChange(fn: () => void) { onChange = fn; }

export function withEdition<T>(series: string, day: string, fn: (ed: NewsEdition | null) => NewsEdition | null | Promise<NewsEdition | null>, ret?: (ed: NewsEdition | null) => T): Promise<T | undefined> {
  const run = chain.then(async () => {
    const ed = await fn(readEdition(series, day));
    if (ed) {
      const dir = dayDir(series, day); mkdirSync(dir, { recursive: true });
      const tmp = join(dir, ".manifest.tmp");
      writeFileSync(tmp, JSON.stringify(ed, null, 2));
      renameSync(tmp, join(dir, "manifest.json"));
      onChange();
    }
    return ret ? ret(ed) : undefined;
  });
  chain = run.catch(() => {});
  return run;
}

// ——— notification (ntfy.sh or any URL accepting a plain-text POST) ———
export async function notify(title: string, message: string, click?: string) {
  const url = Bun.env.NOTIFY_URL;
  if (!url) { log(`(pas de NOTIFY_URL) ${title} — ${message}`); return; }
  try {
    await fetch(url, { method: "POST", body: message, headers: { Title: title.replace(/[^\x20-\x7e]/g, ""), ...(click ? { Click: click } : {}), Tags: "newspaper" }, signal: AbortSignal.timeout(15000) });
  } catch (e) { console.warn("Notification impossible :", (e as Error).message); }
}

// ——— prompts ———
const RULES_PEOPLE = `Real people: in scene descriptions never write a real person's name. Describe them by their role (e.g. "the US president", "the French prime minister", "the CEO of the carmaker") plus a rough, recognisable general appearance taken from well-known public images: hair colour and style, approximate age, build, typical clothing or accessory. Keep it a plain likeness at the level of a press illustration: no exaggerated or mocking features, no character judgements (no "arrogant", "megalomaniac", "weak"...), and the same treatment for everyone whatever their side. Private individuals are never identifiable: draw them as generic people.`;

const RULES_FACTS = `Facts: use only facts present in the source texts provided. Attribute claims ("according to the UN", "the government says"). If sources disagree or a fact is unconfirmed, say so plainly. No opinion, no prediction presented as fact, no invented quotes. Quotes in speech bubbles must be real quotes from the sources, otherwise use a caption.`;

const RULES_IMAGE = `Scenes: one clear moment per slide, described for an illustrator in English, 40 to 80 words: setting, characters (by role and look), action, framing (close-up, wide shot...), lighting. Never ask for written words, signs with text, readable newspapers, logos, flags with text, or speech bubbles in the drawing. No gore, no dead or injured bodies, no weapons pointed at people, no identifiable children.`;

function selectionPrompt(cfg: NewsConfig, items: FeedItem[], yesterday: string[]): [string, string] {
  const sys = `You are the editor of Storink Daily, a daily news digest told as short comics. Pick the ${cfg.storiesPerDay} most important and varied stories of the day from the wire items given. Spread them across regions and topics (world politics, economy, science, technology, environment, culture, sport). Group items from different outlets that cover the same story. Avoid stories already covered yesterday unless there is a major new development. Never pick: ${cfg.exclude.join("; ")}. Reply with JSON: {"stories":[{"items":["i3","i17"],"category":"...","why":"one short sentence"}]} ordered from most to least important.`;
  const list = items.slice(0, 220).map((i) => `${i.id} | ${i.source} | ${i.title} — ${i.summary.slice(0, 220)}`).join("\n");
  return [sys, `Yesterday's headlines:\n${yesterday.join("\n") || "(none)"}\n\nToday's wire items:\n${list}`];
}

function scriptPrompt(cfg: NewsConfig, styles: Style[], used: string[], forcedStyle: Style | null, sources: { source: string; title: string; link: string; text: string }[]): [string, string] {
  const langs = cfg.langs;
  const L = (k: string) => `{${langs.map((l) => `"${l}":"${k} in ${l}"`).join(",")}}`;
  const styleRule = forcedStyle
    ? `The graphic style is imposed: "${forcedStyle.id}". Use "style":"${forcedStyle.id}".`
    : `Choose the graphic style whose "fits" best matches the tone of the story, preferring styles not used yet today (already used: ${used.join(", ") || "none"}). Styles:\n${styles.map((s) => `- ${s.id}: ${s.fits}`).join("\n")}`;
  const sys = `You write one story of Storink Daily: a news item retold in exactly ${cfg.slidesPerStory} portrait comic screens, each with ONE short text bubble. Base language is ${cfg.baseLang}; give every text in all of: ${langs.join(", ")} (natural, idiomatic translations, not word for word).
Slide 1 sets the scene (where, who, what happened). The middle slides give the key facts and context. The last slide says what happens next or why it matters.
Each bubble text: 90 to 170 characters, plain and clear, readable by someone who knows nothing of the story.
${RULES_FACTS}
${RULES_PEOPLE}
${RULES_IMAGE}
Recurring characters: list them once in "cast" with a fixed look so every scene draws them the same way.
${styleRule}
Reply with JSON:
{"headline":${L("max 70 characters")},"summary":${L("one sentence")},"category":"...","hashtags":["2 or 3 short topical hashtags without #, CamelCase, understood in every language: places, people, topics (e.g. Hormuz, Iran)"],"style":"style-id","cast":[{"role":"...","look":"..."}],
"slides":[{"scene":"...","kind":"caption or speech","speaker":${L("who speaks, only for speech")} or null,"text":${L("bubble text")}}]}`;
  const user = sources.map((s, n) => `SOURCE ${n + 1} — ${s.source}: ${s.title}\n${s.link}\n${s.text || "(article text unavailable; rely on the title and summary only, and stay cautious)"}`).join("\n\n");
  return [sys, user];
}

function imagePrompt(style: Style, cast: { role: string; look: string }[], scene: string, first = false): string {
  const castLine = cast.length ? `Recurring characters (keep identical): ${cast.map((c) => `${c.role}: ${c.look}`).join("; ")}. ` : "";
  return `${style.prompt}. A single vertical comic panel in portrait format, full bleed, no border. Keep the lower fifth of the image calm and uncluttered, a caption will be laid over it.${first ? " Also keep the upper third open and simple (sky, wall, water or plain background): the story title will be laid over it." : ""} ${castLine}Scene: ${scene} Absolutely no text, letters, numbers, captions, speech bubbles, logos or watermarks anywhere in the image.`;
}

// ——— mock answers (NEWS_MOCK=1) ———
const mockSelection = (cfg: NewsConfig, items: FeedItem[]) => ({ stories: items.slice(0, cfg.storiesPerDay).map((i) => ({ items: [i.id], category: "world", why: "mock" })) });
function mockScript(cfg: NewsConfig, styles: Style[], title: string, forced: Style | null) {
  const both = (en: string, fr: string) => Object.fromEntries(cfg.langs.map((l) => [l, l === "fr" ? fr : en]));
  return {
    headline: both(title.slice(0, 70), "FR · " + title.slice(0, 64)), summary: both("A mock summary.", "Un résumé factice."), category: "world",
    style: forced?.id || styles[Math.floor(Math.random() * styles.length)].id, cast: [{ role: "the minister", look: "grey-haired woman in a navy suit" }],
    slides: Array.from({ length: cfg.slidesPerStory }, (_, k) => ({
      scene: `Mock scene ${k + 1} for: ${title}`, kind: k === 1 ? "speech" : "caption", speaker: k === 1 ? both("The minister", "La ministre") : null,
      text: both(`Slide ${k + 1}. ${title}. This is placeholder text standing in for a real bubble of about one hundred and twenty characters.`, `Écran ${k + 1}. Texte provisoire en français, à la place d'une vraie bulle d'environ cent vingt caractères, avec des accents : é à ç.`),
    })),
  };
}
const MOCK_ITEMS: FeedItem[] = [
  "Leaders meet in Geneva for climate finance talks", "Central bank holds interest rates steady", "New telescope images reveal distant galaxy cluster",
  "Floods force evacuations along major river", "Tech firms agree on AI safety testing rules", "Marathon world record broken in Berlin",
  "Grain exports resume through Black Sea corridor", "Museum returns looted artefacts to Nigeria", "Electric car sales overtake petrol in Norway", "Volcano erupts in Iceland, flights unaffected",
].map((t, n) => ({ id: "i" + n, source: "Mock Wire", title: t, summary: t + ".", link: "https://example.com/" + n, date: Date.now() }));

// ——— building blocks ———
function pickStyle(styles: Style[], id: string | undefined, used: string[]): Style {
  return styles.find((s) => s.id === id) || styles.find((s) => !used.includes(s.id)) || styles[0];
}

function countImages(ed: NewsEdition | null): number { return (ed as any)?.imagesGenerated || 0; }

async function drawSlides(cfg: NewsConfig, series: string, day: string, story: NewsStory, style: Style, cast: { role: string; look: string }[], only?: number[]) {
  const [w, h] = cfg.imageSize.split("x").map(Number);
  const dir = join(dayDir(series, day), story.id); mkdirSync(dir, { recursive: true });
  const todo = story.slides.map((_, k) => k).filter((k) => !only || only.includes(k));
  let made = 0;
  const work = async (k: number) => {
    const sl = story.slides[k];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { bytes, ext } = await generateImage(imagePrompt(style, cast, sl.scene || "", k === 0), cfg.imageSize, cfg.imageQuality);
        const name = `${k + 1}-${Date.now().toString(36)}.${ext}`;
        writeFileSync(join(dir, name), bytes);
        const old = sl.image;
        sl.image = `${story.id}/${name}`; sl.w = w; sl.h = h; made++;
        if (old && old !== sl.image) { try { rmSync(join(dayDir(series, day), old)); } catch {} }
        return;
      } catch (e) {
        log(`image ${story.id}/${k + 1} échec (essai ${attempt}) : ${(e as Error).message}`);
        if (attempt === 2) throw e;
      }
    }
  };
  for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(work));
  return made;
}

async function writeStory(cfg: NewsConfig, styles: Style[], used: string[], forced: Style | null, srcItems: FeedItem[]) {
  const sources = await Promise.all(srcItems.slice(0, 3).map(async (i) => ({ source: i.source, title: i.title, link: i.link, text: MOCK ? i.summary : (await fetchArticleText(i.link)) || i.summary })));
  const [sys, user] = scriptPrompt(cfg, styles, used, forced, sources);
  const sc: any = await chatJson(sys, user, () => mockScript(cfg, styles, srcItems[0].title, forced));
  if (!Array.isArray(sc.slides) || !sc.slides.length || !sc.headline) throw new Error("scénario incomplet");
  return { sc, sources };
}

// ——— the daily run ———
export async function runEdition(day = today(), opts: { force?: boolean } = {}): Promise<void> {
  if (status.running) { log("une édition est déjà en cours"); return; }
  if (!aiReady()) { log("OPENAI_API_KEY absente : génération désactivée"); return; }
  const cfg = loadConfig(); const styles = loadStyles();
  status.running = true; status.day = day; status.lastError = ""; status.log = [];
  const startedAt = Date.now();
  try {
    let ed = readEdition(cfg.series, day);
    if (ed && !opts.force && ed.stories.length >= cfg.storiesPerDay) { log(`édition ${day} déjà complète`); return; }
    if (ed && !opts.force && (ed as any).importVersion) { log(`édition ${day} faite à la main : génération automatique ignorée`); return; }

    status.step = "lecture des flux";
    const { items, errors } = MOCK ? { items: MOCK_ITEMS, errors: [] } : await fetchFeeds(cfg.feeds);
    errors.forEach((e) => log(`flux indisponible — ${e}`));
    log(`${items.length} articles récupérés`);
    if (!items.length) throw new Error("aucun article dans les flux");

    const prevDay = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
    const prev = readEdition(cfg.series, prevDay);
    const yesterday = (prev?.stories || []).map((s) => s.headline?.en || Object.values(s.headline || {})[0] || "");

    status.step = "sélection des sujets";
    const [ssys, suser] = selectionPrompt(cfg, items, yesterday);
    const sel: any = await chatJson(ssys, suser, () => mockSelection(cfg, items));
    const picks: { items: FeedItem[]; category: string }[] = (sel.stories || [])
      .map((s: any) => ({ items: (s.items || []).map((id: string) => items.find((i) => i.id === id)).filter(Boolean), category: s.category || "" }))
      .filter((s: any) => s.items.length)
      .slice(0, cfg.storiesPerDay);
    log(`${picks.length} sujets retenus`);

    // Fresh edition (or keep the existing one and add the missing stories).
    await withEdition(cfg.series, day, (cur) => cur || {
      series: cfg.series, episode: day, langs: cfg.langs, baseLang: cfg.baseLang,
      title: Object.fromEntries(cfg.langs.map((l) => [l, day])), published: day, status: "published", generatedAt: new Date().toISOString(), stories: [],
    } as NewsEdition);

    const shuffled = [...styles].sort(() => Math.random() - 0.5);
    let n = 0;
    for (const pick of picks) {
      ed = readEdition(cfg.series, day)!;
      if (ed.stories.length >= cfg.storiesPerDay) break;
      if (ed.stories.some((s) => s.sources.some((src) => pick.items.some((i) => i.link === src.url)))) continue;
      if (countImages(ed) + cfg.slidesPerStory > cfg.maxImagesPerDay) { log("plafond d'images atteint, arrêt"); break; }
      n++;
      status.step = `sujet ${n}/${picks.length} : ${pick.items[0].title.slice(0, 60)}`;
      try {
        const used = ed.stories.map((s) => s.style.id);
        const forced = cfg.styleMode === "random" ? shuffled.find((s) => !used.includes(s.id)) || shuffled[n % shuffled.length] : null;
        const { sc, sources } = await writeStory(cfg, styles, used, forced, pick.items);
        const style = pickStyle(styles, sc.style, used);
        const id = "s" + Date.now().toString(36);
        const story: NewsStory = {
          id, status: "published", category: sc.category || pick.category,
          style: { id: style.id, name: style.name }, headline: sc.headline, summary: sc.summary,
          hashtags: Array.isArray(sc.hashtags) ? sc.hashtags.slice(0, 3).map(String) : undefined,
          sources: sources.map((s) => ({ name: s.source, url: s.link })),
          slides: sc.slides.slice(0, cfg.slidesPerStory).map((s: any): NewsSlide => ({ image: "", w: 0, h: 0, text: s.text, kind: s.kind === "speech" ? "speech" : "caption", speaker: s.speaker || undefined, scene: s.scene })),
        };
        (story as any).cast = Array.isArray(sc.cast) ? sc.cast : [];
        const made = await drawSlides(cfg, cfg.series, day, story, style, (story as any).cast);
        await withEdition(cfg.series, day, (cur) => {
          if (!cur) return null;
          cur.stories.push(story);
          (cur as any).imagesGenerated = countImages(cur) + made;
          return cur;
        });
        log(`publié : ${story.headline[cfg.baseLang] || ""} (${style.id})`);
      } catch (e) {
        log(`sujet abandonné : ${(e as Error).message}`);
      }
    }

    const final = readEdition(cfg.series, day);
    const count = final?.stories.length || 0;
    const mins = Math.round((Date.now() - startedAt) / 60000);
    log(`édition ${day} : ${count} sujets en ${mins} min`);
    await notify(`Storink Daily ${day}: ${count} stories`,
      `${count} stories published.\n\n${(final?.stories || []).map((s, i) => `${i + 1}. ${s.headline[cfg.baseLang] || Object.values(s.headline)[0]}`).join("\n")}\n\nReview: ${SITE()}/admin/${cfg.series}/${day}`,
      `${SITE()}/admin/${cfg.series}/${day}`);
  } catch (e) {
    status.lastError = (e as Error).message;
    log(`échec : ${status.lastError}`);
    await notify(`Storink Daily ${day}: failed`, status.lastError, `${SITE()}/admin`);
  } finally {
    status.running = false; status.step = "";
  }
}

// ——— review actions (admin) ———
export async function regenerateSlides(day: string, storyId: string, slides: number[] | null, styleId?: string) {
  const cfg = loadConfig(); const styles = loadStyles();
  const ed = readEdition(cfg.series, day);
  const story = ed?.stories.find((s) => s.id === storyId);
  if (!ed || !story) throw new Error("sujet introuvable");
  const only = slides ?? story.slides.map((_, k) => k);
  if (countImages(ed) + only.length > Math.round(cfg.maxImagesPerDay * 1.5)) throw new Error("plafond d'images du jour atteint");
  const style = styles.find((s) => s.id === (styleId || story.style.id)) || styles[0];
  const copy: NewsStory = JSON.parse(JSON.stringify(story));
  const made = await drawSlides(cfg, cfg.series, day, copy, style, (copy as any).cast || [], only);
  await withEdition(cfg.series, day, (cur) => {
    const st = cur?.stories.find((s) => s.id === storyId); if (!cur || !st) return null;
    only.forEach((k) => { st.slides[k].image = copy.slides[k].image; st.slides[k].w = copy.slides[k].w; st.slides[k].h = copy.slides[k].h; });
    st.style = { id: style.id, name: style.name }; st.edited = true;
    (cur as any).imagesGenerated = countImages(cur) + made;
    return cur;
  });
}

export async function retranslate(day: string, storyId: string) {
  const cfg = loadConfig();
  const ed = readEdition(cfg.series, day);
  const st = ed?.stories.find((s) => s.id === storyId);
  if (!st) throw new Error("sujet introuvable");
  const base = cfg.baseLang; const others = cfg.langs.filter((l) => l !== base);
  const payload = { headline: st.headline[base], summary: st.summary?.[base], slides: st.slides.map((s) => ({ text: s.text[base], speaker: s.speaker?.[base] || null })) };
  const out: any = await chatJson(
    `Translate this comic news story from ${base} into ${others.join(", ")}. Natural, idiomatic, same length. Reply JSON {"<lang>":{"headline":"","summary":"","slides":[{"text":"","speaker":null}]}}`,
    JSON.stringify(payload),
    () => Object.fromEntries(others.map((l) => [l, { headline: "[" + l + "] " + payload.headline, summary: payload.summary, slides: payload.slides }])),
  );
  await withEdition(cfg.series, day, (cur) => {
    const s = cur?.stories.find((x) => x.id === storyId); if (!cur || !s) return null;
    for (const l of others) {
      const t = out[l]; if (!t) continue;
      s.headline[l] = t.headline || s.headline[l];
      if (s.summary && t.summary) s.summary[l] = t.summary;
      (t.slides || []).forEach((x: any, k: number) => { if (s.slides[k] && x?.text) { s.slides[k].text[l] = x.text; if (x.speaker && s.slides[k].speaker) s.slides[k].speaker![l] = x.speaker; } });
    }
    s.edited = true;
    return cur;
  });
}

export function deleteStory(day: string, storyId: string) {
  const cfg = loadConfig();
  return withEdition(cfg.series, day, (cur) => {
    if (!cur) return null;
    cur.stories = cur.stories.filter((s) => s.id !== storyId);
    try { rmSync(join(dayDir(cfg.series, day), storyId), { recursive: true, force: true }); } catch {}
    return cur;
  });
}

export function listEditions(): string[] {
  const cfg = loadConfig();
  const d = join(GEN_DIR, cfg.series, "episodes");
  return existsSync(d) ? readdirSync(d).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse() : [];
}

// ——— editions prepared by hand (images drawn elsewhere) and committed to git ———
// content/news/import/<day>/manifest.json + images: copied to the volume at start-up when new or when "importVersion" grows.
export function importFromRepo() {
  const cfg = loadConfig();
  const root = join(CONTENT, "news", "import");
  if (!existsSync(root)) return;
  for (const day of readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    try {
      const src = JSON.parse(readFileSync(join(root, day, "manifest.json"), "utf8"));
      const cur = readEdition(cfg.series, day) as any;
      if (cur && (cur.importVersion || 0) >= (src.importVersion || 1)) continue;
      const dest = dayDir(cfg.series, day);
      mkdirSync(dest, { recursive: true });
      cpSync(join(root, day), dest, { recursive: true, force: true });
      console.log(`News : édition ${day} importée depuis le dépôt (version ${src.importVersion || 1})`);
      onChange();
    } catch (e) { console.warn(`News : import ${day} impossible :`, (e as Error).message); }
  }
}

// ——— scheduler: checks every 10 minutes whether today's edition is due ———
export function startScheduler() {
  importFromRepo();
  const cfg = loadConfig();
  if (!aiReady()) { console.log("News : OPENAI_API_KEY absente, Storink Daily en pause"); return; }
  const attempts = new Map<string, number>();
  const tick = () => {
    const { day, hour } = localNow(cfg.timezone || "Europe/Paris");
    if (status.running || hour < cfg.publishHour) return;
    const ed = readEdition(cfg.series, day);
    if ((ed as any)?.importVersion) return; // edition made by hand: leave it alone
    if (ed && ed.stories.length >= Math.min(cfg.storiesPerDay, 6)) return;
    const n = attempts.get(day) || 0; if (n >= 2) return;
    attempts.set(day, n + 1);
    runEdition(day).catch((e) => console.error(e));
  };
  setTimeout(tick, 30000);
  // NEWS_RUN_ON_BOOT=1: generate today's edition right after (re)start, whatever the hour (no-op if already complete).
  if (Bun.env.NEWS_RUN_ON_BOOT === "1") setTimeout(() => { if (!status.running) runEdition(today()).catch((e) => console.error(e)); }, 15000);
  setInterval(tick, 10 * 60000);
  console.log(`News : Storink Daily programmé chaque jour à ${cfg.publishHour} h (${cfg.timezone})`);
}
