// Local test harness: runs the Worker with SQLite as D1 and a fake Pi API.
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { generateKeyPairSync, createPublicKey, verify as edVerify, createHash } from "node:crypto";
import { encodeStrKey, decodeStrKey } from "../src/stellar.js";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const db = new DatabaseSync(":memory:");
// empty DB: worker must create tables
const stmt = (sql, p = []) => ({
  bind: (...b) => stmt(sql, b),
  first: async () => db.prepare(sql).get(...p) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...p) }),
  run: async () => { const r = db.prepare(sql).run(...p); return { meta: { changes: Number(r.changes) } }; },
});
const DB = { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const ASSETS = { fetch: async (req) => {
  let p = new URL(req.url).pathname; if (p === "/") p = "/index.html";
  try { return new Response(fs.readFileSync(path.join(ROOT, "public", p)), { headers: { "Content-Type": MIME[path.extname(p)] || "text/plain" } }); }
  catch { return new Response("nf", { status: 404 }); }
} };
// Fake Pi API
const users = { tokA: { uid: "uA", username: "alice" }, tokB: { uid: "uB", username: "bob" } };
const payments = {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.includes("piappengine.com/pi/auth/v1/login")) {
    const t = JSON.parse(opt.body).accessToken;
    globalThis.__studioCalls = (globalThis.__studioCalls || 0) + 1;
    return users[t] ? new Response(JSON.stringify({ sessionToken: "st", user: users[t] })) : new Response("{}", { status: 401 });
  }
  if (u.startsWith("https://api.testnet.minepi.com")) return horizon(u, opt);
  if (u.startsWith("https://api.minepi.com/v2/payments") && (opt.headers?.Authorization) === "Key TESTKEY") {
    const p2 = u.slice("https://api.minepi.com/v2".length);
    const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
    if (p2 === "/payments" && opt.method === "POST") {
      const b = JSON.parse(opt.body).payment;
      if (!["uA", "uB", "uC", "uA2"].includes(b.uid)) return J({ error_message: "user not found" }, 400);
      const id = "a2u" + ++a2uN;
      a2u[id] = { identifier: id, user_uid: b.uid, amount: b.amount, memo: b.memo, metadata: b.metadata, direction: "app_to_user",
        from_address: APP.G, to_address: walletOf(b.uid), network: "Pi Testnet", status: { developer_completed: false, cancelled: false }, transaction: null };
      return J(a2u[id]);
    }
    if (p2 === "/payments/incomplete_server_payments") return J({ incomplete_server_payments: Object.values(a2u).filter((x) => !x.status.developer_completed) });
    let m2;
    if ((m2 = p2.match(/^\/payments\/(a2u\d+)$/))) return J(a2u[m2[1]]);
    if ((m2 = p2.match(/^\/payments\/(a2u\d+)\/complete$/))) { const x = a2u[m2[1]]; x.status.developer_completed = true; x.transaction = { txid: JSON.parse(opt.body).txid }; return J(x); }
  }
  if (u.endsWith("/v2/me")) {
    const t = (opt.headers?.Authorization || "").replace("Bearer ", "");
    const devApp = { tokC: { uid: "uC", username: "carol" }, tokA2: { uid: "uA2", username: "alice" } };
    return devApp[t] ? new Response(JSON.stringify(devApp[t])) : new Response("{}", { status: 401 });
  }
  if (!u.startsWith("https://api.minepi.com/v2")) return realFetch(url, opt);
  const p = u.slice("https://api.minepi.com/v2".length);
  const auth = opt.headers.Authorization;
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  if (p === "/me") { const t = auth.replace("Bearer ", ""); return users[t] ? J(users[t]) : J({}, 401); }
  if (auth !== "Key TESTKEY") return J({}, 401);
  let m;
  if ((m = p.match(/^\/payments\/([^/]+)$/))) return payments[m[1]] ? J(payments[m[1]]) : J({}, 404);
  if ((m = p.match(/^\/payments\/([^/]+)\/approve$/))) { payments[m[1]].status.developer_approved = true; return J(payments[m[1]]); }
  if ((m = p.match(/^\/payments\/([^/]+)\/complete$/))) { globalThis.__completes = (globalThis.__completes||0)+1; payments[m[1]].status.developer_completed = true; return J(payments[m[1]]); }
  if ((m = p.match(/^\/ads_network\/status\/(.+)$/))) return J({ mediator_ack_status: m[1].startsWith("good") ? "granted" : "failed" });
  return J({}, 404);
};
globalThis.__payments = payments;

// ---- Fake app wallet, user wallets and Pi blockchain (Horizon) ----
const kp = () => { const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return { pub: publicKey, S: encodeStrKey(privateKey.export({ type: "pkcs8", format: "der" }).slice(-32), "S"),
           G: encodeStrKey(publicKey.export({ type: "spki", format: "der" }).slice(-32), "G") }; };
const APP = kp();
const wallets = {}; const walletOf = (uid) => (wallets[uid] ||= kp().G);
const chain = { seq: 1000n, txs: [], dropNextResponse: false };
const a2u = {}; let a2uN = 0;
globalThis.__chain = chain;
function readEnvelope(b64) {
  const b = Buffer.from(b64, "base64"); let o = 0;
  const i32 = () => { const v = b.readInt32BE(o); o += 4; return v; };
  const u32 = () => { const v = b.readUInt32BE(o); o += 4; return v; };
  const i64 = () => { const v = b.readBigInt64BE(o); o += 8; return v; };
  const raw = (n) => { const v = b.subarray(o, o + n); o += n; return v; };
  if (i32() !== 2) throw new Error("envelope type");
  const txStart = o;
  i32(); const src = raw(32); u32(); const seq = i64(); i32(); raw(16);
  i32(); const ml = u32(); const memo = raw(ml).toString(); raw((4 - ml % 4) % 4);
  u32(); u32(); i32(); i32(); const dest = raw(32); i32(); const amount = i64(); i32();
  const tx = b.subarray(txStart, o);
  u32(); raw(4); u32(); const sig = raw(64);
  const netId = createHash("sha256").update("Pi Testnet").digest();
  const hash = createHash("sha256").update(Buffer.concat([netId, Buffer.from([0, 0, 0, 2]), tx])).digest();
  const pubKey = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), src]), format: "der", type: "spki" });
  if (!edVerify(null, hash, pubKey, sig)) throw new Error("bad signature");
  return { from: encodeStrKey(src, "G"), to: encodeStrKey(dest, "G"), seq, memo, amount, hash: hash.toString("hex") };
}
async function horizon(u, opt) {
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const p = u.replace("https://api.testnet.minepi.com", "");
  if (p === `/accounts/${APP.G}`) return J({ sequence: String(chain.seq) });
  if (p === "/fee_stats") return J({ last_ledger_base_fee: "100000" });
  if (p.startsWith(`/accounts/${APP.G}/transactions`)) return J({ _embedded: { records: chain.txs.map((t) => ({ hash: t.hash, memo: t.memo, successful: true })).reverse() } });
  if (p === "/transactions" && opt.method === "POST") {
    let t; try { t = readEnvelope(decodeURIComponent(String(opt.body).slice(3))); } catch (e) { return J({ title: e.message }, 400); }
    if (t.seq !== chain.seq + 1n) return J({ extras: { result_codes: { transaction: "tx_bad_seq" } } }, 400);
    if (t.from !== APP.G) return J({ title: "wrong source" }, 400);
    chain.seq += 1n; chain.txs.push(t);
    if (chain.dropNextResponse) { chain.dropNextResponse = false; return J({ title: "timeout" }, 504); }
    return J({ hash: t.hash });
  }
  return J({}, 404);
}
const worker = (await import(ROOT + "/src/worker.js")).default;
const env = { DB, ASSETS, PI_NETWORK_API_KEY: "TESTKEY", ADMIN_TOKEN: "adm", PI_WALLET_SEED: APP.S };
http.createServer(async (rq, rs) => {
  const chunks = []; for await (const c of rq) chunks.push(c);
  const req = new Request("http://localhost:3457" + rq.url, { method: rq.method, headers: rq.headers, body: rq.method === "POST" ? Buffer.concat(chunks) : undefined });
  if (rq.url === "/__test/pay") { const b = JSON.parse(Buffer.concat(chunks)); payments[b.id] = { identifier: b.id, user_uid: b.uid, amount: b.amount, direction: b.direction || "user_to_app", metadata: { type: b.type || "vip_month" }, status: { cancelled: !!b.cancelled }, transaction: b.txid ? { txid: b.txid } : null }; rs.end("ok"); return; }
  if (rq.url === "/__test/chain") { rs.end(JSON.stringify({ txs: chain.txs.map((t) => ({ ...t, seq: String(t.seq), amount: String(t.amount) })), wallets, a2u })); return; }
  if (rq.url === "/__test/drop-next") { chain.dropNextResponse = true; rs.end("ok"); return; }
  if (rq.url === "/__test/cron") { const w = []; await worker.scheduled({}, env, { waitUntil: (p) => w.push(p) }); await Promise.all(w); rs.end("ok"); return; }
  if (rq.url === "/__test/completes") { rs.end(String(globalThis.__completes || 0)); return; }
  if (rq.url === "/__test/calls") { rs.end(String(globalThis.__studioCalls || 0)); return; }
  if (rq.url === "/__test/exec") { db.exec(Buffer.concat(chunks).toString()); rs.end("ok"); return; }
  if (rq.url === "/__test/sql") { rs.end(JSON.stringify(db.prepare(Buffer.concat(chunks).toString()).all())); return; }
  const res = await worker.fetch(req, env);
  rs.writeHead(res.status, Object.fromEntries(res.headers)); rs.end(Buffer.from(await res.arrayBuffer()));
}).listen(3457, () => console.log("harness up"));
