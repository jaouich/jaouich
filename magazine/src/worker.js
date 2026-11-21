// Jerry Magazine API: comments, weekly topic votes and newsletter sign-ups on D1. Everything else is static.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS comments ( id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, name TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, who TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0 )",
  "CREATE INDEX IF NOT EXISTS comments_slug ON comments(slug, id)",
  "CREATE INDEX IF NOT EXISTS comments_who ON comments(who, at)",
  "CREATE TABLE IF NOT EXISTS votes ( week TEXT NOT NULL, who TEXT NOT NULL, topic TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (week, who) )",
  "CREATE TABLE IF NOT EXISTS subscribers ( email TEXT PRIMARY KEY, at INTEGER NOT NULL, who TEXT NOT NULL )",
  "CREATE INDEX IF NOT EXISTS subs_who ON subscribers(who, at)",
];
const SCHEMA_V = (() => { let h = 5381; for (const c of SCHEMA.join("|")) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return "m" + h; })();
let ready = null;
const ensureSchema = (env) => (ready ||= (async () => {
  try { const r = await env.DB.prepare("SELECT v FROM schema_meta LIMIT 1").first(); if (r && r.v === SCHEMA_V) return; } catch (e) { /* first run */ }
  await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
  await env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS schema_meta ( v TEXT NOT NULL )"), env.DB.prepare("DELETE FROM schema_meta"), env.DB.prepare("INSERT INTO schema_meta (v) VALUES (?)").bind(SCHEMA_V)]);
})().catch((e) => { ready = null; throw e; }));

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const bad = (error, s = 400) => json({ error }, s);
async function who(req, env) { // anonymous, salted fingerprint of the connection: only used against spam
  const ip = req.headers.get("CF-Connecting-IP") || "0";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + (env.HASH_SALT || "jerry-magazine")));
  return [...new Uint8Array(d)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const LINK = /https?:\/\/|www\.|t\.me\/|wa\.me\/|bit\.ly|[a-z0-9-]+\.(com|net|org|io|xyz|ru|top|site|online|me)\b/i;
const SLUG = /^[a-z0-9-]{3,90}$/;

const routes = {
  "GET /api/comments": async (req, env) => {
    const slug = new URL(req.url).searchParams.get("slug") || "";
    if (!SLUG.test(slug)) return bad("slug");
    const r = await env.DB.prepare("SELECT name, text, at FROM comments WHERE slug = ? AND hidden = 0 ORDER BY id DESC LIMIT 100").bind(slug).all();
    return json({ comments: r.results.reverse() });
  },
  "POST /api/comment": async (req, env, body) => {
    const slug = String(body.slug || ""), text = String(body.text || "").replace(/\s+/g, " ").trim(), name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (!SLUG.test(slug)) return bad("slug");
    if (!text) return bad("empty");
    if (text.length > 500) return bad("long");
    if (LINK.test(text) || LINK.test(name)) return bad("links");
    const now = Date.now(), w = await who(req, env);
    const last = await env.DB.prepare("SELECT COUNT(*) AS n, MAX(at) AS last FROM comments WHERE who = ? AND at > ?").bind(w, now - 3600000).first();
    if ((last.last && now - last.last < 20000) || last.n >= 10) return bad("fast", 429);
    const dup = await env.DB.prepare("SELECT 1 AS x FROM comments WHERE who = ? AND slug = ? AND text = ?").bind(w, slug, text).first();
    if (dup) return bad("fast", 429);
    await env.DB.prepare("INSERT INTO comments (slug, name, text, at, who) VALUES (?, ?, ?, ?, ?)").bind(slug, name, text, now, w).run();
    return json({ ok: true });
  },
  "GET /api/votes": async (req, env) => {
    const week = new URL(req.url).searchParams.get("week") || "";
    if (!/^\d{4}-W\d{2}$/.test(week)) return bad("week");
    const r = await env.DB.prepare("SELECT topic, COUNT(*) AS n FROM votes WHERE week = ? GROUP BY topic").bind(week).all();
    return json({ counts: Object.fromEntries(r.results.map((x) => [x.topic, x.n])) });
  },
  "POST /api/vote": async (req, env, body) => {
    const week = String(body.week || ""), topic = String(body.topic || "");
    if (!/^\d{4}-W\d{2}$/.test(week) || !/^[a-z0-9-]{2,30}$/.test(topic)) return bad("slug");
    const w = await who(req, env);
    await env.DB.prepare("INSERT INTO votes (week, who, topic, at) VALUES (?, ?, ?, ?) ON CONFLICT(week, who) DO UPDATE SET topic = excluded.topic, at = excluded.at").bind(week, w, topic, Date.now()).run();
    const r = await env.DB.prepare("SELECT topic, COUNT(*) AS n FROM votes WHERE week = ? GROUP BY topic").bind(week).all();
    return json({ ok: true, counts: Object.fromEntries(r.results.map((x) => [x.topic, x.n])) });
  },
  "POST /api/subscribe": async (req, env, body) => {
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return bad("email");
    const now = Date.now(), w = await who(req, env);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE who = ? AND at > ?").bind(w, now - 3600000).first();
    if (recent.n >= 5) return bad("fast", 429);
    await env.DB.prepare("INSERT OR IGNORE INTO subscribers (email, at, who) VALUES (?, ?, ?)").bind(email, now, w).run();
    return json({ ok: true });
  },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url), h = routes[`${req.method} ${url.pathname}`];
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (!h) return bad("notFound", 404);
    try {
      let body = {};
      if (req.method === "POST") { const t = await req.text(); if (t.length > 4000) return bad("long", 413); try { body = t ? JSON.parse(t) : {}; } catch { return bad("badJson"); } }
      await ensureSchema(env);
      return await h(req, env, body);
    } catch (e) {
      if (/exceeded|row read limit|too many requests/i.test((e && e.message) || "")) return bad("busy", 503);
      console.error(e && e.stack);
      return bad("server", 500);
    }
  },
};
