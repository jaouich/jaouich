// Tests du serveur : node test/api.test.mjs (après node build.mjs)
import { start } from "./server.mjs";

const { server, env } = await start(8790);
const B = "http://localhost:8790";
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) { pass++; } else { failN++; console.log("ÉCHEC:", m); } };

class Agent {
  constructor() { this.cookie = ""; }
  async req(method, path, body, headers = {}) {
    const h = { "X-Requested-With": "terrain", ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let b = body;
    if (body && !(body instanceof Uint8Array) && typeof body !== "string") { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const r = await fetch(B + path, { method, headers: h, body: b });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const v = c.split(";")[0]; if (v.startsWith("tr_session=")) this.cookie = v; }
    const ct = r.headers.get("content-type") || "";
    const data = ct.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  }
}
const uuid = () => crypto.randomUUID();

const admin = new Agent(), a1 = new Agent(), a2 = new Agent();
let r = await admin.req("GET", "/api/status");
ok(r.data.setup_needed === true, "setup nécessaire au départ");
env.DB.db.prepare("INSERT INTO settings (k,v) VALUES ('setup_code','ABC123')").run();
r = await admin.req("GET", "/api/status");
ok(r.data.setup_code === true, "code de mise en service demandé");
r = await admin.req("POST", "/api/setup", { setup_code: "MAUVAIS", name: "Directeur", login: "directeur", password: "motdepasse1" });
ok(r.status === 403, "mauvais code refusé");
r = await admin.req("POST", "/api/setup", { setup_code: "abc123", name: "Directeur", login: "directeur", password: "motdepasse1", company: "Magiscom Tech" });
ok(r.status === 201 && r.data.user.role === "admin", "création admin");
const recovery1 = r.data.recovery_code;
ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(recovery1 || ""), "code de secours donné à la mise en service");
r = await new Agent().req("POST", "/api/setup", { name: "X", login: "pirate", password: "motdepasse1" });
ok(r.status === 403, "setup refusé ensuite");
r = await admin.req("POST", "/api/clients/aaaaaaaa-1", { name: "x" }, {});
ok(r.status === 404 || r.status === 405 || r.status === 400, "route inconnue");
r = await fetch(B + "/api/me", { method: "POST" });
ok(r.status === 403, "CSRF : en-tête obligatoire");

// commerciaux
r = await admin.req("POST", "/api/users", { name: "Karim", login: "karim", password: "karim12345" });
ok(r.status === 201 && r.data.user.role === "commercial" && r.data.user.perms.all === false, "création commercial (périmètre propre)");
const karim = r.data.user;
r = await admin.req("POST", "/api/users", { name: "Sara", login: "sara", perms: { scope: "all", export: 1 } });
ok(r.status === 201 && r.data.password && r.data.password.length === 10, "mot de passe provisoire généré");
const sara = r.data.user, saraPw = r.data.password;
ok(sara.perms.all && sara.perms.export && !sara.perms.edit_all, "droits Sara");
r = await admin.req("POST", "/api/users", { name: "Karim2", login: "KARIM" });
ok(r.status === 409, "identifiant unique (insensible à la casse)");
r = await a1.req("POST", "/api/auth/login", { login: "karim", password: "mauvais" });
ok(r.status === 401, "mauvais mot de passe");
r = await a1.req("POST", "/api/auth/login", { login: "Karim", password: "karim12345" });
ok(r.status === 200 && r.data.user.must_change, "connexion Karim + changement demandé");
r = await a2.req("POST", "/api/auth/login", { login: "sara", password: saraPw });
ok(r.status === 200, "connexion Sara");

// fiche client
const c1 = uuid();
r = await a1.req("PUT", "/api/clients/" + c1, { name: "Garage Atlas", kind: "prospect", city: "Mohammedia", phone: "0522000000", address: "Bd Hassan II" });
ok(r.status === 201 && r.data.client.code === "PR-00001" && r.data.client.owner_id === karim.id, "création prospect avec code auto");
r = await a1.req("PUT", "/api/clients/" + c1, { name: "Garage Atlas", city: "Mohammedia" });
ok(r.status === 200 && r.data.client.code === "PR-00001", "renvoi idempotent (hors ligne)");
const c2 = uuid();
r = await a1.req("PUT", "/api/clients/" + c2, { name: "Pièces Auto Nord", kind: "client", code: "PR-00001" });
ok(r.status === 201 && r.data.client.code === "CL-00001", "code déjà pris à la création hors ligne -> nouveau code");
r = await a1.req("PUT", "/api/clients/" + c2, { code: "PR-00001" });
ok(r.status === 409, "code en double refusé à la modification");
r = await a1.req("PUT", "/api/clients/" + uuid(), { name: "x" });
ok(r.status === 400, "nom trop court");
r = await a1.req("PUT", "/api/clients/" + uuid(), { name: "Bon nom", email: "pasunmail" });
ok(r.status === 400, "e-mail invalide");

// géolocalisation
r = await a1.req("POST", `/api/clients/${c1}/geo`, { lat: 33.6866, lng: -7.3830, acc: 12 });
ok(r.status === 200 && r.data.client.lat === 33.6866 && r.data.client.geo_by === karim.id, "position enregistrée");
r = await a1.req("POST", `/api/clients/${c1}/geo`, { lat: 200, lng: 0 });
ok(r.status === 400, "position invalide");

// visibilité
const a3 = new Agent();
r = await admin.req("POST", "/api/users", { name: "Omar", login: "omar", password: "omar123456" });
const omar = r.data.user;
await a3.req("POST", "/api/auth/login", { login: "omar", password: "omar123456" });
r = await a3.req("GET", "/api/clients/" + c1);
ok(r.status === 404, "Omar ne voit pas les clients de Karim");
r = await a3.req("PUT", "/api/clients/" + c1, { name: "Piratage" });
ok(r.status === 404, "Omar ne peut pas modifier un client invisible");
r = await a2.req("GET", "/api/clients/" + c1);
ok(r.status === 200, "Sara (périmètre tous) voit le client");
r = await a2.req("PUT", "/api/clients/" + c1, { name: "Modif Sara" });
ok(r.status === 403, "Sara ne peut pas modifier sans droit edit_all");
r = await a3.req("GET", "/api/sync");
ok(r.data.clients.length === 0, "sync Omar vide");
r = await a1.req("GET", "/api/sync");
ok(r.data.clients.length === 2 && r.data.users.length >= 4, "sync Karim : 2 clients");
const since = r.data.now;

// visite + compte-rendu
const v1 = uuid();
r = await a1.req("PUT", "/api/visits/" + v1, { client_id: c1, kind: "visite", status: "done", date: Date.now() - 3600000, agreed: "Devis pour 10 filtres", not_done: "Pas de décision sur les pneus", demands: "Filtres à huile, plaquettes", lat: 33.6867, lng: -7.3831, geo_acc: 15 });
ok(r.status === 201 && r.data.visit.user_id === karim.id && r.data.visit.demands.includes("plaquettes"), "compte-rendu de visite");
r = await a1.req("PUT", "/api/visits/" + uuid(), { client_id: c1, kind: "rdv", status: "planned", date: Date.now() + 86400000 });
ok(r.status === 201 && r.data.visit.status === "planned", "rendez-vous planifié");
r = await a3.req("PUT", "/api/visits/" + uuid(), { client_id: c1, kind: "visite" });
ok(r.status === 404, "pas de visite sur un client invisible");
r = await a2.req("PUT", "/api/visits/" + v1, { agreed: "modif" });
ok(r.status === 403, "Sara ne modifie pas le compte-rendu de Karim");

// documents
const f1 = uuid();
const img = new Uint8Array(5000).fill(7);
r = await a1.req("PUT", "/api/files/" + f1, img, { "Content-Type": "image/jpeg", "X-Client-Id": c1, "X-Visit-Id": v1, "X-File-Name": encodeURIComponent("Façade.jpg"), "Content-Length": "5000" });
ok(r.status === 201 && r.data.file.category === "photo" && r.data.file.name === "Façade.jpg", "photo envoyée");
r = await a1.req("PUT", "/api/files/" + f1, img, { "Content-Type": "image/jpeg", "X-Client-Id": c1, "Content-Length": "5000" });
ok(r.status === 200, "renvoi de photo idempotent");
const f2 = uuid();
r = await a1.req("PUT", "/api/files/" + f2, new Uint8Array(1200).fill(1), { "Content-Type": "application/pdf", "X-Client-Id": c1, "X-Category": "devis", "X-File-Name": "devis-123.pdf", "Content-Length": "1200" });
ok(r.status === 201 && r.data.file.category === "devis", "devis PDF");
r = await a1.req("PUT", "/api/files/" + uuid(), new Uint8Array(10), { "Content-Type": "text/html", "X-Client-Id": c1, "X-File-Name": "x.html", "Content-Length": "10" });
ok(r.status === 415, "HTML refusé");
r = await a1.req("PUT", "/api/files/" + uuid(), new Uint8Array(10), { "Content-Type": "application/octet-stream", "X-Client-Id": c1, "X-File-Name": "virus.exe", "Content-Length": "10" });
ok(r.status === 415, "exe refusé");
r = await a1.req("PUT", "/api/files/" + uuid(), new Uint8Array(10), { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "X-Client-Id": c1, "X-File-Name": "tarifs.xlsx", "Content-Length": "10" });
ok(r.status === 201 && r.data.file.category === "document", "Excel accepté");
r = await a1.req("GET", "/api/files/" + f1, null, { Range: "bytes=0-99" });
ok(r.status === 206 && r.data.length === 100, "lecture partielle (vidéo)");
r = await a3.req("GET", "/api/files/" + f1);
ok(r.status === 404, "Omar ne lit pas le fichier");
r = await a1.req("DELETE", "/api/files/" + f1);
ok(r.status === 403, "commercial ne supprime pas de fichier");

// longue vidéo en morceaux
const fv = uuid();
r = await a1.req("POST", "/api/files/mp", { id: fv, client_id: c1, mime: "video/mp4", name: "demo.mp4" });
ok(r.status === 201, "début envoi vidéo longue");
const p1 = await a1.req("PUT", `/api/files/mp/${fv}/1`, new Uint8Array(100).fill(2), { "Content-Length": "100" });
const p2 = await a1.req("PUT", `/api/files/mp/${fv}/2`, new Uint8Array(40).fill(3), { "Content-Length": "40" });
r = await a1.req("POST", `/api/files/mp/${fv}/complete`, { parts: [p1.data, p2.data] });
ok(r.status === 201 && r.data.file.size === 140 && r.data.file.category === "video", "vidéo longue assemblée");

// sync incrémentale
r = await a1.req("GET", "/api/sync?since=" + since);
ok(r.data.visits.length === 2 && r.data.files.length >= 4 && r.data.clients.some((c) => c.id === c1), "sync incrémentale");

// admin : réattribution (départ d'un commercial)
r = await a1.req("POST", "/api/clients/reassign", { from: karim.id, to: omar.id });
ok(r.status === 403, "commercial ne réattribue pas");
const before2 = Date.now();
r = await admin.req("POST", "/api/clients/reassign", { from: karim.id, to: omar.id });
ok(r.status === 200 && r.data.moved === 2, "transfert du portefeuille");
r = await a3.req("GET", "/api/clients/" + c1);
ok(r.status === 200 && r.data.visits.length === 2 && r.data.files.length >= 3, "Omar récupère fiche, visites et documents");
r = await admin.req("PATCH", "/api/users/" + karim.id, { active: false });
ok(r.status === 200 && r.data.user.active === false, "désactivation Karim");
r = await a1.req("GET", "/api/sync");
ok(r.status === 401, "Karim déconnecté après désactivation");
r = await new Agent().req("POST", "/api/auth/login", { login: "karim", password: "karim12345" });
ok(r.status === 403, "Karim ne peut plus se connecter");
r = await admin.req("PATCH", "/api/users/" + (await admin.req("GET", "/api/me")).data.user.id, { role: "commercial" });
ok(r.status === 400, "l'admin ne se retire pas ses droits");

// stats, export, journal
r = await admin.req("GET", "/api/stats");
ok(r.status === 200 && r.data.totals.prospects === 1 && r.data.totals.clients === 1 && r.data.totals.visits_30 === 1 && r.data.totals.located === 1, "statistiques");
r = await a3.req("GET", "/api/stats");
ok(r.status === 403, "stats réservées");
r = await a2.req("GET", "/api/export/clients.xlsx");
ok(r.status === 200 && r.data[0] === 0x50 && r.data[1] === 0x4b, "export Excel (Sara a le droit)");
const xl = Buffer.from(r.data);
ok(xl.includes(Buffer.from("Garage Atlas")) && xl.includes(Buffer.from("google.com/maps")), "contenu export");
r = await a3.req("GET", "/api/export/clients.xlsx");
ok(r.status === 403, "Omar sans droit d'export");
r = await admin.req("GET", "/api/export/visits.xlsx");
ok(r.status === 200 && Buffer.from(r.data).includes(Buffer.from("plaquettes")), "export visites");
r = await admin.req("GET", "/api/audit");
ok(r.status === 200 && r.data.entries.some((e) => e.action === "client.reassign") && r.data.entries.some((e) => e.action === "export.clients"), "journal");
r = await admin.req("DELETE", "/api/clients/" + c2);
ok(r.status === 200, "suppression douce par admin");
r = await a3.req("GET", "/api/sync?since=" + before2);
ok(r.data.clients.some((c) => c.id === c2 && c.deleted_at), "suppression propagée à la sync");
r = await admin.req("POST", "/api/users/" + omar.id + "/password");
ok(r.status === 200 && r.data.password, "réinitialisation mot de passe");
r = await admin.req("PATCH", "/api/settings", { company: "Magiscom Tech", client_prefix: "cli" });
ok(r.status === 200 && r.data.settings.client_prefix === "CLI", "réglages");

// fonction affichée (titre libre) et code de secours de la direction
r = await admin.req("POST", "/api/users", { name: "Nadia", login: "nadia", role: "admin", title: "Directrice commerciale" });
ok(r.status === 201 && r.data.user.title === "Directrice commerciale" && r.data.user.role === "admin", "titre à la création");
const nadia = r.data.user;
r = await admin.req("PATCH", "/api/users/" + karim.id, { title: "Chef d'équipe Casablanca" });
ok(r.data.user.title === "Chef d'équipe Casablanca" && r.data.user.role === "commercial", "titre modifié, rôle inchangé");
await admin.req("POST", "/api/users", { name: "Lina", login: "lina", password: "lina-123456" });
const a4 = new Agent(); await a4.req("POST", "/api/auth/login", { login: "lina", password: "lina-123456" });
r = await a4.req("GET", "/api/users");
ok(r.data.users.find((u) => u.id === nadia.id).title === "Directrice commerciale", "titre visible par les commerciaux");
r = await admin.req("GET", "/api/settings/recovery");
ok(r.data.exists === true, "code de secours enregistré");
const guest = new Agent();
r = await guest.req("POST", "/api/auth/recover", { login: "karim", code: recovery1, password: "nouveau-mdp-1" });
ok(r.status === 400, "secours refusé pour un commercial");
r = await guest.req("POST", "/api/auth/recover", { login: "directeur", code: "AAAA-BBBB-CCCC", password: "nouveau-mdp-1" });
ok(r.status === 400, "mauvais code refusé");
r = await guest.req("POST", "/api/auth/recover", { login: "directeur", code: recovery1.toLowerCase().replace(/-/g, " "), password: "court" });
ok(r.status === 400 && /8 caract/.test(r.data.error), "mot de passe trop court");
r = await guest.req("POST", "/api/auth/recover", { login: "directeur", code: recovery1.toLowerCase().replace(/-/g, " "), password: "nouveau-mdp-1" });
ok(r.status === 200 && r.data.user.login === "directeur" && /^[A-Z0-9]{4}-/.test(r.data.new_code) && r.data.new_code !== recovery1, "secours accepté, nouveau code");
const recovery2 = r.data.new_code;
r = await guest.req("GET", "/api/me");
ok(r.status === 200 && r.data.user.login === "directeur", "connecté après secours");
r = await new Agent().req("POST", "/api/auth/recover", { login: "directeur", code: recovery1, password: "nouveau-mdp-2" });
ok(r.status === 400, "ancien code inutilisable");
r = await new Agent().req("POST", "/api/auth/login", { login: "directeur", password: "nouveau-mdp-1" });
ok(r.status === 200, "connexion avec le nouveau mot de passe");
r = await admin.req("GET", "/api/me");
ok(r.status === 401, "anciennes sessions du directeur fermées");
const admin2 = new Agent(); await admin2.req("POST", "/api/auth/login", { login: "directeur", password: "nouveau-mdp-1" });
r = await admin2.req("POST", "/api/settings/recovery", { password: "faux" });
ok(r.status === 400, "nouveau code : mot de passe exigé");
r = await admin2.req("POST", "/api/settings/recovery", { password: "nouveau-mdp-1" });
ok(r.status === 200 && r.data.code && r.data.code !== recovery2, "nouveau code généré");
r = await a4.req("POST", "/api/settings/recovery", { password: "x" });
ok(r.status === 403, "code de secours réservé à la direction");
r = await admin2.req("GET", "/api/status");
ok(!JSON.stringify(r.data).includes("recovery"), "le code n'apparaît nulle part");
for (let i = 0; i < 8; i++) await new Agent().req("POST", "/api/auth/recover", { login: "directeur", code: "ZZZZ-ZZZZ-ZZZZ", password: "x12345678" });
r = await new Agent().req("POST", "/api/auth/recover", { login: "directeur", code: "ZZZZ-ZZZZ-ZZZZ", password: "x12345678" });
ok(r.status === 429, "secours : trop de tentatives bloquées");

// page et fichier de l'application
r = await fetch(B + "/");
ok(r.status === 200 && (r.headers.get("content-security-policy") || "").includes("default-src"), "page avec CSP");

console.log(`${pass} réussis, ${failN} échoués`);
server.close();
process.exit(failN ? 1 : 0);
