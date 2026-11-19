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
- Mainnet app wallet GAW5E… (Outgoing Wallet): pending review.
- Ecosystem listing: submitted, pending review.
- Pi Ad Network: pending (payout address 0xa8546C678c33B9d2277EB015072Ce0A31a90326f).
- Incoming Multisig wallet: postponed (signer GAB2O… is not on Mainnet).

## When the Mainnet wallet is approved
1. Owner: Outgoing Wallet → select GAW5E… → Update; send 2–3 Pi to it.
2. Set `PAYMENTS_LIVE = "1"` under `[env.main.vars]` in `wrangler.toml` and push (purchases on Mainnet are closed until then; the game shows a "purchases open soon" banner).
3. Test a 0.2 Pi date pack on https://jerryoasis9559.pinet.com.

## Game features (all tested: `node --no-warnings tests/harness.mjs` then each `tests/*.mjs`, plus `bash tests/payments.sh`)
Farm, camels, city, granary, weekly ranking with Pi prize pool, memberships, referrals (10%), missions, daily events,
Jerry Kombat (cards, bosses, leagues, tournament, tribes, 20 collectibles, rewarded ads), JRY in-game currency (bought with Pi),
testJRY token + players' market (Testnet only), points market (25% fee, withdraw from 5 Pi), lucky wheel (prizes in-game only),
Jerry Media Earnings (unlimited rewarded ads), Jerry Arcade (memory, date catcher, future games by player milestones),
Business showcase (paid listings reviewed by the owner), gift codes, Testnet → Mainnet progress carry-over (once, by username).

## Decisions already made (do not reopen)
- Pi-only payments in the app (owner committed to it in the listing). No USD/USDT, no external code shop.
- No gambling (the wheel never pays Pi), no revenue-share NFTs, no staking of players' Pi.
- testJRY stays on Testnet; a real JRY token only through Pi's official token path (Launchpad/PiRC1).

## Pi Developers MCP (new)
`https://developers.minepi.com/mcp` (guide: https://developers.minepi.com/agents.md). Tools: whoami, list_apps, get_app
(checklist incl. `create_wallet`), update_app, verify_app_url_ownership, set_app_logo, prompt_payments. Connected as a claude.ai
custom connector; use `get_app` to check the Mainnet wallet and listing status instead of asking for screenshots.
