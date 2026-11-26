// Tests de la version de démonstration : node test/demo.test.mjs (après node build.mjs)
import { start } from "./server.mjs";
import { D1, R2 } from "./env.mjs";
import worker from "../dist/worker.js";

const { server, env } = await start(8796);
const B = "http://localhost:8796";
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log("ÉCHEC:", m); } };
class Agent {
  constructor() { this.cookie = ""; }
  async req(method, path, body, headers = {}) {
    const h = { "X-Requested-With": "terrain", ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let b = body;
    if (body && !(body instanceof Uint8Array) && typeof body !== "string") { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const r = await fetch(B + path, { method, headers: h, body: b });
    for (const c of r.headers.getSetCookie?.() || []) { const v = c.split(";")[0]; if (v.startsWith("tr_session=")) this.cookie = v; }
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, data: ct.includes("json") ? await r.json() : null };
  }
}

// 1) sans démo : l'adresse normale utilise la vraie base, vide
let r = await new Agent().req("GET", "/api/status");
ok(r.data.setup_needed === true && !r.data.demo, "adresse normale : pas de démo");

// 2) avec les liaisons démo + adresse démo
env.DEMO_DB = new D1(); env.DEMO_MEDIA = new R2(); env.FORCE_DEMO = "1";
r = await new Agent().req("GET", "/api/status");
ok(r.data.setup_needed === false && r.data.demo && r.data.demo.accounts.length === 2, "démo : comptes proposés " + JSON.stringify(r.data));
ok(r.data.settings.demo === true && r.data.settings.company === "Démo Distribution SARL", "démo : réglages");
ok(env.DB.db.prepare("SELECT COUNT(*) n FROM users").get().n === 0, "la vraie base n'est pas touchée");

const dir = new Agent(), com = new Agent();
r = await dir.req("POST", "/api/auth/login", { login: "direction", password: "demo2026" });
ok(r.status === 200 && r.data.user.role === "admin", "connexion direction");
r = await com.req("POST", "/api/auth/login", { login: "commercial", password: "demo2026" });
ok(r.status === 200 && r.data.user.role === "commercial" && !r.data.user.must_change, "connexion commercial");

r = await dir.req("GET", "/api/sync");
ok(r.data.clients.length === 24, "24 fiches pour la direction : " + r.data.clients.length);
ok(r.data.visits.length > 25, "historique de visites : " + r.data.visits.length);
ok(r.data.visits.some((v) => v.status === "planned"), "rendez-vous prévus");
const s2 = await com.req("GET", "/api/sync");
ok(s2.data.clients.length === 8 && s2.data.clients.every((c) => c.owner_id === "demo-u-com"), "le commercial voit son portefeuille (8) : " + s2.data.clients.length);
r = await dir.req("GET", "/api/stats");
ok(r.status === 200 && r.data.totals.clients > 10 && r.data.totals.visits_30 > 20, "tableau de bord rempli " + JSON.stringify(r.data.totals));
r = await dir.req("GET", "/api/export/clients.xlsx");
ok(r.status === 200, "export Excel");

// le commercial travaille normalement
const cid = crypto.randomUUID();
r = await com.req("PUT", "/api/clients/" + cid, { name: "Nouveau prospect démo", kind: "prospect", city: "Mohammedia" });
ok(r.status === 201 || r.status === 200, "création de fiche " + r.status);
ok(r.data.client.code === "PR-00010", "code suivant : " + r.data.client.code);
r = await com.req("PUT", "/api/files/" + crypto.randomUUID(), new Uint8Array(1000), { "Content-Type": "image/jpeg", "X-Client-Id": cid, "X-File-Name": "photo.jpg", "X-Category": "photo" });
ok(r.status === 201, "petite photo acceptée " + r.status);
r = await com.req("POST", "/api/files/mp", { id: crypto.randomUUID(), client_id: cid, mime: "video/mp4", name: "v.mp4" });
ok(r.status === 413, "gros fichiers refusés en démo");

// protections des comptes de démo
r = await com.req("POST", "/api/me/password", { current: "demo2026", password: "autre-mot-de-passe" });
ok(r.status === 403, "mot de passe démo non modifiable");
r = await dir.req("PATCH", "/api/users/demo-u-com", { active: false });
ok(r.status === 403, "compte commercial démo non désactivable");
r = await dir.req("POST", "/api/users/demo-u-com/password");
ok(r.status === 403, "pas de nouveau mot de passe pour le compte démo");
r = await dir.req("PATCH", "/api/users/demo-u-com", { perms: { scope: "all", export: true } });
ok(r.status === 200, "les droits restent modifiables (pour essayer)");
r = await dir.req("PATCH", "/api/users/demo-u-sal", { active: false });
ok(r.status === 200, "les autres commerciaux fictifs peuvent être désactivés");
r = await dir.req("POST", "/api/setup", { login: "x", password: "12345678", name: "xx" });
ok(r.status === 403, "pas de mise en service sur la démo");

// remise à zéro nocturne
const pending = [];
await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) });
await Promise.all(pending);
ok(env.DEMO_MEDIA.m.size === 0, "fichiers de la journée supprimés");
const dem = env.DEMO_DB.db;
ok(dem.prepare("SELECT COUNT(*) n FROM clients").get().n === 24, "24 fiches après remise à zéro");
ok(dem.prepare("SELECT active FROM users WHERE id='demo-u-sal'").get().active === 1, "comptes réactivés");
ok(dem.prepare("SELECT perms FROM users WHERE id='demo-u-com'").get().perms.includes('"own"'), "droits d'origine");
r = await dir.req("GET", "/api/me");
ok(r.status === 401, "sessions de la veille fermées");
r = await new Agent().req("POST", "/api/auth/login", { login: "commercial", password: "demo2026" });
ok(r.status === 200, "connexion possible après remise à zéro");

console.log(`${pass} réussis, ${failN} échoués`);
server.close();
process.exit(failN ? 1 : 0);
