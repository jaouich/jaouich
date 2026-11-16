# Magiscom Tech Desk — Support clients

Espace support où chaque client a son compte, envoie ses demandes avec photos et vidéos,
et suit la réponse. L'administrateur voit tous les clients, répond et change le statut.

## Architecture

| Élément | Rôle |
|---|---|
| **Cloudflare Worker** (`dist/worker.js`) | Un seul fichier : sert la page ET l'API. |
| **D1** (base SQLite) | Comptes, sessions, demandes, messages, historique des statuts. |
| **R2** (stockage de fichiers) | Photos et vidéos, privées, jamais publiques. |
| **Cron nocturne** | Supprime les fichiers envoyés mais jamais joints à un message. |

Pourquoi ce choix : tout est chez Cloudflare (pas de serveur à gérer), R2 ne facture pas
la bande passante sortante (idéal pour les vidéos), et le plan gratuit suffit pour démarrer.

## Base de données (`schema.sql`)

```
users ──< sessions
  │
  └──< tickets ──< messages ──< attachments
           │                        (owner_id → users)
           └──< status_history
login_attempts   (anti-force brute)
```

- `users` : e-mail unique, mot de passe haché (PBKDF2-SHA256, 100 000 itérations, sel aléatoire), rôle `user` ou `admin`.
- `sessions` : seul le **hachage** du jeton est stocké ; cookie `HttpOnly; Secure; SameSite=Lax`, 30 jours.
- `tickets` : statut `open` / `in_review` / `resolved` / `unresolved`, `last_sender` pour savoir qui attend une réponse.
- `attachments` : clé R2 `u/<id client>/<uuid>.<ext>`, type, taille. `message_id` vide tant que le fichier n'est pas joint.
- `status_history` : chaque changement de statut, avec qui et quand.

## Règles d'accès (appliquées par le serveur, pas par la page)

- Un client ne voit **que** ses demandes, ses messages et ses fichiers. Pour tout le reste, il reçoit « introuvable » (on ne révèle même pas l'existence).
- Un fichier n'est lisible que par : la personne qui l'a envoyé, le client propriétaire de la demande, ou l'admin.
- Un client ne peut pas joindre un fichier envoyé par quelqu'un d'autre.
- Seul l'admin change un statut, voit la liste des clients et les statistiques.
- « Mon profil » : chacun change son nom, son entreprise, son téléphone, son e-mail (mot de passe exigé) et son mot de passe (les autres appareils sont déconnectés).
- Mot de passe oublié : l'admin attribue un mot de passe provisoire depuis la page Clients (le client est déconnecté partout).
- Si un client répond à une demande résolue ou non résolue, elle redevient « ouverte ».
- Protections : en-tête anti-CSRF obligatoire, blocage 15 min après 10 mots de passe faux, CSP stricte, fichiers servis en `nosniff` + `sandbox`, types acceptés limités (JPG, PNG, WEBP, GIF, HEIC, MP4, MOV, WEBM, 3GP).
- Limites : 6 fichiers par message, photos 15 Mo, vidéos 95 Mo (limite des requêtes Cloudflare : 100 Mo).

## Mise en ligne depuis le tableau de bord Cloudflare (sans ordinateur)

1. **R2** → *Create bucket* → nom : `magisdesk-media`.
2. **D1** → *Create database* → nom : `magisdesk` → onglet *Console* → collez tout `schema.sql` → *Execute*.
3. **Workers & Pages** → *Create* → *Create Worker* → nom : `magiscom-tech-desk` → *Deploy*.
4. *Edit code* → remplacez tout par le contenu de `dist/worker.js` → *Deploy*.
5. *Settings* → *Bindings* :
   - *D1 database* : nom de variable `DB` → base `magisdesk`
   - *R2 bucket* : nom de variable `MEDIA` → bucket `magisdesk-media`
6. *Settings* → *Triggers* → *Cron* : `30 3 * * *` (nettoyage chaque nuit).
7. Ouvrez l'adresse `…workers.dev`, créez **votre** compte, puis dans la console D1 :
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'votre@email.ma';
   ```
   Déconnectez-vous et reconnectez-vous : vous voyez le tableau de bord admin.
8. (Optionnel) *Settings* → *Domains & Routes* → *Custom domain* : par exemple `support.integrateurebp.com`
   (le domaine doit être géré par Cloudflare).

## Avec un ordinateur (Wrangler)

```bash
npm i -g wrangler && wrangler login
wrangler r2 bucket create magisdesk-media
wrangler d1 create magisdesk          # copiez l'id dans wrangler.toml
wrangler d1 execute magisdesk --remote --file=schema.sql
npm run deploy
```

## Développement et tests

- `npm test` : 25 vérifications de l'API (isolation entre clients, fichiers, admin, sessions…), avec SQLite et un faux R2 en mémoire.
- `npm run dev` : version locale sur http://localhost:8787.
- Le code de la page est dans `public/`, le serveur dans `src/worker.js`. `node build.mjs` les rassemble dans `dist/worker.js`.

## Étapes suivantes possibles

- Notification e-mail ou WhatsApp à l'admin à chaque nouvelle demande.
- Mot de passe oublié (nécessite un service d'envoi d'e-mails).
- Vidéos de plus de 95 Mo : envoi en plusieurs morceaux (R2 multipart).
- Interface en arabe en plus du français.
