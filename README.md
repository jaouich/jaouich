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

## E-mails de notification

- Nouvelle demande ou nouveau message d'un client → e-mail à tous les admins.
- Réponse d'un admin ou changement de statut → e-mail au client concerné.
- Envoi par **Cloudflare Email Service** (binding `EMAIL`, plan Workers Paid, domaine intégré dans Email Service) ou par **Resend** (secret `RESEND_API_KEY`). Sans l'un des deux, l'application marche sans e-mail.
- Expéditeur : `MAIL_FROM` (par défaut `support@integrateurebp.com`), liens vers `APP_URL`.

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

- `npm test` : 27 vérifications de l'API (isolation entre clients, fichiers, admin, sessions…), avec SQLite et un faux R2 en mémoire.
- `npm run dev` : version locale sur http://localhost:8787.
- Le code de la page est dans `public/`, le serveur dans `src/worker.js`. `node build.mjs` les rassemble dans `dist/worker.js`.

## Étapes suivantes possibles

- Notification e-mail ou WhatsApp à l'admin à chaque nouvelle demande.
- Mot de passe oublié (nécessite un service d'envoi d'e-mails).
- Vidéos de plus de 95 Mo : envoi en plusieurs morceaux (R2 multipart).
- Interface en arabe en plus du français.

## Voix, appels et assistant vocal

- **Message vocal** : bouton « Message vocal » sous chaque message (5 min max, audio WEBM/M4A/OGG, 25 Mo).
- **Dictée** : bouton « Dicter » (français ou arabe, bouton FR/ع). Fonctionne sur Chrome, Edge et Safari.
- **Appel vidéo / audio en direct** (WebRTC, pair à pair) depuis une demande, dans les deux sens.
  Pendant l'appel : micro, caméra, partage d'écran (ordinateur), enregistrement (joint ensuite à la demande, l'autre personne voit « Enregistrement en cours »), raccrocher.
  La durée, les appels manqués et refusés sont notés dans la demande. Table D1 : `calls`.
  Réseaux mobiles stricts : ajouter un relais TURN Cloudflare (Realtime → TURN) puis les secrets `TURN_KEY_ID` et `TURN_KEY_API_TOKEN`.
- **Assistant vocal (admin)** : bouton micro rond en bas à droite. Exemples : « demandes en attente », « chercher Atlas », « ouvre la première », « lis le message », « réponds … », « envoie », « statut résolu », « appel vidéo », « combien ». En darija : « اللي كيتسناو », « قلب على … », « حل اللولة », « اقرا », « جاوب … », « صيفط », « دير محلول », « عيط ».
- **Parler au support (clients)** : bouton micro vert en bas à droite. Le client parle ; sa voix est enregistrée et transcrite en même temps. Il relit le texte puis envoie : l'équipe reçoit le texte ET le message vocal (réponse sur la demande ouverte, sinon nouvelle demande).
- **🔊 Écouter** sous chaque message : lecture à voix haute (français ou arabe).
- **Enregistrer l'écran (ordinateur)** : bouton « Enregistrer l'écran » à côté de 📎. Écran + voix (micro et son de l'ordinateur), pause / reprise, jusqu'à 4 heures. La vidéo est envoyée **morceau par morceau pendant l'enregistrement** (R2 multipart, table D1 `multipart_uploads`), donc pas de limite d'une heure.
- **Longues vidéos du téléphone** (AZ Screen Recorder, enregistreur intégré) : ajoutées avec 📎, jusqu'à 5 Go, envoyées en morceaux de 10 Mo (reprise automatique si un morceau échoue).
- **Enregistrement des appels** : même envoi en morceaux, jusqu'à 4 heures.
- Coût R2 : 10 Go gratuits, puis environ 0,015 $ par Go et par mois (1 h d'écran ≈ 400 Mo).
- **Onglet « Écran & appel »** (clients et équipe) : réparation en direct.
  - Client (ordinateur) : « Appeler et montrer mon écran » : il choisit l'écran, puis le support sonne et voit son écran tout de suite. Sur téléphone : appel vidéo + caméra arrière (« Retourner ») pour filmer l'écran du PC.
  - Équipe : « Appel vidéo + demander son écran » ; pendant tout appel, le bouton « Demander l'écran » invite le client à partager (colonne D1 `calls.ask_screen`). Partage d'écran en haute netteté (priorité à la résolution), plein écran.
  - « Filmer mon écran » (enregistrement ajouté à la demande), « Prise en main à distance » (le client envoie son identifiant AnyDesk / RustDesk), galerie de toutes les vidéos (`GET /api/recordings`).
- **Enregistreur d'écran** (`#/rec`, aussi sans compte, et raccourci de l'application installée « Enregistrer mon écran ») : comme AZ Screen Recorder sur PC. Filme tout l'écran (tous les logiciels) avec la voix, le son de l'ordinateur et une bulle caméra en option ; compte à rebours ; qualité 720p / HD ; fenêtre de commandes flottante toujours au-dessus (Document Picture-in-Picture, Chrome / Edge, styles dans `public/pip.css`) avec minuteur, niveau du micro, pause, couper le micro, arrêter. À la fin : aperçu, téléchargement (MP4 si le navigateur le permet, sinon WEBM) et envoi au support (demande existante ou nouvelle ; connexion demandée si besoin, la vidéo attend).
