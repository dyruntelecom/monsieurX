# Storink

Plateforme de bandes dessinées à lire case par case : catalogue de séries, épisodes en plusieurs langues, liseuse mobile, statistiques d'audience anonymes. En ligne sur **storink.com**.

Serveur [Bun](https://bun.sh) sans framework ni étape de build. Chaque push sur `main` redéploie le service Railway « liseuse » (projet « Monsieur X »).

## Organisation

```
content/
  authors/<auteur>.json                 nom et bio d'un auteur
  series/<serie>/
    series.json                         fiche de la série
    cover.webp                          (facultatif) couverture de la série
    episodes/<episode>/<langue>/
      manifest.json                     l'épisode : textes, planches, découpage des cases
      pages/…  thumbs/…                 images
  pages/<page>.<langue>.md              pages fixes : about, legal, credits
i18n/fr.json, i18n/en.json              textes de l'interface
public/                                 liseuse (reader.js, reader.css) et style du site (site.css)
src/                                    serveur : catalogue, pages, liseuse, statistiques
server.ts                               routes
tools/check.ts                          vérification du contenu
```

Adresses : `/fr` (accueil), `/fr/monsieur-x` (série), `/fr/monsieur-x/1` (épisode 1 en français), `/en/about`, `/fr/a-propos`, `/fr/mentions-legales`, `/fr/credits`, `/stats`.
`/` envoie vers `/fr` ou `/en` selon la langue du navigateur. Un lien vers un épisode dans une langue qui n'existe pas renvoie vers la version disponible.

## Ajouter un épisode

Aucun code à toucher : on dépose un dossier et un manifeste.

1. Créer le dossier `content/series/<serie>/episodes/<numéro>/<langue>/` (par exemple `content/series/monsieur-x/episodes/2/fr/`).
2. Y mettre les planches dans `pages/` et, si possible, des miniatures dans `thumbs/` (webp, environ 1024 px de large pour les planches, 200 px pour les miniatures).
3. Écrire `manifest.json` en partant de celui de l'épisode 1 :

```json
{
  "number": 2,
  "title": "Titre de l'épisode",
  "eyebrow": "Épisode 2 · Lieu, année",
  "blurb": "Deux ou trois phrases d'accroche, affichées sous le titre.",
  "description": "Description pour les moteurs de recherche.",
  "shareDescription": "Texte affiché dans l'aperçu LinkedIn / WhatsApp.",
  "authors": ["loic-texier"],
  "published": "2026-11-15",
  "broadcastDate": "2010-03-12",
  "status": "draft",
  "access": "free",
  "cover": "pages/p00.webp",
  "ogImage": "og.jpg",
  "stamp": "ARCHIVES",
  "pages": [
    { "src": "pages/p00.webp", "thumb": "thumbs/t00.webp", "w": 1086, "h": 1448, "label": "Couverture", "kind": "cover", "zones": [] },
    { "src": "pages/p01.webp", "thumb": "thumbs/t01.webp", "w": 1024, "h": 1536, "label": "1", "kind": "comic",
      "zones": [[0, 0, 1, 1], [0.02, 0.03, 0.96, 0.3], [0.02, 0.35, 0.47, 0.3]] }
  ]
}
```

   - `pages` est l'ordre de lecture. `w` et `h` sont la taille de l'image en pixels.
   - `kind` : `cover` (couverture), `comic` (planche, affichée « Planche 1 »), `spread` (double page), `doc` (page bis ou remerciements, affichée avec son label tel quel), `credits`.
   - `zones` : les cases, dans l'ordre de lecture, en fractions de la page `[x, y, largeur, hauteur]` (0 = bord gauche ou haut, 1 = bord droit ou bas). Une zone `[0, 0, 1, 1]` montre la page entière. Liste vide = la page s'affiche en entier, même en mode case.
   - `status` : `draft` (invisible dans le catalogue, lisible à l'adresse de l'épisode suivie de `?preview=1`) ou `published`.
   - `access` : `free` ou `subscribers` (réservé aux abonnés : affiche pour l'instant une page « bientôt », les comptes ne sont pas encore construits).
   - `broadcastDate` est propre à Monsieur X (date de l'émission). Les champs `number`, `eyebrow`, `stamp`, `ogImage`, `broadcastDate` sont facultatifs.
4. Vérifier : `bun tools/check.ts` (liste les épisodes trouvés et signale fichier manquant, JSON invalide, auteur inconnu…).
5. Tester en local : `bun server.ts`, puis http://localhost:8080/fr/monsieur-x/2?preview=1.
6. Passer `status` à `published`, commit, push sur `main`.

**Une autre langue** pour un épisode existant : même chose dans `episodes/<numéro>/<langue>/` (par exemple `episodes/1/en/`), avec ses propres planches. Le sélecteur « Lire en » apparaît dès que deux versions sont publiées.

**Une nouvelle série** : créer `content/series/<serie>/series.json` (voir `monsieur-x/series.json`). Champs : `type` (`comic`, ou `news` pour une actualité en BD), `status`, `authors`, `aiAssisted`, `order` (ordre sur l'accueil), `cover`, et des textes par langue : `title`, `tagline`, `description`, `notice`. Pour une série `news`, nommer les dossiers d'épisodes par date (`episodes/2026-11-15/fr/`) et ajouter `"frequency": "daily"` ou `"weekly"` : les épisodes sont alors classés du plus récent au plus ancien et affichés par date.

**Un nouvel auteur** : `content/authors/<auteur>.json` avec `name` et `bio`, puis l'ajouter dans `authors` de la série ou de l'épisode.

**Une nouvelle langue d'interface** : copier `i18n/en.json` en `i18n/<langue>.json` et traduire ; ajouter les pages fixes `content/pages/<page>.<langue>.md`.

## Statistiques

Base SQLite `stats.db` sur le volume Railway monté sur `/data`. Aucune adresse IP, aucun cookie : l'identifiant de visiteur est une empreinte quotidienne non réversible, l'identifiant de session reste dans l'onglet du lecteur.

Chaque événement (`view`, `start`, `page`, `mode`) porte la série, l'épisode et la langue. Les événements antérieurs à Storink ont été rattachés à `monsieur-x / 1 / fr`.

- `/stats` : indicateurs, filtres série / épisode / langue, lecture planche par planche.
- `/stats/export` : téléchargement de la base complète.
- Sauvegardes automatiques dans `/data/backups/` : une avant la migration Storink (`stats-…-avant-storink.db`), puis une par jour (les 14 dernières).
- Ajouter `?utm_source=nom` à un lien pour suivre une diffusion.

## Variables Railway

| Variable | Rôle |
|---|---|
| `STATS_PASSWORD` | mot de passe de `/stats` |
| `STATS_SALT` | sel de l'empreinte visiteur (ne pas changer) |
| `DATA_DIR` | dossier de la base (`/data`) |
| `CANONICAL_HOST` | `storink.com` : redirige www et l'ancienne adresse `liseuse-production.up.railway.app` vers storink.com (vide = aucune redirection) |
| `SITE_URL` | adresse utilisée dans les liens de partage (défaut `https://storink.com`) |
| `ADS_ENABLED` | `1` pour afficher les emplacements publicitaires (vides pour l'instant) |

## Préparé, pas encore construit

- **Abonnements** : champ `access` dans les manifestes, page « réservé aux abonnés » ; pas de comptes ni de paiement.
- **Publicité** : emplacements `adSlot()` sur l'accueil et les pages série, désactivés.
- **Auteurs multiples** : `authors` est une liste partout ; un espace de publication pour d'autres auteurs reste à faire.
- **Actualité en BD** : type de série `news`, épisodes datés.
