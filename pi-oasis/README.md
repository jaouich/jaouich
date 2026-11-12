# 🌴 Pi Oasis

A farming & trading game for **Pi Network** (Pi Browser), in English, Arabic and French.
Runs on **Cloudflare Workers** with a **D1** database.

## Features
- 🌾 **Farm:** plant and harvest to earn dates 🪙 (in-game currency, no monetary value)
- 🐪 **Camels:** buy (300 🪙), collect dates every hour (common 10/h, rare 20, epic 40, legendary 80; up to 8 h), breed two camels (200 🪙, 24 h rest) – the baby can be rarer (up to epic). Weekly Top 3 win a legendary / epic / rare camel. Herd 6 (VIP 12).
- 🏙️ **Oasis City:** an isometric 3D city (pure CSS) on a 5×5 map. Homes pay taxes, workshops craft goods (bread, mint tea, spices, carpets, vases), citizens' orders turn goods into dates and XP, XP raises the city level and unlocks buildings; decorations add happiness (more taxes). Memberships add +10–50% city income (bonus dates never count toward the ranking).
- 🏺 **Granary (staking with dates):** 1 h +5%, 24 h +30%, 7 days +150% + rare tree
- 👑 **Memberships (30 days):** Bronze 0.25 Pi, Silver 0.5 Pi, Gold 1 Pi – more slots, camels, staking and daily rewards, no ads, ranking badge. Upgrades convert remaining time by price.
- 💎 **Partner:** top membership granted by the owner (Pi usernames in `ADMIN_USERNAMES`) to Jerry Development partners from the Club tab; never sold. Includes a legendary camel gift.
- ⚖️ **Fair ranking:** membership bonuses add dates but never count toward the weekly score.
- 🤝 **Referrals – 10% of what the app receives on every monthly renewal:** one level only; balance can be swapped for VIP or withdrawn from 1 Pi
- 🏆 **Weekly leaderboard (free to enter):** Top 3 share 15% of what the app receives from subscriptions (50% / 30% / 20%)
- 📺 **Pi Ad Network:** watch a rewarded ad to finish a crop (non-VIP)
- 🛡️ **Anti-cheat:** signed-in players' game runs on the server with the server's clock (`public/logic.js` holds the rules, shared by the browser demo and the server). Ads are verified with Pi and each ad can be used once.

## Revenue split per subscription (0.25 Pi)
On Mainnet, Pi keeps 30% of App Studio sales, so the app receives **0.175 Pi**. Shares are taken from that:

| Goes to | Share of 0.175 Pi | Pi |
|---|---|---|
| Referrer | 10% | 0.0175 |
| Weekly prize pool | 15% | 0.02625 |
| App wallet (costs + developer) | 75% (85% without a referrer) | 0.13125 |

App wallet (Testnet): [GCXGCJXNYN7J5HPDV54VLTETWAUICACJKZE3P5MOARRUKHKUWDLJM6ZP](https://blockexplorer.minepi.com/testnet/accounts/GCXGCJXNYN7J5HPDV54VLTETWAUICACJKZE3P5MOARRUKHKUWDLJM6ZP)

## Layout
```
public/        game screens (HTML/CSS/JS) + Pi SDK + shared rules (logic.js)
src/worker.js  Cloudflare Worker: Pi sign-in, game actions, payments, referrals, ranking
schema.sql     D1 database tables
wrangler.toml  Cloudflare config (D1 database "pi-oasis-db")
```

## Deploy (Cloudflare)
Workers Builds deploy command (deploys Testnet and Mainnet Workers):
```
npx wrangler deploy && npx wrangler deploy --env main
```

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → this repo, root directory `pi-oasis`
2. Worker **Settings → Variables and Secrets** → add secrets `PI_NETWORK_API_KEY` (Pi Developers → this app → Settings → API key) and `ADMIN_TOKEN` (any long password)
3. Database tables: run `schema.sql` on `pi-oasis-db` (already done for the current database)

## Payouts (App → User)
Weekly prizes and referral withdrawals are paid automatically every hour by a Cron Trigger
(`src/payouts.js`). Transactions are built and signed in `src/stellar.js` (no npm packages).
- Needs the Worker secret `PI_WALLET_SEED` (the app wallet's secret `S...` key) and enough Pi in the app wallet for amounts + 0.01 Pi fee each.
- Each payout is saved before sending; a lost response is detected by searching the wallet's transactions for the Pi payment id, so nothing is paid twice.
- Prize pools too small to cover fees roll over to the next week. Failed withdrawals give the balance back after 3 tries.
- Admin: `GET /api/admin/payouts`, `POST /api/admin/run-payouts` (header `x-admin-token`).

Read the **Pi Developer Terms** about prizes and referrals before Mainnet.

## Pi apps
- **Oasis pi JDT** (Pi Developer Portal, Testnet) – app URL `https://pi-oasis.jaouich.workers.dev`, app wallet
  [GCFCP…PSNU4](https://blockexplorer.minepi.com/testnet/accounts/GCFCPBGLHIBERD22GROFLC42XR6KO7DZKTMV4PRNQTV4GKTAHN4PSNU4).
  VIP payment (0.25 Test-Pi) verified end to end in Pi Browser.
- **Pi Oasis** (App Studio) – earlier registration; its payments can't be approved (no API key).

`GET /api/status` shows whether the API key is set and recent server errors (no secrets).

## Tests
```bash
node --no-warnings tests/harness.mjs &   # Worker + SQLite + fake Pi API/App Studio on :3457
bash tests/payments.sh                   # U2A payment checks
# restart the harness for a clean database, then:
node tests/membership.mjs                # tiers, Partner grants, fair scoring (fresh harness)
node tests/city.mjs                      # Oasis City rules (fresh harness)
node tests/payouts.mjs                   # A2U payouts on a fake Pi chain that verifies signatures
```
