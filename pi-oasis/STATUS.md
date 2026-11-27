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
