# Monsieur X — liseuse

Liseuse case par case de la BD *Monsieur X*, épisode 1 (Popov), avec statistiques d'audience anonymes.

- `public/` : la liseuse (index.html, planches, miniatures)
- `server.ts` : serveur Bun (fichiers statiques + `/e` pour les événements + `/stats` protégé)
- Variables Railway : `STATS_PASSWORD` (accès à `/stats`), `STATS_SALT` (optionnel)
- Volume Railway monté sur `/data` pour conserver la base `stats.db`
