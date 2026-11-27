// Test de l'interface : node test/ui.mjs (Playwright + serveur local)
import { start } from "./server.mjs";
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
const OUT = process.env.OUT || "/tmp";
const { server, env } = await start(8791);
const B = "http://localhost:8791";
const b = await chromium.launch();
const errs = [];
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png` });
const watch = (p, who) => { p.on("pageerror", (e) => errs.push(who + " pageerror " + e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_TUNNEL|ERR_PROXY|net::ERR/.test(m.text())) errs.push(who + " " + m.text()); }); };

// ---- direction (ordinateur)
const ca = await b.newContext({ viewport: { width: 1280, height: 820 } });
const pa = await ca.newPage(); watch(pa, "admin");
await pa.goto(B);
await pa.waitForSelector("text=Première configuration");
await pa.fill("form input >> nth=1", "Mohammed Jaouich");
await pa.fill("form input >> nth=2", "admin");
await pa.fill("form input >> nth=3", "adminpass123");
await pa.click("button[type=submit]");
await pa.waitForSelector("text=Tableau de bord >> nth=0");
await pa.waitForTimeout(800);
await shot(pa, "01-dashboard-vide");
await pa.click("a[href='#/team']");
await pa.click("text=Ajouter un utilisateur");
const sheet = pa.locator(".sheet");
await sheet.locator("input").nth(0).fill("Karim Benali");
await sheet.locator("input").nth(1).fill("karim");
await sheet.locator("input").nth(2).fill("0661000000");
await sheet.locator("button:has-text('Enregistrer')").click();
await pa.waitForSelector(".pw");
const pw = (await pa.textContent(".pw")).trim();
await shot(pa, "02-mot-de-passe-provisoire");
await pa.click(".sheet button:has-text('OK')");

// ---- commercial (téléphone, avec GPS)
const cc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, geolocation: { latitude: 33.6866, longitude: -7.383, accuracy: 9 }, permissions: ["geolocation"] });
const pc = await cc.newPage(); watch(pc, "karim");
await pc.goto(B);
await pc.fill("form input >> nth=0", "karim");
await pc.fill("form input >> nth=1", pw);
await pc.click("button[type=submit]");
await pc.waitForSelector("text=Choisissez votre propre mot de passe").catch(async (e) => { await shot(pc, "ERR-mustchange"); console.log("ERRS", errs, await pc.evaluate(() => location.hash + " | " + document.body.innerText.slice(0, 400))); throw e; });
await pc.fill("form input[autocomplete=current-password]", pw);
await pc.fill("form input[autocomplete=new-password]", "karimpass123");
await pc.click("form button[type=submit]");
await pc.waitForTimeout(700);
await pc.goto(B + "/#/clients"); await pc.waitForTimeout(600);
await shot(pc, "03-liste-vide");
// nouvelle fiche avec position
await pc.click(".tabs-bottom a.plus");
await pc.fill("form input >> nth=0", "Garage Atlas Auto");
await pc.click(".seg button[role=radio] >> nth=1");
await pc.fill("form input[autocomplete=name]", "M. Alaoui");
await pc.fill("form input[autocomplete=tel]", "0522334455");
await pc.fill("form input[list=cities]", "Mohammedia");
await pc.fill("form input[autocomplete=street-address]", "12 Bd Hassan II");
await pc.click("text=Enregistrer la position ici");
await pc.waitForSelector("text=Position enregistrée");
await shot(pc, "04-nouvelle-fiche");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".hero h2");
await pc.waitForTimeout(1500);
await shot(pc, "05-fiche");
// compte-rendu
await pc.click("text=Visites (0)");
await pc.click("text=Compte-rendu de visite");
await pc.fill("textarea >> nth=0", "Devis pour 10 filtres à huile, livraison mardi");
await pc.fill("textarea >> nth=1", "Pas de décision pour les pneus");
await pc.fill("textarea >> nth=2", "Plaquettes Bosch, catalogue 2027");
await shot(pc, "06-compte-rendu");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".visit");
// photo
await pc.click("text=Documents");
const [chooser] = await Promise.all([pc.waitForEvent("filechooser"), pc.click(".adds button >> nth=0")]);
await chooser.setFiles(process.env.SHOP);
await pc.waitForSelector(".doc img");
await pc.waitForTimeout(2500);
await shot(pc, "07-documents");

// ---- hors ligne
await cc.setOffline(true);
await pc.goto(B + "/#/clients").catch(() => {});
await pc.waitForTimeout(500);
await pc.evaluate(() => { location.hash = "#/new"; });
await pc.waitForSelector("form input");
await pc.fill("form input >> nth=0", "Pièces Auto Nord (hors ligne)");
await pc.fill("form input[list=cities]", "Casablanca");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".hero h2");
await pc.click("text=Visites (0)");
await pc.click("text=Compte-rendu de visite");
await pc.fill("textarea >> nth=2", "Demande hors ligne : 20 batteries");
await pc.click("form button[type=submit]");
await pc.waitForSelector(".visit");
await pc.evaluate(() => { location.hash = "#/clients"; });
await pc.waitForTimeout(600);
await shot(pc, "08-hors-ligne");
const offlineBar = await pc.textContent("#sync");
await cc.setOffline(false);
await pc.evaluate(() => window.dispatchEvent(new Event("online")));
await pc.waitForTimeout(3000);
const onlineBar = await pc.textContent("#sync");
const rows = env.DB.db.prepare("SELECT name, code, kind, lat, owner_id FROM clients ORDER BY created_at").all();
const vis = env.DB.db.prepare("SELECT demands, lat FROM visits").all();
const fil = env.DB.db.prepare("SELECT name, size, category FROM files").all();
await pc.evaluate(() => { location.hash = "#/agenda"; }); await pc.waitForTimeout(600);
await shot(pc, "09-agenda");
await pc.evaluate(() => { location.hash = "#/me"; }); await pc.waitForTimeout(400);
await shot(pc, "10-moi");
// arabe
await pc.selectOption("select", "ar"); await pc.waitForTimeout(400);
await pc.evaluate(() => { location.hash = "#/clients"; }); await pc.waitForTimeout(600);
await shot(pc, "11-arabe");

// ---- direction : tableau de bord, fiche, export
await pa.evaluate(() => { location.hash = "#/dashboard"; }); await pa.reload(); await pa.waitForSelector(".kpis"); await pa.waitForTimeout(500);
await shot(pa, "12-dashboard");
await pa.evaluate(() => { location.hash = "#/clients"; }); await pa.waitForTimeout(1500);
await shot(pa, "13-clients-admin");
await pa.evaluate(() => { location.hash = "#/export"; }); await pa.waitForTimeout(500);
const [dl] = await Promise.all([pa.waitForEvent("download"), pa.click("button:has-text('Télécharger') >> nth=0")]);
const xpath = `${OUT}/export.xlsx`; await dl.saveAs(xpath);
await shot(pa, "14-export");
await pa.evaluate(() => { location.hash = "#/journal"; }); await pa.waitForTimeout(800);
await shot(pa, "15-journal");
await pa.evaluate(() => { location.hash = "#/team"; }); await pa.waitForTimeout(800);
await shot(pa, "16-equipe");

console.log(JSON.stringify({ offlineBar, onlineBar, rows, vis, fil, errs }, null, 1));
await b.close(); server.close();
