# Magiscom CRM

Fiches clients et prospects, notes écrites, **notes vocales transcrites** et **réunions enregistrées**
avec transcription (qui a dit quoi) et compte-rendu rédigés par l'IA (Cloudflare Workers AI :
Whisper large v3 turbo pour la parole, Llama 3.3 70B pour les répliques et le compte-rendu).
Français et arabe. Fonctionne hors ligne : les enregistrements partent dès que le réseau revient.

- Déploiement : Cloudflare Workers (`wrangler.toml`), base D1 `magiscom-crm`, fichiers R2 `magiscom-crm-files`, liaison IA `AI`.
- Démonstration : `https://<adresse>/demo` (base `magiscom-crm-demo`, comptes `direction` / `commercial`, mot de passe `demo2026`).
- Tests : `npm test` (API, démo, IA simulée) et `node test/ui-ai.mjs` (navigateur avec micro simulé).


Portefeuille clients des commerciaux : fiches clients et prospects, position GPS, visites et comptes-rendus,
photos, vidéos et documents, tableau de bord de la direction, export Excel. Fonctionne hors ligne.

- Serveur : Cloudflare Worker (`src/worker.js`) + D1 (`schema.sql`) + R2 (fichiers)
- Application : `public/` (PWA installable, FR / AR / EN)
- `node build.mjs` construit `dist/worker.js` (serveur + application en un fichier)
- Tests : `node test/api.test.mjs` (serveur) et `node test/ui.mjs` (interface, Playwright)
- Déploiement : Cloudflare › Workers & Pages › Import a repository › branche `magiscom-terrain`

## Version de démonstration

La démonstration s'ouvre sur **`/demo`** de la même adresse (ex. `https://magiscom-terrain.integrateurebp.com/demo`),
ou sur un domaine qui commence par `demo.` / `demo-`. Elle a sa propre session (cookie `tr_demo`) et sa propre base locale sur le téléphone ;
l'application utilise la base `magiscom-terrain-demo` et le stockage `magiscom-terrain-demo-files`,
remplis de données fictives (société « Démo Distribution SARL », 24 fiches, 5 commerciaux, visites et rendez-vous).

- Comptes : `direction` / `demo2026` (administrateur) et `commercial` / `demo2026` (Karim Benali), proposés en un clic sur l'écran de connexion.
- Remise à zéro automatique chaque nuit (tâche planifiée) : fiches, fichiers, comptes et droits reviennent à l'état d'origine.
- Dans la démo : fichiers limités à 20 Mo, mots de passe et statut des deux comptes de démonstration non modifiables.
