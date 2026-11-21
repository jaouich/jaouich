# Pi Oasis – project status (for the next session)

Owner: Pi username `jaouich` (Jerry Development community). Replies to the owner: Moroccan Darija, Arabic script.

## Apps and servers
| | Testnet (Staging) | Mainnet (Production) |
|---|---|---|
| Pi app | Oasis Farm Game (Testnet) | Oasis Farm Game (Mainnet), slug `oasis-farm-game-c2ss` |
| Public link | https://oasisgame6033.pinet.com | https://jerryoasis9559.pinet.com |
| Cloudflare Worker | `pi-oasis` (deploy command: `npx wrangler deploy`) | `jaouich` (deploy command: `npx wrangler deploy --env main`) |
| Worker URL | pi-oasis.jaouich.workers.dev | jaouich.jaouich.workers.dev |
| D1 database | `pi-oasis-mainnet-db` (name is historical: it holds the Testnet game) | `pi-oasis-live-db` (+ read-only `TESTNET_DB`, `TESTNET_DB_OLD` for carry-over) |
| App wallet | GCFCPBGLHIBERD22GROFLC42XR6KO7DZKTMV4PRNQTV4GKTAHN4PSNU4 (active, holds testJRY) | GAW5EO4FXQKKWQ7FJH2CX3HZTDEHMGLP7HI7NN4RVFXYMGREU5OKPAT3 (**pending Pi review**, not active yet) |

Secrets live only in Cloudflare (Variables and Secrets): `PI_NETWORK_API_KEY`, `PI_WALLET_SEED`, `ADMIN_TOKEN`. Never ask for them in chat.

Deploy: commit in `pi-oasis/` on branch `ccr-c8d511c9-pqtm95` of `jaouich/jaouich`; Cloudflare Workers Builds deploys both Workers on push.

## Waiting on Pi
- Mainnet outgoing wallet GAW5E…: pending review (check with Pi Developers `get_app`: `outgoing_wallet_id` stays null until connected). App id in `.pi-onboard.json`.
- Ecosystem listing: submitted, pending review.
- Pi Ad Network: pending (payout address 0xa8546C678c33B9d2277EB015072Ce0A31a90326f).
- Incoming Multisig wallet: postponed (signer GAB2O… is not on Mainnet).

## Mainnet payments
- Purchases are OPEN (`PAYMENTS_LIVE = "1"`). Incoming wallet = owner's personal wallet GAB5M5…2LJY (set in Pi Developers, cap 10,000 Pi).
- Payouts to players are HELD (`A2U_LIVE = "0"` in `[env.main.vars]`): weekly Pi prizes, market withdrawals and refunds queue as 'new'.
- When Pi approves the outgoing wallet GAW5E…: owner selects it and sends 2–3 Pi to it; set `A2U_LIVE = "1"` and push. The queue then goes out on the hourly run.

## Game features (all tested: `node --no-warnings tests/harness.mjs` then each `tests/*.mjs`, plus `bash tests/payments.sh`)
Farm, camels, city, granary, weekly ranking with Pi prize pool, memberships, referrals (10%), missions, daily events,
Jerry Kombat (cards, bosses, leagues, tournament, tribes, 20 collectibles, rewarded ads), JRY in-game currency (bought with Pi),
testJRY token + players' market (Testnet only), points market (25% fee, withdraw from 5 Pi), lucky wheel (prizes in-game only),
Jerry Media Earnings (unlimited rewarded ads), Jerry Arcade (memory, date catcher, future games by player milestones),
Business showcase (paid listings reviewed by the owner), gift codes, Level-up packs (0.1 / 0.5 / 1 / 5 / 20 / 100 Pi),
Camel Derby (3rd game: train racing camels, 8 free races a day + 4 after an ad, Pi buys golden feed and breeds; no entry fee, no bets),
Jerry Arena (M1-M3 + spectate/streamer toggle): turn-based PvP battles, 1v1 / 2v2 teams / 4 players free-for-all, quick match with bot fill after 15 s, private rooms with code + invites, trophies, capped rewards (10 rewarded matches a day, none between linked accounts), weekly top 100; rules in public/arena-logic.js; watch links /?go=arena&watch=ID work without login. TODO: M4 OBS overlay stream.html, M5 replay clips + result card image, M6 balance and tasks. Plan: /root/.claude/plans (see commit history),
Jerry Development services page (Farm tab → 🛠️ bar, /?go=services): 4 packages "from … Pi" (public/logic.js SERVICES), request form → owner Pi notification + owner list with statuses; no payment on the page,
Royal cards (Club tab: 4 tiers 10/25/50/100 Pi × 500 numbered copies, each with a fixed signature perk shown before buying; Kombat profit, Derby races, daily gift; Grand Royal Final opens once all 2,000 copies are sold: 30 days, top 10 holders by Kombat coins earned win, 1B coins for #1; no random rewards),
Learn page /learn.html (videos in public/videos + guide in ar/en/fr + share buttons), welcome screen with language choice for links opened outside Pi Browser, share bar (WhatsApp/Facebook/Telegram/X/Messenger) under the invite link, og-image.jpg for link previews,
Free support from 1 Pi (in-app Pi payment to the incoming wallet; 100 JRY + 1,000 dates per Pi, 🤍 badge, one monthly surprise identical for all supporters that month),
Founding supporters (Club tab: 10 / 50 / 200 Pi, badge 💚💙💎, camel, JRY, honor wall; support, not investment),
Owner JRY distribution (Club tab, owner panel: active / all / weekly top N / usernames, with Pi notification), weekly JRY for the Oasis top 100 (500 … 20),
Pi Notification Center (scope in_app_notifications; weekly prizes, Kombat/Derby winners, sold offers, daily reminder 18:00 UTC; links /?go=…),
Testnet → Mainnet banner on the Testnet game, interstitial ads at breaks (Derby/Arcade, 1 in 3, ≥3 min apart),
100 weekly winners (Oasis: Pi pool 20/12/8%, 3% ×7, 1% ×20, 19% shared by 31-100, + dates; Kombat: coins to 100 places; Derby: dates to 100), Task center (owner-made daily / weekly / one-time tasks:
check-in, open a link, secret word, ads, Arcade, invites, wheel; managed inside the Task center page), Testnet → Mainnet progress carry-over (once, by username).

## Decisions already made (do not reopen)
- Pi-only payments in the app (owner committed to it in the listing). No USD/USDT, no external code shop.
- No gambling (the wheel never pays Pi), no revenue-share NFTs, no staking of players' Pi.
- testJRY stays on Testnet; a real JRY token only through Pi's official token path (Launchpad/PiRC1).

## Pi Developers MCP (new)
`https://developers.minepi.com/mcp` (guide: https://developers.minepi.com/agents.md). Tools: whoami, list_apps, get_app
(checklist incl. `create_wallet`), update_app, verify_app_url_ownership, set_app_logo, prompt_payments. Connected as a claude.ai
custom connector; use `get_app` to check the Mainnet wallet and listing status instead of asking for screenshots.
- JRY token page in the app (Farm tab → 💠 bar, /?go=jry): planned supply 10 trillion, roadmap, early-supporter note (no swap promised before Pi approves). JRY token plan: see JRY-PLAN.md (Launchpad/PiRC1 path, Mainnet Launchpad planned Q1 2027).
- 📖 Personal catalog (Farm tab bar, /?go=catalog, button in Kombat collectibles): one album with 28 slots (22 required: series 1 = 7, series 2 = 11, royal cards = 4; bonus: 2 mythics + 4 supporter badges). Cards are drawn by the app (optional PNG in public/cards/<id>.png listed in cards/manifest.json). Items count after a 3-day hold. Prizes (claimed once): 3/6/10/15 cards, each section, Master Collector (3M coins + 500 JRY + 📚 badge); permanent Kombat profit boost capped +5%. Other players' albums: /?go=catalog&u=name. Tests: tests/catalog.mjs.
