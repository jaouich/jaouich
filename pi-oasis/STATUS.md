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
- Collectibles economy (Kombat → collectibles tab): every card except the mythic ones now has 10,000 copies; mint price rises 10% per 1,000 copies made. Owners can sell a copy for Kombat coins or JRY (5% burned) or offer a 1-for-1 swap for a chosen card (no fee, notification to the other side). Selling for Pi is NOT built yet: it needs the outgoing wallet approved (A2U_LIVE) first. Tests: tests/nftmarket.mjs.
- Jerry Arena removed from the app (tile, page and scripts); its server routes, tables and tests remain dormant.
- Offline limit is 6 hours everywhere (camels, city tax, Kombat passive income).
- Web ads (outside Pi Browser only): `public/webads.js` shows a banner on learn.html after the visitor accepts, only when `WEB_AD_UNIT` in public/config.js is set to an https banner address (empty = off). Never in Pi Browser, never tied to rewards. AdSense needs the owner's own domain; switching to it later only changes this one setting plus ads.txt.
- Testnet game CLOSED (Mainnet is live): on the Testnet addresses (pi-oasis.* / oasisgame6033.*) every POST except /api/auth returns `testnetClosed`, and the app is covered by a notice with a button to the Mainnet game. The Mainnet game still reads Testnet progress directly from the database on a player's first Mainnet sign-in, so nothing is lost. To reopen: remove the two `testnetClosed` pieces (worker.js fetch + game.js #tnClosed).
- 🎁 My box (Farm hub tile, /?go=box): JRY balance + total bought + ledger, and gifts between members of coins, dates, JRY or a collectible (`POST /api/gift`, `GET /api/box`). Rules: fee 5% coins/dates, 2% JRY (burned), collectibles free; min amounts, daily limits per asset, 10 gifts/day, coins ≤ 20% of balance per gift, senders need a 24h-old account; gift coins are tagged `gift` and never count toward the airdrop or ranking; every gift is in `transfers`. Tests: tests/gift.mjs. Next (not built yet): chat (public room + private), see plan.
- 💬 Chat (Farm hub tile, /?go=chat, /?go=chat&with=name): one public room + private chats; text only, 400 chars, no links, 2 s between messages (30/min), accounts need 1 hour, block/report (3 reporters hide a message), owner can delete and mute 24 h from the message sheet; public messages kept 7 days, private 30 (hourly cleanup); polling 2.5 s; push notification for private messages. Tests: tests/chat.mjs.
- 🏰 Jerry Castle (replaces Arena on the Farm hub, /?go=castle): tower defense with 3 maps (Oasis, Canyon, Desert Gate; enemy strength 100/140/170%), 20 waves, 4 towers × 3 levels, castle 20 HP. The phone plays with `public/castle-logic.js` and sends its action log; the server (`POST /api/castle/finish`) replays it deterministically, so rewards can't be faked. First clear: 20k/40k/80k coins (+25% per extra star) + 300/600/1200 dates; more stars pay the difference; replays pay 3k/6k/10k, max 3 per day; castle coins never count toward the airdrop. Replay costs ~5 ms of CPU. Tests: tests/castle.mjs. Not built yet: maps 4-5, saving a game in progress, Tasks-screen entry.
- D1 free-tier read limit (Nov 21): the whole account hit "daily row read limit" and every request failed. Fixes: the schema now runs only when its stored version (`schema_meta`) differs (one read per Worker start instead of ~110 statements); chat polls 5 s open / 20 s list / 3 min badge and never in a hidden tab; `chat_members` index for room lists; indexes on nft_credits, nft_moves, users (NOCASE), ads, chat_msgs; the closed Testnet Worker answers `testnetClosed` before touching D1 and skips its cron (`TESTNET_CLOSED` in wrangler.toml); D1 limit errors now answer `busy` ("the game is resting"). Reset: midnight UTC, or Workers Paid. Debug: `EXPLAIN=1 node tests/harness.mjs` prints table scans.
- Home redesign (Nov 22): the Farm tab hub is now four labelled sections (Play / Earn / Collect & trade / Community & services) with equal tiles; the JRY, learn and services bars became tiles; endless shine animations removed. Only index.html/style.css/i18n changed; every element id kept.
- 🎨 Manga & Magazine inside the app (Farm hub, section Read & watch, /?go=mag): reads the Jerry Magazine Worker's /feed.json through the service binding MAG (env.main) via GET /api/mag (cached 10 min); tabs Manga (reader inside the app), Articles, Courses (open on the website); NEW badge when something newer than the last visit exists. Daily task publishes a manga chapter, an article/story and an English lesson. Tests: tests/mag.mjs.
- Documentaries: magazine /docs/ (3 episodes, Arabic + English versions with subtitles and scripts); app tab Documentaries; hourly cron announces a fresh manga chapter (notif kind mangaNew, once per chapter per player, only if the chapter is at most 3 days old; MAG_NOTIFY=0 turns it off).
- Pi prize box: 🎁 My box now shows each player's Pi prizes and payouts (waiting vs already sent) from the payouts table; while A2U_LIVE="0" it says sending is not open yet and that prizes are sent automatically when it opens. Weekly prize notification text updated. Test: tests/gift.mjs.

- Club tab: split into 5 sub-tabs (Membership, Cards, Shop, Invite & codes, Owner tools) via public/clubnav.js; adaptive grids, wrap fixes, safe-area bottom padding.

- Royal cards: 3 premium tiers (500/1000/5000 Pi, 500 copies each, in-game perks only), resale between players with 10% seller tax (mk_offers kind=card), Club cards layout rebuilt. Grand Final still opens at the 2,000 original cards; boost cap 100%. Auctions not built yet.

- Date Palm tap game replaces crop plots (palm.js, logic.js pTap/pUp; old plots paid out once). Yield multipliers x2 10 Pi/60 d, x3 20 Pi/30 d, x10 100 Pi/30 d (apply to oasis income + Kombat profit). Premium royal cards numbers raised (boost cap 800%). Catalog album still counts the 4 original cards only.

- VIP Club (vipc.js, vip-logic.js): 5 Pi / 30 days, Hall of Glory (players who paid Pi, amounts shown to members), Sultan's Caravan skill game (3 trips/day, monthly ranking, pays Kombat coins). Free entry: owner codes (kind vipclub), owner grant (/api/admin/vipc + button in codes panel), wheel prize (replaced the 250k coins slot, 3 days), top 3 of the weekly Kombat ranking (30 days). Multiplier also boosts Kombat profit (holdBoost). Fixed membership cards cut off in Club.

- Daily gift code: GET /api/daily-code (public, CORS) creates one single-use code a day (10,000 JRY + 5,000 dates, 24 h); codes got kind2/amount2; card on the home page with copy/use/share.

- Weekly Pi prizes are now queued in the box even before the outgoing wallet exists (payouts.js queuePayouts runs before the wallet check) and each winner gets a "piprize" message that opens My box. Mainnet cron now runs at :03 and :23.

- Ranking tab: "last week winners" block at the bottom (top 30 with Pi/dates/JRY, my own prize card + Open my box) and a one-time "you won" pop-up per winner (GET /api/week/mine, leaderboard.last).

- Pay with the box: Pi waiting in My box (prizes, refunds) can pay VIP Club, multipliers, royal cards, packs, VIP tiers inside the app (POST /api/box/spend, grantItem internal=true: no prize-pool share, no inviter commission, not counted in the Hall of Glory). account.piWaiting; choice dialog in pi.js pay().

- Golden King card (throne): tier "king" in ROYAL (priceOf: 9,999 then 11,111, 12,222, +1,111; Pi payments, copy n = next free only), the holder of the newest copy is King for 90 days: crown at the top of the Ranking tab (throne.js, leaderboard.king), x3 multiplier (multOf), big daily gift on royal claim, new-king notification (newking). Dethroned King keeps the card (smaller perks), can resell. Reign cache 60 s (kingRefresh in auth).

- King of the Game is now the player with the most real Pi paid in total (completed Pi payments; box payments do not count; ties: who reached it first). Crown + throne block at the top of the Ranking tab, 10,000 coins a day (POST /api/king/claim), x3 multiplier, notification when the King changes (king_state). Replaces the Golden King card idea (removed).

## The Court — Emperor, titles, Houses, Parliament, decrees (replaces "King of the Game")
- Titles come from the total of completed real-Pi payments (box payments excluded): #1 Emperor (x3, 10,000 coins/day), #2 Crown Prince (x2, 6,000), #3 Grand Vizier (x1.5, 4,000), #4-10 Emirs (2,000), other payers Notable, non-payers Citizen. `courtRefresh` (60 s cache), `COURT` table in `public/logic.js`, `multOf` takes the best of bought multiplier and title multiplier. Daily gift: `POST /api/court/claim` (`court_gifts`). Notifications `courtnew/courtlost/courtemp/elected`.
- Houses: found one with a Pi payment (`type:"house"`, 10 Pi, or 1 Pi if the player already paid >= 10 Pi). Join/leave free, 24 h wait after leaving. Score = members' total Pi; leading House members get 1,000 coins/day. Routes `/api/houses`, `/api/houses/join|leave`.
- Decrees (votes): Emperor or owner opens 2-5 options, 3 days. Vote weight = 1 + Pi paid (cap 500); non-payers still vote. Public results `GET /api/decrees/results`. Never on money or prizes.
- Parliament: monthly cycle by UTC day: 1-7 candidacy, 8-14 voting, from 15 results; 15 MPs (1,000 coins/day), #1 Speaker (2,000). `COURT_NOW` test override.
- Client: `public/court.js` (overlay `#court`, tabs Court/Houses/Parliament/Votes), `public/throne.js` (Emperor block on Ranking tab). All text says in-game titles, supports the project, not refundable, not an investment.
- Tests: `tests/court.mjs` (47). Run each suite on a fresh harness.

## Harvest Levels (step 1 of the fun update)
- XP = dates earned honestly (`earn()` in `public/logic.js` adds `s.xp`; bonuses, purchases and prizes excluded). `OasisLogic.LV`: level 2 at 120 XP, x1.6 per level up to 30 then x1.5, no maximum. Reward per level: 100 x level dates; every 5th level also JRY points = level and a wheel spin.
- Routes `GET /api/level`, `POST /api/level/claim` (table `level_claims`, once per level), `GET /api/level/top`. UI: `public/level.js` (bar `#lvBar` on the Farm tab, page `#levels`). JRY points are in-game; token conversion is not promised.
- Tests: `tests/level.mjs` (11).
- Next steps in the plan: Horse Merge game, login streak + achievements, seasons.

## Horse Merge (step 2)
- Runs inside the main state (`s.merge`: 20-cell grid, best level, merges, weekly points) with actions `mgBuy`, `mgDrop` (move / swap / merge equal levels), `mgSell`, `mgCollect` in `public/logic.js` (`OasisLogic.MG`). Income x1.8 per level (6 dates/h at level 1), storage 6 h, new horse cost x1.25 per best level, sell price fixed so there is no profit loop. No maximum level.
- Ranking: `merge_weeks` (points = 2^(level-1) per merge), top 100 paid by cron `grantMergeWeek` (dates + JRY points, notification `mweek`). Milestone rewards every 5th best level: `merge_claims`, `GET /api/merge`, `POST /api/merge/claim`.
- UI: `public/merge.js`, overlay `#merge`, hub banner `#mergeOpen`, deep link `?go=merge`. Tests: `tests/merge.mjs` (20).

## Daily streak + achievements (step 3)
- Streak: `login_streak`, `GET /api/streak`, `POST /api/streak/claim` (7-day cycle: 100/150/200/300/400/500/1000 dates, day 7 also 20 JRY points + a wheel spin; a missed day resets). Achievements: `ach` table, 16 badges (`OasisLogic.ACH`, conditions from the server state), 10 JRY points each, `GET /api/ach`, `POST /api/ach/claim`. UI `public/ach.js` (bar `#achBar`, page `#ach`). Tests `tests/streak.mjs` (12).

## Seasons (step 4)
- A season = 4 whole weeks from a Monday (`OasisLogic.SEASON`). Season points = oasis dates/100 + merge points/10 + derby points + kombat coins/1000, summed from the weekly tables (`seasonBoard`). 8-tier reward track (`season_claims`), top 10 of the finished season get 1000/600/400/150x7 JRY points via cron `grantSeasonPrizes` (`season_paid`, notification `season`). Routes `GET /api/season`, `POST /api/season/claim`. UI `public/season.js`, hub banner `#seasonOpen`. Tests `tests/season.mjs` (8).
- Not done from the plan: Friday "harvest festival" event for Horse Merge.

## Castle update: Endless Siege, 3 maps, 2 towers, weekly ranking
- Endless Siege (`newGame(map, true)`, up to 60 waves, 48,000 ticks, 1,500 actions; replay-verified by `CASTLE.simulate(map, log, endless)`), score = cleared waves x 10000 + kills. Towers Tesla (chain to 3-4 enemies, 70% on the others) and Poison (damage every 5 ticks for 30 ticks). Maps dunes/ruins/storm (6 maps, DIFF up to 270). Rewards for maps 4-6 in `CASTLE_REWARD`.
- Weekly ranking `castle_weeks` (best run of the week), `GET /api/castle/top`, cron `grantCastleWeek` (top 100: `MG.weekPrize` dates + JRY points, notification `cweek`). Endless pays 300 coins per cleared wave for the first 3 runs a day (`castle_day` key `uid:e`). Tests: `tests/castle.mjs` (44).

## Monthly League (replaces the raw-score Season)
- Points = place in each game's weekly ranking (Harvest, Kombat, Derby, Horse Merge, Castle): 1st 100, 2nd 80, 3rd 65, then down to 1 at rank 100, summed over the season's 4 weeks (`seasonBoard`, window functions). Divisions Bronze/Silver/Gold/Diamond/Champion (`league_div`); at the end (cron `grantSeasonPrizes`, guard `season_paid`) the top 20% of each division with 5+ active players go up, the bottom 20% go down, results in `league_results`; rewards by outcome (`SEASON.reward`), general top 10 (highest division, then points) also get 1000/600/400/150x7 JRY points. Reward track by SP kept (`season_claims`). UI `season.js`: division badge, promotion/relegation zones, general ranking, last result card and a one-time toast. Tests `tests/season.mjs` (14).

## Black Boxes (10 cards sold for 1-10 Pi)
- `OasisLogic.BBOX`: boxes 1..10 Pi with FIXED contents (never random): dates, Kombat coins, JRY points, wheel spins, plus a rare/epic/legendary camel from box 4, x2 days from box 5, VIP Club days from box 6 (`BBOX.TIERS`). Each box mints a numbered Kombat collectible `box1..box10` (up to 1,000,000 copies, perk +1%..+10% Kombat profit; `COLLECTIBLES` entries with `pi`; excluded from the Catalog album and from coin minting `k.nftPaid`).
- Payment type `bbox` (amount must equal the tier, `BOX_SPEND_TYPES` includes it), `bboxOpen` in `grantItem` (guard table `bbox_opens` by payment id; edition from `bbox_counter`, never reused). `GET /api/bbox`, `POST /api/bbox/burn` (owner only, pays 20% of the box's dates, deletes the card, `bbox_burns`). Cards trade through the existing collectibles market (coins/JRY points), swap and gifts.
- UI: Kombat > Collect > "Black Boxes" tab + reveal animation (`showReveal` in `kombat.js`). Tests `tests/bbox.mjs` (20).

## Hardening (after the expert review)
- Game state is versioned (`state.ver`, `loadState` remembers the version, `saveState` is compare-and-set; direct `json_set` credits bump the version too). A parallel save fails with `StateConflict`: `/api/action` and every GET redo the work (up to 3 times), other routes answer 503 `busy`; `stateFor` gives back the NFT credits it took. Test: `tests/concurrency.mjs` (start the harness with `D1_LATENCY_MS=4`): on the old code 5 parallel gifts of 600 dates from a 1,000 balance created about 1,850 dates.
- Card mint/buy: the buyer pays first (state save or atomic JRY debit), then the card moves, with a refund when it is gone.
- Payments: if the grant fails after the payment is marked completed, the payment becomes `grant_failed` (logged as "GRANT FAILED <id>"), never granted twice; check `SELECT * FROM payments WHERE status='grant_failed'` in the daily report.
- Payouts: a row is claimed (`status='sending'`) before creating the Pi payment; stale claims are freed after 10 minutes.
- `/api/status` is public only for the three "configured" flags; wallet address, payouts and errors need `x-admin-token`. Rankings (`kombat/top`, `level/top`, season board) are cached 60 s per Worker instance (`BOARD_TTL_MS`). Sessions older than 31 days are deleted by the cron. Sign-in and payment routes are rate limited per IP (30 and 60 per minute, `RATE_LIMIT_PER_MIN`).
- Still to do: Cloudflare-level rate limiting rules, pin the admin to a uid instead of a username (needs a Pi answer on username reuse).

## Usage measurement (Phase C, step 1)
- `activity(uid, day)` (one row per player per day, written on `GET /api/me`) and `usage_events(uid, name, day)` (`POST /api/event`, whitelist `USAGE_EVENTS`, once per player/system/day). Client `public/track.js` sends the system openings (hub banners, tabs, level/streak bars, palm tap) once a day per name.
- Owner report: `GET /api/admin/metrics` with `x-admin-token`: daily actives, D1/D7 of the last 14 sign-up cohorts, share of last week's actives who used each system, payers and Pi last week, Pi owed to winners and its age, `grant_failed` count. Tests `tests/usage.mjs` (10).

## Growth (Phase F, first part)
- Invitations: the invited player gets 2,000 dates + 1 wheel spin on sign-up through `?ref`; the inviter gets 3,000 dates + 5 JRY points once the friend has opened the game on 2 different days (table `ref_rewards`, `refMilestone`, notification `refplay`), max 5 paid rewards per inviter per day, none when both accounts share the same network hash. The Pi payment commission (10%) is unchanged. Tests `tests/invite.mjs` (8).
- Every share bar link to the app now carries the sharer's `?ref` (`JShare.withRef` in `share.js`); `share_click` events; `/api/admin/metrics` has `referrals30d` (invited sign-ups, D1, rewarded, sharers last 7 days).
- Site basics: `manifest.webmanifest`, `robots.txt`, `sitemap.xml` (pinet URL), canonical and og:locale tags. Not done yet: result-card images for sharing, "friend reached level N" and win-back notifications, magazine "open the game" links (no ref on another domain).

## Garage and collector cars
- Garage (dates sink): `OasisLogic.GARAGE`, 10 invented-brand cars from 50,000 to 50,000,000 dates, levels 1-3 (upgrade costs 50% then 100% of the price); bonus per car (+0.5% to +10%, x1/1.25/1.5 by level), total capped at +30%, applied as bonus dates (never ranking or XP) to camel collect, palm hits and the daily gift. Actions `gBuy`, `gUp` in `logic.js`; state `s.garage.own`.
- Collector cars (Pi): `OasisLogic.CARS`, 10 limited numbered cards (3 to 100 Pi; 5,000 down to 50 copies), fixed bundle (dates = 500 x Pi, JRY points = 2 x Pi, spins) and a Kombat profit perk; collectibles `car1..car10` (excluded from the Catalog and from coin minting). Payment type `car` (`carGuard` sold-out check, `carOpen`, tables `car_counter`, `car_opens`, `GET /api/cars`). UI `public/garage.js` (hub: More > Garage), SVG cars drawn in code. No real car makers are named. Tests `tests/garage.mjs` (21).

## Garage: luxury photo collection (Phase G)
- 6 invented models (Titan X "The Beast", Colossus "The Legend", Apex Turbo "The Rocket", Sovereign GT "Luxury", Highland Prestige "Prestige", Monarch "The King") x 4 paints = 24 cars, bought with dates (1.5M to 5M), upgrade levels 1-3 like the other garage cars, all inside the 30% garage cap. Owning all 4 paints of a model adds +1%. All 24 = "Grand Collector" (action `gCrown`, one-time 20M dates, not counted for ranking or level).
- The 10 Pi collector cards now show pictures (`CARS.PHOTO`); payment, numbering and market are unchanged.
- Pictures: `public/cars/<model>-<paint>.webp` (800x380, 12-21 KB each, 464 KB total, lazy loaded). Made offline from the owner's photos: emblems, plates and lettering painted over (best effort), other paints by colour shifting. Texts in en/ar/fr only.
- `CAR_PHOTOS: false` in `public/config.js` switches back to the drawn cars at once.
- OPEN RISK (told to the owner): the photos show real cars; shapes and trade dress may still be recognisable. Replace with licensed or original pictures before the Mainnet listing, or switch `CAR_PHOTOS` off.
- Tests: garage suite 37 checks.
