// Pi Oasis – السيرفر (backend)
// كيدير: الدخول بحساب Pi، تأكيد الخلاص ديال VIP، الإحالة 10%، الترتيب الأسبوعي.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");

// قراءة ملف .env (بلا مكتبات خارجية)
try {
  for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = process.env.PORT || 3000;
const PI_API = "https://api.minepi.com/v2";
const PI_API_KEY = process.env.PI_API_KEY || ""; // من Developer Portal. ماتحطوش فالكود!
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const DB_FILE = process.env.DB_FILE || path.join(__dirname, "data.json");

const VIP_PRICE = 0.25;
const VIP_DAYS = 30;
const REFERRAL_RATE = 0.1; // 10% على كل تجديد شهري
const PRIZE_RATE = 0.15; // 15% كتمشي للجائزة الأسبوعية
const MIN_WITHDRAW = 1;
const MAX_WEEK_SCORE = 500000; // حد أقصى معقول ضد الغش البسيط

// ---------- قاعدة البيانات (ملف JSON بسيط، كافي للبداية) ----------
let db = { users: {}, sessions: {}, payments: {}, weeks: {}, withdrawals: [] };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, "utf8"))); } catch {}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db));
    fs.renameSync(DB_FILE + ".tmp", DB_FILE);
  }, 200);
}

function weekId(t = Date.now()) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7;
  return String(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}
function week(id = weekId()) {
  return (db.weeks[id] ||= { prizePool: 0, scores: {}, paid: false });
}
const round = (n) => Math.round(n * 1e7) / 1e7;

function publicAccount(u) {
  return {
    username: u.username,
    vipUntil: u.vipUntil || 0,
    referralBalance: u.referralBalance || 0,
    referralCount: Object.values(db.users).filter((x) => x.referrer === u.uid).length,
  };
}

// ---------- Pi API ----------
async function piFetch(p, { method = "GET", body, userToken } = {}) {
  const r = await fetch(PI_API + p, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: userToken ? `Bearer ${userToken}` : `Key ${PI_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error("Pi API error"), { status: r.status, data });
  return data;
}

// ---------- التطبيق ----------
// راوتر صغير بحال Express، بلا مكتبات خارجية
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const routes = [];
const app = {
  get: (p, ...h) => routes.push({ m: "GET", p, h }),
  post: (p, ...h) => routes.push({ m: "POST", p, h }),
  listen: (port, cb) => http.createServer(handle).listen(port, cb),
};
function handle(rq, rs) {
  const url = new URL(rq.url, "http://x");
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json(o) { rs.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" }); rs.end(JSON.stringify(o)); },
  };
  const route = routes.find((r) => r.m === rq.method && r.p === url.pathname);
  if (!route) {
    if (rq.method !== "GET") return res.status(404).json({ error: "not found" });
    const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC_DIR)) return res.status(403).json({ error: "forbidden" });
    return fs.readFile(file, (err, buf) => {
      if (err) return res.status(404).json({ error: "not found" });
      rs.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      rs.end(buf);
    });
  }
  let size = 0; const chunks = [];
  rq.on("data", (c) => { size += c.length; if (size > 50000) rq.destroy(); else chunks.push(c); });
  rq.on("end", () => {
    const req = { headers: rq.headers, body: {} };
    try { if (chunks.length) req.body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return res.status(400).json({ error: "bad json" }); }
    const run = (i) => route.h[i] && route.h[i](req, res, () => run(i + 1));
    run(0);
  });
}

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e.message, e.data || "");
    res.status(e.public ? 400 : 500).json({ error: e.public || "server" });
  });
const fail = (msg) => Object.assign(new Error(msg), { public: msg, status: 400 });

function auth(req, res, next) {
  const tok = (req.headers.authorization || "").replace(/^Bearer /, "");
  const uid = db.sessions[tok];
  if (!uid || !db.users[uid]) return res.status(401).json({ error: "session" });
  req.user = db.users[uid];
  next();
}

// الدخول: كنتأكدو من التوكن عند Pi
app.post("/api/auth", wrap(async (req, res) => {
  const { accessToken, ref } = req.body || {};
  if (!accessToken) throw fail("session");
  const me = await piFetch("/me", { userToken: accessToken });
  let u = db.users[me.uid];
  if (!u) {
    u = db.users[me.uid] = { uid: me.uid, username: me.username, createdAt: Date.now(), vipUntil: 0, referralBalance: 0 };
    // الإحالة: غير للحسابات الجداد، ماشي راسك، ومستوى واحد فقط
    if (ref && ref !== me.username) {
      const referrer = Object.values(db.users).find((x) => x.username === ref);
      if (referrer) u.referrer = referrer.uid;
    }
  }
  u.username = me.username;
  const session = crypto.randomBytes(24).toString("hex");
  db.sessions[session] = u.uid;
  save();
  res.json({ session, user: { username: u.username, uid: u.uid }, account: publicAccount(u) });
}));

app.get("/api/me", auth, (req, res) => res.json({ account: publicAccount(req.user) }));

// ---------- الخلاص (User → App) ----------
app.post("/api/payments/approve", auth, wrap(async (req, res) => {
  const { paymentId } = req.body || {};
  const p = await piFetch(`/payments/${encodeURIComponent(paymentId)}`);
  if (p.user_uid !== req.user.uid) throw fail("notYours");
  if (Number(p.amount) !== VIP_PRICE || p.metadata?.type !== "vip_month") throw fail("badPayment");
  await piFetch(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: "POST" });
  db.payments[paymentId] ||= { uid: req.user.uid, amount: VIP_PRICE, status: "approved", at: Date.now() };
  save();
  res.json({ ok: true });
}));

async function completePayment(paymentId, txid) {
  const p = await piFetch(`/payments/${encodeURIComponent(paymentId)}`);
  if (Number(p.amount) !== VIP_PRICE || p.metadata?.type !== "vip_month") throw fail("badPayment");
  if (!p.status?.developer_completed) {
    await piFetch(`/payments/${encodeURIComponent(paymentId)}/complete`, { method: "POST", body: { txid } });
  }
  const rec = (db.payments[paymentId] ||= { uid: p.user_uid, amount: VIP_PRICE, at: Date.now() });
  if (rec.status === "completed") return db.users[p.user_uid]; // ما نحسبوش جوج مرات
  rec.status = "completed";
  rec.txid = txid;

  const u = db.users[p.user_uid];
  if (u) {
    u.vipUntil = Math.max(u.vipUntil || 0, Date.now()) + VIP_DAYS * 86400000;
    // 10% للي جابو، على كل تجديد شهري
    const referrer = u.referrer && db.users[u.referrer];
    if (referrer) {
      referrer.referralBalance = round((referrer.referralBalance || 0) + VIP_PRICE * REFERRAL_RATE);
      rec.referralPaidTo = referrer.uid;
    }
  }
  const w = week();
  w.prizePool = round(w.prizePool + VIP_PRICE * PRIZE_RATE);
  save();
  return u;
}

app.post("/api/payments/complete", auth, wrap(async (req, res) => {
  const { paymentId, txid } = req.body || {};
  if (!paymentId || !txid) throw fail("badPayment");
  const u = await completePayment(paymentId, txid);
  res.json({ ok: true, account: publicAccount(u || req.user) });
}));

// خلاص ما كملش من قبل
app.post("/api/payments/incomplete", wrap(async (req, res) => {
  const payment = req.body?.payment;
  const txid = payment?.transaction?.txid;
  if (!payment?.identifier || !txid) return res.json({ ok: false });
  await completePayment(payment.identifier, txid);
  res.json({ ok: true });
}));

// ---------- الترتيب الأسبوعي ----------
app.post("/api/score", auth, (req, res) => {
  const s = Math.floor(Number(req.body?.weekScore));
  if (!(s >= 0 && s <= MAX_WEEK_SCORE)) return res.status(400).json({ error: "badScore" });
  const w = week();
  w.scores[req.user.uid] = Math.max(w.scores[req.user.uid] || 0, s);
  save();
  res.json({ ok: true });
});

app.get("/api/leaderboard", (req, res) => {
  const w = week();
  const top = Object.entries(w.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([uid, score]) => ({ username: db.users[uid]?.username || "?", score }));
  res.json({ prizePool: w.prizePool, top });
});

// ---------- الإحالة ----------
app.post("/api/referral/redeem-vip", auth, (req, res) => {
  const u = req.user;
  if ((u.referralBalance || 0) < VIP_PRICE) return res.status(400).json({ error: "needVipBalance" });
  u.referralBalance = round(u.referralBalance - VIP_PRICE);
  u.vipUntil = Math.max(u.vipUntil || 0, Date.now()) + VIP_DAYS * 86400000;
  save();
  res.json({ account: publicAccount(u) });
});

app.post("/api/referral/withdraw", auth, (req, res) => {
  const u = req.user;
  const amount = u.referralBalance || 0;
  if (amount < MIN_WITHDRAW) return res.status(400).json({ error: "minWithdraw" });
  if (db.withdrawals.some((w) => w.uid === u.uid && w.status === "pending"))
    return res.status(400).json({ error: "pendingWithdraw" });
  u.referralBalance = 0;
  db.withdrawals.push({ id: crypto.randomUUID(), uid: u.uid, username: u.username, amount: round(amount), status: "pending", at: Date.now() });
  save();
  res.json({ account: publicAccount(u), amount: round(amount) });
});

// ---------- الإدارة ----------
function admin(req, res, next) {
  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) return res.status(403).json({ error: "forbidden" });
  next();
}
// الطلبات لي خاصها تخلص (سحب الإحالة + الجوائز ديال السيمانة لي فاتت)
app.get("/api/admin/payouts", admin, (req, res) => {
  const lastWeek = weekId(Date.now() - 7 * 86400000);
  const w = db.weeks[lastWeek];
  const winners = w
    ? Object.entries(w.scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([uid, score], i) => ({
        uid, username: db.users[uid]?.username, score,
        prize: round(w.prizePool * [0.5, 0.3, 0.2][i]),
      }))
    : [];
  res.json({ withdrawals: db.withdrawals.filter((x) => x.status === "pending"), lastWeek: { id: lastWeek, prizePool: w?.prizePool || 0, paid: !!w?.paid, winners } });
});

app.listen(PORT, () => {
  console.log(`🌴 Pi Oasis running on http://localhost:${PORT}`);
  if (!PI_API_KEY) console.warn("⚠️  PI_API_KEY is not set – payments will not work");
});
