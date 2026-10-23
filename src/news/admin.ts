// Review page for Storink Daily (behind the stats password): fix a text, hide a story, redraw images.
import { readEdition, type NewsEdition, type Text } from "../content";
import { esc } from "../md";
import { loadConfig, loadStyles, status, listEditions, withEdition, runEdition, regenerateSlides, retranslate, deleteStory } from "./pipeline";
import { aiReady, MOCK } from "./ai";

const CSS = `:root{--bg:#0c0e12;--ink:#16191f;--line:#2a2f38;--fg:#efe4cf;--mut:#8d96a3;--acc:#5b7cff;--red:#d0453a;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;padding:20px max(16px,env(safe-area-inset-left)) 60px}
main{max-width:1100px;margin:0 auto;display:grid;gap:22px}a{color:var(--fg)}h1{font-size:1.5rem;margin:0}h2{font-size:1.1rem;margin:0}
.note{color:var(--mut);font-size:.88rem}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
button,select,input,textarea{font:inherit;color:var(--fg);background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 11px}
button{cursor:pointer}button.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}button.danger{border-color:var(--red);color:var(--red)}
textarea{width:100%;min-height:62px;resize:vertical}input[type=text]{width:100%}
.story{background:var(--ink);border:1px solid var(--line);border-radius:12px;padding:16px;display:grid;gap:14px}
.story.hidden{opacity:.55}.slides{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.slide{display:grid;gap:6px}.slide img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px;background:#000}
.lbl{font-size:.75rem;color:var(--mut)}.tag{font-size:.75rem;border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--mut)}
.log{background:var(--ink);border:1px solid var(--line);border-radius:8px;padding:10px;font:12px/1.5 ui-monospace,monospace;max-height:260px;overflow:auto;white-space:pre-wrap}
ul.days{list-style:none;padding:0;margin:0;display:grid;gap:6px}`;

const page = (title: string, body: string, refresh = false) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${refresh ? '<meta http-equiv="refresh" content="20">' : ""}<title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}</main></body></html>`;

function statusBlock(): string {
  return `<section><div class="row"><h2>Génération</h2>${status.running ? `<span class="tag">en cours · ${esc(status.day)} · ${esc(status.step)}</span>` : `<span class="tag">à l'arrêt</span>`}${status.lastError ? `<span class="tag" style="color:var(--red)">dernière erreur : ${esc(status.lastError)}</span>` : ""}</div>
${status.log.length ? `<div class="log">${esc(status.log.slice(-60).join("\n"))}</div>` : ""}</section>`;
}

export function adminHome(): string {
  const cfg = loadConfig();
  const days = listEditions();
  const today = new Date().toISOString().slice(0, 10);
  return page("Storink Daily · relecture", `<div><h1>Storink Daily · relecture</h1>
<p class="note">${aiReady() ? (MOCK ? "Mode test (NEWS_MOCK) : images factices." : `Génération automatique chaque jour à ${cfg.publishHourUTC} h UTC.`) : "OPENAI_API_KEY absente : génération en pause."} ${cfg.storiesPerDay} sujets, ${cfg.slidesPerStory} écrans chacun, styles « ${cfg.styleMode === "random" ? "aléatoires" : "assortis au sujet"} », plafond ${cfg.maxImagesPerDay} images par jour.</p></div>
${statusBlock()}
<form method="post" action="/admin/run" class="row"><input type="hidden" name="day" value="${today}"><button class="primary" ${status.running || !aiReady() ? "disabled" : ""}>Générer l'édition du jour maintenant</button><label class="row note"><input type="checkbox" name="force" value="1"> compléter même si l'édition existe</label></form>
<section><h2>Éditions</h2>${days.length ? `<ul class="days">${days.map((d) => { const ed = readEdition(cfg.series, d); return `<li><a href="/admin/${esc(cfg.series)}/${esc(d)}">${esc(d)}</a> <span class="note">${ed?.stories.length || 0} sujets · ${ed?.stories.filter((s) => s.status === "hidden").length || 0} masqués</span></li>`; }).join("")}</ul>` : `<p class="note">Aucune édition pour l'instant.</p>`}</section>
<p class="note"><a href="/stats?s=${esc(cfg.series)}">Statistiques de Storink Daily</a></p>`, status.running);
}

export function adminEdition(day: string, msg = ""): string | null {
  const cfg = loadConfig(); const styles = loadStyles();
  const ed = readEdition(cfg.series, day);
  if (!ed) return null;
  const L = ed.langs || cfg.langs;
  const field = (name: string, t: Text | undefined, area = true) => L.map((l) => `<label class="lbl">${l.toUpperCase()}</label>${area ? `<textarea name="${name}.${l}">${esc(t?.[l] || "")}</textarea>` : `<input type="text" name="${name}.${l}" value="${esc(t?.[l] || "")}">`}`).join("");
  const stories = ed.stories.map((st, n) => `<article class="story${st.status === "hidden" ? " hidden" : ""}" id="${esc(st.id)}">
<div class="row"><h2>${n + 1}. ${esc(st.headline[cfg.baseLang] || "")}</h2><span class="tag">${esc(st.style.name.fr || st.style.id)}</span>${st.status === "hidden" ? '<span class="tag" style="color:var(--red)">masqué</span>' : ""}${st.edited ? '<span class="tag">modifié</span>' : ""}
<a class="note" href="/${esc(cfg.baseLang)}/${esc(cfg.series)}/${esc(day)}#s${n + 1}-1" target="_blank">voir en ligne</a></div>
<p class="note">Sources : ${st.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(", ")}</p>
<form method="post" action="/admin/${esc(cfg.series)}/${esc(day)}/${esc(st.id)}/save" style="display:grid;gap:12px">
<div>${field("headline", st.headline, false)}</div>
<div class="slides">${st.slides.map((sl, k) => `<div class="slide">${sl.image ? `<img src="/gen/${esc(cfg.series)}/episodes/${esc(day)}/${esc(sl.image)}" alt="" loading="lazy">` : ""}
<span class="lbl">Écran ${k + 1}${sl.kind === "speech" ? " · citation" : ""}</span>${field(`slide${k}`, sl.text)}
<details><summary class="lbl">Description du dessin</summary><textarea name="scene${k}">${esc(sl.scene || "")}</textarea></details></div>`).join("")}</div>
<div class="row"><button class="primary">Enregistrer les textes</button></div></form>
<div class="row">
<form method="post" action="/admin/${esc(cfg.series)}/${esc(day)}/${esc(st.id)}/toggle"><button>${st.status === "hidden" ? "Republier" : "Masquer"}</button></form>
<form method="post" action="/admin/${esc(cfg.series)}/${esc(day)}/${esc(st.id)}/retranslate"><button ${status.running ? "disabled" : ""}>Retraduire depuis l'${cfg.baseLang === "en" ? "anglais" : cfg.baseLang}</button></form>
<form method="post" action="/admin/${esc(cfg.series)}/${esc(day)}/${esc(st.id)}/regen" class="row"><select name="slides"><option value="all">Redessiner tous les écrans</option>${st.slides.map((_, k) => `<option value="${k}">Redessiner l'écran ${k + 1}</option>`).join("")}</select>
<select name="style">${styles.map((s) => `<option value="${esc(s.id)}"${s.id === st.style.id ? " selected" : ""}>${esc(s.name.fr)}</option>`).join("")}</select><button ${status.running ? "disabled" : ""}>Lancer</button></form>
<form method="post" action="/admin/${esc(cfg.series)}/${esc(day)}/${esc(st.id)}/delete" onsubmit="return confirm('Supprimer définitivement ce sujet ?')"><button class="danger">Supprimer</button></form>
</div></article>`).join("");
  return page(`Relecture ${day}`, `<p class="note"><a href="/admin">← Toutes les éditions</a></p>
<div><h1>Storink Daily · ${esc(day)}</h1><p class="note">${ed.stories.length} sujets. Tout est publié dès la génération ; les changements enregistrés ici sont en ligne immédiatement. Les dessins décrits ici sont régénérés avec la nouvelle description si vous la modifiez avant de redessiner.</p></div>
${msg ? `<p class="tag" style="color:var(--acc)">${esc(msg)}</p>` : ""}
${statusBlock()}${stories}`, status.running);
}

/** Handles POST /admin/... ; returns where to redirect. */
export async function adminPost(path: string, form: FormData): Promise<string> {
  const cfg = loadConfig();
  if (path === "/admin/run") {
    const day = String(form.get("day") || new Date().toISOString().slice(0, 10));
    runEdition(day, { force: form.get("force") === "1" }).catch((e) => console.error(e));
    return "/admin";
  }
  const m = /^\/admin\/([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2})\/([a-z0-9]+)\/(save|toggle|delete|regen|retranslate)$/.exec(path);
  if (!m || m[1] !== cfg.series) return "/admin";
  const [, series, day, id, action] = m;
  const back = `/admin/${series}/${day}`;
  const str = (k: string) => (form.get(k) == null ? undefined : String(form.get(k)).trim());
  if (action === "save") {
    await withEdition(series, day, (ed: NewsEdition | null) => {
      const st = ed?.stories.find((s) => s.id === id); if (!ed || !st) return null;
      for (const l of ed.langs) {
        const h = str(`headline.${l}`); if (h) st.headline[l] = h;
        st.slides.forEach((sl, k) => { const v = str(`slide${k}.${l}`); if (v) sl.text[l] = v; });
      }
      st.slides.forEach((sl, k) => { const sc = str(`scene${k}`); if (sc) sl.scene = sc; });
      st.edited = true;
      return ed;
    });
    return `${back}?ok=1#${id}`;
  }
  if (action === "toggle") {
    await withEdition(series, day, (ed) => { const st = ed?.stories.find((s) => s.id === id); if (!ed || !st) return null; st.status = st.status === "hidden" ? "published" : "hidden"; return ed; });
    return `${back}#${id}`;
  }
  if (action === "delete") { await deleteStory(day, id); return back; }
  if (action === "retranslate") {
    status.running = true; status.step = "retraduction";
    retranslate(day, id).catch((e) => (status.lastError = (e as Error).message)).finally(() => { status.running = false; status.step = ""; });
    return `${back}#${id}`;
  }
  if (action === "regen") {
    const which = str("slides"); const style = str("style");
    status.running = true; status.day = day; status.step = `nouveaux dessins (${id})`;
    regenerateSlides(day, id, which === "all" || which == null ? null : [Number(which)], style)
      .catch((e) => (status.lastError = (e as Error).message))
      .finally(() => { status.running = false; status.step = ""; });
    return `${back}#${id}`;
  }
  return back;
}
