// Local test harness: runs the Worker with SQLite as D1 and a fake Pi API.
import { DatabaseSync } from "node:sqlite";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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
  if (u.endsWith("/v2/me")) throw new Error("must not call /v2/me");
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
const worker = (await import(ROOT + "/src/worker.js")).default;
const env = { DB, ASSETS, PI_NETWORK_API_KEY: "TESTKEY", ADMIN_TOKEN: "adm" };
http.createServer(async (rq, rs) => {
  const chunks = []; for await (const c of rq) chunks.push(c);
  const req = new Request("http://localhost:3457" + rq.url, { method: rq.method, headers: rq.headers, body: rq.method === "POST" ? Buffer.concat(chunks) : undefined });
  if (rq.url === "/__test/pay") { const b = JSON.parse(Buffer.concat(chunks)); payments[b.id] = { identifier: b.id, user_uid: b.uid, amount: b.amount, direction: b.direction || "user_to_app", metadata: { type: b.type || "vip_month" }, status: { cancelled: !!b.cancelled }, transaction: b.txid ? { txid: b.txid } : null }; rs.end("ok"); return; }
  if (rq.url === "/__test/completes") { rs.end(String(globalThis.__completes || 0)); return; }
  if (rq.url === "/__test/calls") { rs.end(String(globalThis.__studioCalls || 0)); return; }
  if (rq.url === "/__test/sql") { rs.end(JSON.stringify(db.prepare(Buffer.concat(chunks).toString()).all())); return; }
  const res = await worker.fetch(req, env);
  rs.writeHead(res.status, Object.fromEntries(res.headers)); rs.end(Buffer.from(await res.arrayBuffer()));
}).listen(3457, () => console.log("harness up"));
