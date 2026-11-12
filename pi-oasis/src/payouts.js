// App-to-User payouts: weekly prizes and referral withdrawals.
// Runs every hour (Cron Trigger) and can be started by the admin.
//
// Safety:
// - Every payout is a row in `payouts` before any Pi is sent (idempotent, unique per kind/ref/uid).
// - Pi payment ids are saved before the blockchain transaction is sent.
// - Before (re)sending, the app wallet's recent transactions are searched for the
//   payment id in the memo, so a lost response never causes a double payment.
// - The wallet seed stays in the PI_WALLET_SEED secret and is only used to sign here.
import { sendPi, publicKeyOf, HORIZON } from "./stellar.js";

export const PRIZE_SPLIT = [0.5, 0.3, 0.2];
export const MIN_PAYOUT = 0.01; // smaller prizes cost more in fees than they're worth
const PER_RUN = 5; // payouts handled per run (keeps each run short)
const round = (n) => Math.floor(n * 1e7) / 1e7;

export async function processPayouts(env, d) {
  if (!env.PI_WALLET_SEED || !env.PI_NETWORK_API_KEY) return { skipped: "PI_WALLET_SEED or PI_NETWORK_API_KEY not set" };
  const now = Date.now();
  const report = { resumed: 0, created: 0, completed: 0, failed: 0 };
  let appAddress;
  try {
    appAddress = await publicKeyOf(env.PI_WALLET_SEED);
  } catch (e) {
    await d.logError(env, "payouts: PI_WALLET_SEED", 0, "not a valid S... wallet secret");
    return { skipped: "invalid PI_WALLET_SEED" };
  }

  // 1) Finish A2U payments Pi still has open (e.g. a previous run stopped half way)
  try {
    const inc = await d.pi(env, "/payments/incomplete_server_payments");
    for (const p of inc.incomplete_server_payments || []) {
      await finishPayment(env, d, p, appAddress);
      report.resumed++;
    }
  } catch (e) {
    await d.logError(env, "payouts: resume", 0, e.message);
  }

  // 2) Last week's prizes (once)
  const lastWeek = d.weekId(now - 7 * 86400000);
  const w = await d.one(env, "SELECT * FROM weeks WHERE id = ? AND paid = 0", lastWeek);
  if (w) {
    const top = await d.all(
      env,
      "SELECT uid, score FROM week_scores WHERE week_id = ? AND score > 0 ORDER BY score DESC, updated_at ASC LIMIT 3",
      lastWeek
    );
    const prizes = top.map((r, i) => ({ uid: r.uid, amount: round(w.prize_pool * PRIZE_SPLIT[i]) }));
    if (!top.length || prizes.some((p) => p.amount < MIN_PAYOUT)) {
      // Pool too small (or nobody played): roll it into this week's pool
      await env.DB.batch([
        env.DB.prepare("INSERT INTO weeks (id, prize_pool, paid) VALUES (?, ?, 0) ON CONFLICT(id) DO UPDATE SET prize_pool = ROUND(prize_pool + excluded.prize_pool, 7)").bind(d.weekId(now), w.prize_pool),
        env.DB.prepare("UPDATE weeks SET paid = 2 WHERE id = ?").bind(lastWeek), // 2 = rolled over
      ]);
    } else {
      const stmts = prizes.map((p, i) =>
        env.DB.prepare("INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'prize', ?, ?, ?, ?, 'new', ?, ?)")
          .bind(crypto.randomUUID(), String(lastWeek), p.uid, p.amount, `Pi Oasis weekly prize #${i + 1}`, now, now)
      );
      stmts.push(env.DB.prepare("UPDATE weeks SET paid = 1 WHERE id = ?").bind(lastWeek));
      await env.DB.batch(stmts);
    }
  }

  // 3) Referral withdrawals waiting
  const wd = await d.all(env, "SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY created_at LIMIT 20");
  for (const x of wd) {
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO payouts (id, kind, ref, uid, amount, memo, status, created_at, updated_at) VALUES (?, 'withdraw', ?, ?, ?, 'Pi Oasis referral rewards', 'new', ?, ?)")
        .bind(crypto.randomUUID(), x.id, x.uid, x.amount, now, now),
      env.DB.prepare("UPDATE withdrawals SET status = 'processing' WHERE id = ?").bind(x.id),
    ]);
  }

  // 4) Send
  const todo = await d.all(env, "SELECT * FROM payouts WHERE status IN ('new', 'created') ORDER BY created_at LIMIT ?", PER_RUN);
  for (const po of todo) {
    try {
      let p;
      if (!po.pi_payment_id) {
        // Create the Pi payment and save its id before sending anything
        p = await d.pi(env, "/payments", {
          method: "POST",
          body: { payment: { amount: po.amount, memo: po.memo, metadata: { kind: po.kind, ref: po.ref }, uid: po.uid } },
        });
        await d.run(env, "UPDATE payouts SET pi_payment_id = ?, status = 'created', updated_at = ? WHERE id = ?", p.identifier, Date.now(), po.id);
        report.created++;
      } else {
        p = await d.pi(env, `/payments/${encodeURIComponent(po.pi_payment_id)}`);
      }
      await finishPayment(env, d, p, appAddress);
      report.completed++;
    } catch (e) {
      report.failed++;
      await failPayout(env, d, po, e);
    }
  }
  return report;
}

// Sends the blockchain transaction (if not already sent) and completes the Pi payment
async function finishPayment(env, d, p, appAddress) {
  if (p.status?.developer_completed) return markDone(env, d, p.identifier, p.transaction?.txid);
  if (p.status?.cancelled) {
    await d.run(env, "UPDATE payouts SET status = 'failed', error = 'cancelled by Pi', updated_at = ? WHERE pi_payment_id = ?", Date.now(), p.identifier);
    return;
  }
  if (p.from_address && p.from_address !== appAddress) throw new Error("PI_WALLET_SEED does not match the app wallet");
  if (Number(p.amount) <= 0) throw new Error("bad amount");
  let txid = p.transaction?.txid || (await findTxByMemo(p.network, appAddress, p.identifier));
  if (!txid) {
    txid = await sendPi({ seed: env.PI_WALLET_SEED, from: appAddress, to: p.to_address, amount: p.amount, memo: p.identifier, network: p.network });
  }
  await d.run(env, "UPDATE payouts SET txid = ?, status = 'sent', updated_at = ? WHERE pi_payment_id = ?", txid, Date.now(), p.identifier);
  await d.pi(env, `/payments/${encodeURIComponent(p.identifier)}/complete`, { method: "POST", body: { txid } });
  await markDone(env, d, p.identifier, txid);
}

async function markDone(env, d, piPaymentId, txid) {
  const po = await d.one(env, "SELECT * FROM payouts WHERE pi_payment_id = ?", piPaymentId);
  await d.run(env, "UPDATE payouts SET status = 'completed', txid = COALESCE(?, txid), updated_at = ? WHERE pi_payment_id = ?", txid || null, Date.now(), piPaymentId);
  if (po && po.kind === "withdraw") await d.run(env, "UPDATE withdrawals SET status = 'paid' WHERE id = ?", po.ref);
}

// Looks for an already-submitted transaction whose memo is this Pi payment id
async function findTxByMemo(network, address, memo) {
  const horizon = HORIZON[network];
  if (!horizon) return null;
  const r = await fetch(`${horizon}/accounts/${address}/transactions?order=desc&limit=50`);
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  const hit = (data._embedded?.records || []).find((t) => t.memo === memo && t.successful !== false);
  return hit ? hit.hash : null;
}

async function failPayout(env, d, po, e) {
  const msg = String((e && e.message) || e).slice(0, 300);
  await d.logError(env, `payout ${po.kind} ${po.amount} Pi`, 0, msg);
  // Created but nothing sent yet: retry next run. Not even created after 3 tries: give up.
  const tries = (po.tries || 0) + 1;
  const giveUp = !po.pi_payment_id && tries >= 3;
  await d.run(env, "UPDATE payouts SET tries = ?, error = ?, status = ?, updated_at = ? WHERE id = ?", tries, msg, giveUp ? "failed" : po.status, Date.now(), po.id);
  if (giveUp && po.kind === "withdraw") {
    // Give the referral balance back so the player can try again later
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET ref_balance = ROUND(ref_balance + ?, 7) WHERE uid = ?").bind(po.amount, po.uid),
      env.DB.prepare("UPDATE withdrawals SET status = 'failed' WHERE id = ?").bind(po.ref),
    ]);
  }
}
