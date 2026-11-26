# Magiscom Terrain

Portefeuille clients des commerciaux : fiches clients et prospects, position GPS, visites et comptes-rendus,
photos, vidéos et documents, tableau de bord de la direction, export Excel. Fonctionne hors ligne.

- Serveur : Cloudflare Worker (`src/worker.js`) + D1 (`schema.sql`) + R2 (fichiers)
- Application : `public/` (PWA installable, FR / AR / EN)
- `node build.mjs` construit `dist/worker.js` (serveur + application en un fichier)
- Tests : `node test/api.test.mjs` (serveur) et `node test/ui.mjs` (interface, Playwright)
- Déploiement : Cloudflare › Workers & Pages › Import a repository › branche `magiscom-terrain`
