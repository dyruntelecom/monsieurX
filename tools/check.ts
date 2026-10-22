// Checks content/ before a push: `bun tools/check.ts`. Lists every series, episode and language found,
// and every problem (missing file, bad JSON, unknown author…). Exits with an error code if something is wrong.
import { loadCatalog, episodeList } from "../src/content";
const c = loadCatalog();
for (const s of c.series.values()) {
  console.log(`\n${s.slug} (${s.type}, ${s.status})`);
  for (const [id, versions] of s.episodes) for (const e of versions.values()) {
    const zones = e.pages.reduce((n, p) => n + p.zones.length, 0);
    console.log(`  ${id}/${e.lang}  ${e.status === "published" ? "publié " : "brouillon"}  ${e.access === "free" ? "gratuit " : "abonnés "}  ${e.pages.length} planches, ${zones} cases  « ${e.title} »`);
  }
  if (!episodeList(s).length) console.log("  (aucun épisode publié)");
}
if (c.errors.length) { console.error(`\n${c.errors.length} problème(s) :\n- ` + c.errors.join("\n- ")); process.exit(1); }
console.log("\nContenu OK.");
