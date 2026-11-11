# 🌴 Pi Oasis

A farming & trading game for **Pi Network** (Pi Browser), in English, Arabic and French.
Runs on **Cloudflare Workers** with a **D1** database.

## Features
- 🌾 **Farm:** plant and harvest to earn dates 🪙 (in-game currency, no monetary value)
- 🏺 **Granary (staking with dates):** 1 h +5%, 24 h +30%, 7 days +150% + rare tree
- 👑 **VIP – 0.25 Pi / month:** 10 staking slots, +20% staking rewards, no ads, double daily reward
- 🤝 **Referrals – 10% of every monthly renewal:** one level only; balance can be swapped for VIP or withdrawn from 1 Pi
- 🏆 **Weekly leaderboard (free to enter):** Top 3 share 15% of subscription revenue (50% / 30% / 20%)
- 📺 **Pi Ad Network:** watch a rewarded ad to finish a crop (non-VIP)
- 🛡️ **Anti-cheat:** signed-in players' game runs on the server with the server's clock (`public/logic.js` holds the rules, shared by the browser demo and the server). Ads are verified with Pi and each ad can be used once.

## Revenue split per subscription (0.25 Pi)
| Goes to | Share |
|---|---|
| Referrer | 10% |
| Weekly prize pool | 15% |
| App wallet (costs + developer) | 75% (85% without a referrer) |

## Layout
```
public/        game screens (HTML/CSS/JS) + Pi SDK + shared rules (logic.js)
src/worker.js  Cloudflare Worker: Pi sign-in, game actions, payments, referrals, ranking
schema.sql     D1 database tables
wrangler.toml  Cloudflare config (D1 database "pi-oasis-db")
```

## Deploy (Cloudflare)
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → this repo, root directory `pi-oasis`
2. Worker **Settings → Variables and Secrets** → add secrets `PI_API_KEY` (Pi Developer Portal) and `ADMIN_TOKEN` (any long password)
3. Database tables: run `schema.sql` on `pi-oasis-db` (already done for the current database)

## Still to do before real prizes
- **Sending Pi to winners / referral withdrawals (App → User)** isn't automated yet. `GET /api/admin/payouts` (header `x-admin-token`) lists who to pay.
- Read the **Pi Developer Terms** about prizes and referrals.
