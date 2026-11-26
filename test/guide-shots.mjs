// Captures d'écran pour le guide utilisateur : OUT=dossier SHOP=photo.jpg node test/guide-shots.mjs
import { start } from "./server.mjs";
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
const OUT = process.env.OUT || "/tmp";
const { server, env } = await start(8795);
const B = "http://localhost:8795";
env.DB.db.prepare("INSERT INTO settings (k, v) VALUES ('setup_code', 'AB12CD34')").run();
const b = await chromium.launch();
const errs = [];
const watch = (p, who) => { p.on("pageerror", (e) => errs.push(who + " " + e.message)); };
const shot = (p, n, opt = {}) => p.screenshot({ path: `${OUT}/${n}.png`, ...opt });
const go = async (p, hash, ms = 700) => { await p.evaluate((h) => { location.hash = h; }, hash); await p.waitForTimeout(ms); };
const seed = (p, items) => p.evaluate(async (items) => {
  const out = [];
  for (const [path, body] of items) {
    const id = body.id || crypto.randomUUID();
    const r = await fetch(path.replace(":id", id), { method: "PUT", headers: { "Content-Type": "application/json", "X-Requested-With": "terrain" }, body: JSON.stringify(body) });
    out.push({ id, ok: r.ok, j: await r.json().catch(() => null) });
  }
  return out;
}, items);
const D = 86400000, T = Date.now();

// ---------- Direction (ordinateur)
const ca = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
const pa = await ca.newPage(); watch(pa, "admin");
await pa.goto(B);
await pa.waitForSelector("text=Première configuration");
const fa = pa.locator("form input");
await fa.nth(0).fill("AB12CD34");
await fa.nth(1).fill("Magiscom Tech");
await fa.nth(2).fill("Directeur commercial");
await fa.nth(3).fill("direction");
await fa.nth(4).fill("motdepasse-direction");
await shot(pa, "d01-setup");
await pa.click("button[type=submit]");
await pa.waitForSelector(".kpis");

async function addUser(name, login, phone, all) {
  await go(pa, "#/team");
  await pa.click("text=Ajouter un utilisateur");
  const s = pa.locator(".sheet");
  await s.locator("input").nth(0).fill(name);
  await s.locator("input").nth(1).fill(login);
  await s.locator("input").nth(2).fill(phone);
  if (all) await s.locator("label.check input").nth(0).check();
  if (login === "karim") await shot(pa, "d04-ajout-commercial");
  await s.locator("button:has-text('Enregistrer')").click();
  await pa.waitForSelector(".pw");
  const pw = (await pa.textContent(".pw")).trim();
  if (login === "karim") await shot(pa, "d05-mot-de-passe");
  await pa.click(".sheet button:has-text('OK')");
  await pa.waitForTimeout(300);
  return pw;
}
const pwK = await addUser("Karim Benali", "karim", "0661 00 00 00");
await addUser("Salma Idrissi", "salma", "0662 00 00 00");
await addUser("Youssef Amrani", "youssef", "0663 00 00 00");

// ---------- Commercial (téléphone)
const cc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: { latitude: 33.6866, longitude: -7.383, accuracy: 9 }, permissions: ["geolocation"] });
const pc = await cc.newPage(); watch(pc, "karim");
await pc.goto(B);
await pc.waitForSelector("form input");
await pc.fill("form input >> nth=0", "karim");
await pc.fill("form input >> nth=1", pwK);
await shot(pc, "p01-connexion");
await pc.click("button[type=submit]");
await pc.waitForSelector("text=Choisissez votre propre mot de passe");
await pc.fill("form input[autocomplete=current-password]", pwK);
await pc.fill("form input[autocomplete=new-password]", "karim-2026-terrain");
await shot(pc, "p02-nouveau-mdp");
await pc.click("form button[type=submit]");
await pc.waitForTimeout(800);
await pc.addStyleTag({ content: ".toast{display:none!important}" });
await pa.addStyleTag({ content: ".toast{display:none!important}" });

// portefeuille existant de Karim
const cl = [
  ["Droguerie Al Amal", "client", "Mohammedia", "Hassan Tazi", "0523 31 22 10", "Quincaillerie", 33.6921, -7.3891],
  ["Pharmacie Ennour", "client", "Mohammedia", "Dr. Bennani", "0523 30 45 12", "Pharmacie", 33.6835, -7.3742],
  ["Café Les Palmiers", "prospect", "Mohammedia", "Rachid", "0661 22 33 44", "Café / restaurant", 33.6990, -7.3620],
  ["Transports Rapides SARL", "client", "Casablanca", "Mme Lahlou", "0522 40 50 60", "Transport", 33.5899, -7.6039],
  ["Boulangerie Assalam", "prospect", "Aïn Harrouda", "Omar", "0662 55 66 77", "Boulangerie", 33.6378, -7.4486],
  ["Clinique Dentaire Atlas", "client", "Casablanca", "Dr. Fassi", "0522 98 76 54", "Santé", 33.5731, -7.5898],
];
const made = await seed(pc, cl.map(([name, kind, city, contact, phone, sector, lat, lng], i) => ["/api/clients/:id", { name, kind, city, contact, phone, sector, lat, lng, geo_acc: 12, address: "Bd " + ["Hassan II", "Mohammed V", "des FAR", "Zerktouni", "Al Massira", "Anfa"][i], created_at: T - (20 - i) * D }]));
const vis = [
  [0, -6, "Commande de 40 rouleaux de câble, livraison jeudi", "", "Catalogue peinture 2027"],
  [1, -3, "Renouvellement du contrat de maintenance", "Formation du personnel reportée", ""],
  [3, -1, "Devis accepté pour 3 postes", "", "Ajouter un module stock"],
  [5, -2, "", "Responsable absent", "Rappeler la semaine prochaine"],
];
await seed(pc, vis.map(([ci, d, agreed, not_done, demands]) => ["/api/visits/:id", { client_id: made[ci].id, kind: "visite", status: "done", date: T + d * D, agreed, not_done, demands, lat: cl[ci][6], lng: cl[ci][7], geo_acc: 15 }]));
await seed(pc, [
  ["/api/visits/:id", { client_id: made[2].id, kind: "rdv", status: "planned", date: T + 1 * D + 3600e3, next_step: "Présentation de l'offre caisse" }],
  ["/api/visits/:id", { client_id: made[4].id, kind: "rdv", status: "planned", date: T + 3 * D, next_step: "Démonstration logiciel" }],
  ["/api/visits/:id", { client_id: made[1].id, kind: "appel", status: "planned", date: T + 5 * D, next_step: "Relance contrat" }],
]);
await pc.reload(); await pc.waitForTimeout(1500);
await pc.addStyleTag({ content: ".toast{display:none!important}" });
await go(pc, "#/clients", 900);
await shot(pc, "p03-liste");

// nouvelle fiche
await pc.click(".tabs-bottom a.plus");
await pc.fill("form input >> nth=0", "Garage Atlas Auto");
await pc.click(".seg button[role=radio] >> nth=1");
await pc.fill("form input[autocomplete=name]", "M. Alaoui");
await pc.fill("form input[autocomplete=tel]", "0522 33 44 55");
await pc.fill("form input[list=cities]", "Mohammedia");
await pc.fill("form input[autocomplete=street-address]", "12 Bd Hassan II");
await pc.evaluate(() => { scrollTo(0, 0); document.querySelectorAll("*").forEach((e) => { if (e.scrollTop) e.scrollTop = 0; }); });
await pc.waitForTimeout(200);
await shot(pc, "p04a-nouvelle-fiche-haut");
await pc.click("text=Enregistrer la position ici");
await pc.waitForSelector("text=Position enregistrée");
await shot(pc, "p04-nouvelle-fiche");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".hero h2");
await pc.waitForTimeout(1200);
await shot(pc, "p05-fiche");
await pc.click("text=Visites (0)");
await pc.click("text=Compte-rendu de visite");
await pc.fill("textarea >> nth=0", "Devis pour 10 filtres à huile, livraison mardi");
await pc.fill("textarea >> nth=1", "Pas de décision pour les pneus");
await pc.fill("textarea >> nth=2", "Plaquettes Bosch, catalogue 2027");
await shot(pc, "p06-compte-rendu");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".visit");
await pc.waitForTimeout(500);
await shot(pc, "p07-visites");
await pc.click("text=Documents");
const [chooser] = await Promise.all([pc.waitForEvent("filechooser"), pc.click(".adds button >> nth=0")]);
await chooser.setFiles(process.env.SHOP);
await pc.waitForSelector(".doc img");
await pc.waitForTimeout(2500);
await shot(pc, "p08-documents");

// hors ligne
await cc.setOffline(true);
await go(pc, "#/new", 500);
await pc.fill("form input >> nth=0", "Pièces Auto Nord");
await pc.fill("form input[list=cities]", "Casablanca");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".hero h2");
await go(pc, "#/clients", 700);
await shot(pc, "p09-hors-ligne");
await cc.setOffline(false);
await pc.evaluate(() => window.dispatchEvent(new Event("online")));
await pc.waitForTimeout(2500);
await go(pc, "#/agenda", 800);
await shot(pc, "p10-agenda");
await go(pc, "#/me", 600);
await shot(pc, "p11-moi");

// ---------- Salma & Youssef : un peu d'activité (créée par la direction pour leur compte)
const users = env.DB.db.prepare("SELECT id, login FROM users").all();
const uid = (l) => users.find((u) => u.login === l).id;
const other = [
  ["Hôtel Miramar", "client", "Mohammedia", "salma"], ["Supérette Al Baraka", "prospect", "Mohammedia", "salma"],
  ["Cabinet Comptable Raji", "client", "Casablanca", "salma"], ["Auto-école Nour", "prospect", "Casablanca", "youssef"],
  ["Imprimerie Moderne", "client", "Casablanca", "youssef"],
];
await seed(pa, other.map(([name, kind, city, who], i) => ["/api/clients/:id", { name, kind, city, owner_id: uid(who), phone: "0522 1" + i + " 00 00", created_at: T - (10 - i) * D }]));
await pa.goto(B + "/#/dashboard"); await pa.reload(); await pa.waitForSelector(".kpis"); await pa.waitForTimeout(1500); await pa.waitForTimeout(900);
await pa.addStyleTag({ content: ".toast{display:none!important}" });
await shot(pa, "d02-tableau-de-bord");
await pa.goto(B + "/#/clients"); await pa.waitForTimeout(2500);
await shot(pa, "d06-clients");
await go(pa, "#/team", 900);
await shot(pa, "d03-equipe");
await pa.click("text=Karim Benali");
await pa.waitForSelector(".sheet");
await pa.waitForTimeout(400);
await shot(pa, "d07-fiche-commercial");
await pa.click(".sheet button:has-text('Annuler')");
await pa.goto(B + "/#/export"); await pa.waitForTimeout(900);
await shot(pa, "d08-export");
await go(pa, "#/journal", 900);
await shot(pa, "d09-journal");
await go(pa, "#/settings", 700);
await shot(pa, "d10-reglages");

console.log(JSON.stringify({ errs, made: made.map((m) => m.ok) }));
await b.close(); server.close();
