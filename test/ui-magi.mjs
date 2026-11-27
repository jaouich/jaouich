// Assistant Magi dans le navigateur (micro simulé) : OUT=dossier PW=playwright node test/ui-magi.mjs
import { start } from "./server.mjs";
import { createRequire } from "node:module"; const { chromium } = createRequire(import.meta.url)(process.env.PW || "playwright");
const OUT = process.env.OUT || "/tmp";
const { server, env } = await start(8800);
const B = "http://localhost:8800";
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
env.AI = { async run(model, input) {
  if (model.includes("whisper")) return { text: input.language === "ar" ? "افتح الأجندة" : "Ouvre l'agenda", segments: [] };
  const sys = input.messages[0].content, msg = input.messages.at(-1).content;
  const id = (name) => sys.split("\n").find((x) => x.includes("| " + name + " |")).split(" | ")[0];
  if (/rdv|rendez/i.test(msg)) return { response: { reply: "Très bien ! Je planifie un rendez-vous demain à 10:00 avec Droguerie Al Amal pour présenter le catalogue peinture. Vérifiez et confirmez :", action: "create_activity", client_id: id("Droguerie Al Amal"), kind: "rdv", date: tomorrow, time: "10:00", text: "Présenter le catalogue peinture 2027" } };
  if (/30 jours/i.test(msg)) return { response: { reply: "2 clients n'ont pas eu de visite depuis plus de 30 jours :\n• Garage Atlas (Casablanca) – jamais visité\n• Pharmacie Ennour (Mohammedia) – dernière visite le 12 octobre\nVoulez-vous que je planifie une visite ?", action: "none" } };
  if (/affaire/i.test(msg)) return { response: { reply: "Je crée l'affaire « Peinture façade » de 15 000 MAD pour Droguerie Al Amal, au stade devis.", action: "create_deal", client_id: id("Droguerie Al Amal"), title: "Peinture façade", amount: "15000", stage: "devis", date: "" } };
  if (/agenda|الأجندة/i.test(msg)) return { response: { reply: /الأجندة/.test(msg) ? "حاضر، أفتح لك الأجندة." : "J'ouvre votre agenda.", action: "open_page", page: "agenda" } };
  return { response: { reply: "Je n'ai pas compris.", action: "none" } };
} };
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const errs = [];
const watch = (p) => { p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); }); };
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["microphone"] });
const p = await c.newPage(); watch(p);
const shot = (pg, name) => pg.screenshot({ path: `${OUT}/${name}.png` });
await p.goto(B);
await p.waitForSelector("text=Première configuration");
const fa = p.locator("form input");
await fa.nth(0).fill("Magiscom Tech"); await fa.nth(1).fill("Direction"); await fa.nth(2).fill("direction"); await fa.nth(3).fill("motdepasse1");
await p.click("button[type=submit]");
await p.waitForTimeout(1200);
await p.evaluate(async () => {
  for (const [name, city, kind] of [["Droguerie Al Amal", "Mohammedia", "client"], ["Garage Atlas", "Casablanca", "prospect"], ["Pharmacie Ennour", "Mohammedia", "client"]])
    await fetch("/api/clients/" + crypto.randomUUID(), { method: "PUT", headers: { "Content-Type": "application/json", "X-Requested-With": "terrain" }, body: JSON.stringify({ name, city, kind, phone: "0661 22 33 44" }) });
});
await p.evaluate(() => { location.hash = "#/clients"; }); await p.reload(); await p.waitForTimeout(1800);
await p.addStyleTag({ content: ".toast{display:none!important}" });
await shot(p, "m1-bouton");
// 1. ouvrir Magi
await p.click(".magi-fab");
await p.waitForSelector(".magi-panel");
await p.waitForTimeout(300);
await shot(p, "m2-accueil");
// 2. question écrite
await p.fill(".magi-in textarea", "Quels clients je n'ai pas visités depuis 30 jours ?");
await p.click(".magi-send");
await p.waitForSelector("text=Pharmacie Ennour (Mohammedia)");
// 2b. menu de questions : toujours disponible, même après une réponse
await p.click(".magi-menubtn");
await p.waitForSelector(".magi-menu:not([hidden]) .mm-q button");
await shot(p, "m2b-menu");
const menuN = await p.locator(".magi-menu .mm-q button").count();
await p.click(".magi-menu button.fill >> nth=0");
const prefilled = await p.inputValue(".magi-in textarea");
const menuHidden = await p.locator(".magi-menu").isHidden();
await p.fill(".magi-in textarea", "");
const nBot = await p.locator(".mg.bot").count();
await p.click(".magi-menubtn");
await p.click(".magi-menu .mm-q button:has-text('Clients pas visités depuis 30 jours')");
await p.waitForFunction((n) => document.querySelectorAll(".mg.bot:not(.wait)").length > n, nBot);
const menuOk = menuN >= 15 && prefilled.length > 3 && menuHidden;
// 3. rendez-vous
await p.fill(".magi-in textarea", "Programme un rdv demain à 10h avec Al Amal pour le catalogue peinture");
await p.keyboard.press("Enter");
await p.waitForSelector(".mg-card");
await p.waitForTimeout(300);
await shot(p, "m3-rdv");
const before = env.DB.db.prepare("SELECT COUNT(*) n FROM visits").get().n;
await p.click(".mg-card button:has-text('Confirmer')");
await p.waitForSelector("text=C’est fait");
await p.waitForTimeout(2500);
const v = env.DB.db.prepare("SELECT v.*, c.name FROM visits v JOIN clients c ON c.id = v.client_id ORDER BY v.created_at DESC").get();
const rdvOk = env.DB.db.prepare("SELECT COUNT(*) n FROM visits").get().n === before + 1 && v.kind === "rdv" && v.status === "planned" && v.name === "Droguerie Al Amal" && new Date(v.date).getHours() === 10 && v.next_step.includes("catalogue");
await shot(p, "m4-fait");
// 4. affaire
await p.fill(".magi-in textarea", "Crée une affaire peinture façade 15000 dirhams pour Al Amal");
await p.click(".magi-send");
await p.waitForSelector(".mg-card");
await p.waitForTimeout(200);
await shot(p, "m5-affaire");
await p.click(".mg-card button:has-text('Confirmer')");
await p.waitForTimeout(2500);
const d = env.DB.db.prepare("SELECT * FROM deals").get();
const dealOk = d && d.title === "Peinture façade" && d.amount === 15000 && d.stage === "devis";
// 5. micro → transcription → ouverture de l'agenda
await p.click(".magi-mic");
await p.waitForTimeout(1600);
await shot(p, "m6-ecoute");
await p.click(".magi-mic");
await p.waitForFunction(() => location.hash === "#/agenda", null, { timeout: 8000 }).catch(() => {});
const micOk = await p.evaluate(() => location.hash === "#/agenda" && !document.querySelector(".magi-panel"));
await p.waitForTimeout(800);
await shot(p, "m7-agenda");

// --- arabe + ordinateur
const c2 = await b.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, permissions: ["microphone"], storageState: await c.storageState() });
const q = await c2.newPage(); watch(q);
await q.goto(B); await q.waitForTimeout(400);
await q.evaluate(() => { localStorage.setItem("lang", "ar"); localStorage.setItem("crm-magi-lang", "ar"); location.hash = "#/clients"; }); await q.reload(); await q.waitForTimeout(1800);
await q.addStyleTag({ content: ".toast{display:none!important}" });
const sideBtn = await q.locator(".side .magi-side").count();
await q.click(".side .magi-side");
await q.waitForSelector(".magi-panel");
await q.fill(".magi-in textarea", "شنو عندي من rdv غدا مع العمالة؟ برمج ليا rdv مع الأمل غدا");
await q.click(".magi-send");
await q.waitForSelector(".mg-card");
await q.waitForTimeout(300);
await shot(q, "m8-bureau-ar");
console.log(JSON.stringify({ menuOk, rdvOk, dealOk, micOk, sideBtn, errs }));
await b.close(); server.close();
process.exit(menuOk && rdvOk && dealOk && micOk && sideBtn && !errs.length ? 0 : 1);
