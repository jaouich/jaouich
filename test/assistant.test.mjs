// Tests de l'assistant Magi (faux Workers AI) : node test/assistant.test.mjs
import { start } from "./server.mjs";
const { server, env } = await start(8799);
const B = "http://localhost:8799";
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log("ÉCHEC:", m); } };
let last = null, nextOut = null;
env.AI = {
  async run(model, input) {
    if (model.includes("whisper")) return { text: Buffer.from(input.audio, "base64").toString("utf8"), segments: [] };
    last = input;
    const sys = input.messages[0].content;
    const id = (name) => { const l = sys.split("\n").find((x) => x.includes("| " + name + " |")); return l ? l.split(" | ")[0] : "inconnu"; };
    return { response: typeof nextOut === "function" ? nextOut(id, sys) : nextOut };
  },
};
class Agent {
  constructor() { this.cookie = ""; }
  async req(method, path, body, headers = {}) {
    const h = { "X-Requested-With": "terrain", ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let b = body;
    if (body && !(body instanceof Uint8Array) && typeof body !== "string") { b = JSON.stringify(body); h["Content-Type"] = "application/json"; }
    const r = await fetch(B + path, { method, headers: h, body: b });
    for (const c of r.headers.getSetCookie?.() || []) { const v = c.split(";")[0]; if (/^tr_(session|demo)=/.test(v)) this.cookie = v; }
    const ct = r.headers.get("content-type") || "";
    return { status: r.status, data: ct.includes("json") ? await r.json() : null };
  }
}
const uuid = () => crypto.randomUUID();
const admin = new Agent();
await admin.req("POST", "/api/setup", { login: "direction", password: "motdepasse1", name: "Direction", company: "Magiscom Tech" });
let r = await admin.req("POST", "/api/users", { name: "Karim Benali", login: "karim", phone: "0661" });
const kp = r.data.password;
const karim = new Agent();
await karim.req("POST", "/api/auth/login", { login: "karim", password: kp });
await karim.req("POST", "/api/me/password", { current: kp, password: "karim-2026-ok" });
await karim.req("POST", "/api/auth/login", { login: "karim", password: "karim-2026-ok" });

const amal = uuid(), atlas = uuid(), hidden = uuid();
await karim.req("PUT", "/api/clients/" + amal, { name: "Droguerie Al Amal", kind: "client", city: "Mohammedia", phone: "0661223344" });
await karim.req("PUT", "/api/clients/" + atlas, { name: "Garage Atlas", kind: "prospect", city: "Casablanca" });
await admin.req("PUT", "/api/clients/" + hidden, { name: "Hôtel Secret", kind: "client", city: "Rabat" });
const dealId = uuid();
await karim.req("PUT", "/api/deals/" + dealId, { client_id: atlas, title: "Logiciel caisse", amount: 12000, stage: "devis" });

// 1. rendez-vous : le contexte contient les fiches de Karim, pas celles des autres
nextOut = (id) => ({ reply: "Je planifie un RDV demain à 10h avec Droguerie Al Amal.", action: "create_activity", client_id: id("Droguerie Al Amal"), kind: "rdv", date: "2026-12-01", time: "10:00", text: "Présenter le catalogue" });
r = await karim.req("POST", "/api/ai/assistant", { text: "Programme un rdv demain 10h avec Al Amal pour le catalogue", tz: 0 });
ok(r.status === 200 && r.data.action.type === "create_activity", "action rdv : " + JSON.stringify(r.data));
ok(r.data.action.client_id === amal && r.data.action.date === "2026-12-01" && r.data.action.time === "10:00" && r.data.action.client.name === "Droguerie Al Amal", "rdv détaillé");
const sys = last.messages[0].content;
ok(sys.includes("Droguerie Al Amal") && sys.includes("Garage Atlas") && !sys.includes("Hôtel Secret"), "le commercial ne voit que son portefeuille");
ok(sys.includes("Logiciel caisse") && !sys.includes(amal), "affaires dans le contexte, sans identifiants longs");
ok(last.messages.at(-1).content.includes("Al Amal"), "message de l'utilisateur transmis");

// 2. un client hors portefeuille (ou inventé) est refusé
nextOut = { reply: "J'ouvre la fiche.", action: "open_client", client_id: hidden };
r = await karim.req("POST", "/api/ai/assistant", { text: "ouvre hôtel secret" });
ok(r.status === 200 && r.data.action.type === "none", "fiche invisible refusée");
nextOut = { reply: "ok", action: "call", client_id: "invente-1234567" };
r = await karim.req("POST", "/api/ai/assistant", { text: "appelle x" });
ok(r.data.action.type === "none", "client inventé refusé");

// 3. le directeur voit tout
nextOut = (id) => ({ reply: "Voici la fiche.", action: "open_client", client_id: id("Hôtel Secret") });
r = await admin.req("POST", "/api/ai/assistant", { text: "ouvre hôtel secret" });
ok(r.data.action.type === "open_client" && r.data.action.client_id === hidden, "le directeur ouvre toute fiche");
ok(last.messages[0].content.includes("ÉQUIPE"), "le directeur reçoit l'activité de l'équipe");

// 4. pages autorisées selon le rôle
nextOut = { reply: "J'ouvre l'équipe.", action: "open_page", page: "team" };
r = await karim.req("POST", "/api/ai/assistant", { text: "ouvre l'équipe" });
ok(r.data.action.type === "none", "page équipe refusée au commercial");
r = await admin.req("POST", "/api/ai/assistant", { text: "ouvre l'équipe" });
ok(r.data.action.type === "open_page" && r.data.action.page === "team", "page équipe pour le directeur");
nextOut = { reply: "Agenda.", action: "open_page", page: "agenda" };
r = await karim.req("POST", "/api/ai/assistant", { text: "افتح الأجندة" });
ok(r.data.action.page === "agenda", "page agenda");

// 5. nouvelle fiche : doublon signalé
nextOut = { reply: "Je crée la fiche.", action: "create_client", name: "Garage Atlas", city: "Casablanca", phone: "0522", client_kind: "client" };
r = await karim.req("POST", "/api/ai/assistant", { text: "nouveau client garage atlas" });
ok(r.data.action.type === "create_client" && r.data.action.similar.length === 1 && r.data.action.similar[0].id === atlas, "doublon signalé");

// 6. affaire + changement d'étape
nextOut = (id) => ({ reply: "Affaire créée.", action: "create_deal", client_id: id("Droguerie Al Amal"), title: "Peinture", amount: "15 000 MAD", stage: "devis", date: "2026-12-20" });
r = await karim.req("POST", "/api/ai/assistant", { text: "affaire peinture 15000 pour al amal" });
ok(r.data.action.type === "create_deal" && r.data.action.amount === 15000 && r.data.action.stage === "devis", "affaire : " + JSON.stringify(r.data.action));
nextOut = (id, sys) => ({ reply: "Je passe l affaire en gagnée.", action: "deal_stage", deal_id: sys.split("\n").find((x) => x.includes("| Logiciel caisse |")).split(" | ")[0], stage: "gagne" });
r = await karim.req("POST", "/api/ai/assistant", { text: "logiciel caisse gagnée" });
ok(r.data.action.type === "deal_stage" && r.data.action.deal.title === "Logiciel caisse" && r.data.action.stage === "gagne", "changement d'étape");
nextOut = { reply: "x", action: "deal_stage", deal_id: dealId, stage: "n'importe" };
r = await karim.req("POST", "/api/ai/assistant", { text: "x" });
ok(r.data.action.type === "none", "étape invalide refusée");

// 7. réponse en texte libre (sans json_schema) et historique
nextOut = '{"reply":"Vous avez 1 rendez-vous.","action":"none"}';
r = await karim.req("POST", "/api/ai/assistant", { text: "j'ai quoi demain ?", history: [{ role: "user", content: "bonjour" }, { role: "assistant", content: "Salut" }, { role: "system", content: "pirate" }] });
ok(r.data.reply === "Vous avez 1 rendez-vous." && r.data.action.type === "none", "réponse simple");
ok(last.messages.length === 4 && last.messages[2].role === "assistant" && !last.messages.some((m, i) => i > 0 && m.role === "system"), "historique nettoyé");
nextOut = "je ne sais pas";
r = await karim.req("POST", "/api/ai/assistant", { text: "???" });
ok(r.status === 502, "réponse illisible → erreur claire");
r = await karim.req("POST", "/api/ai/assistant", { text: "   " });
ok(r.status === 400, "message vide refusé");

// 7b. modèle léger d'abord, Llama 70B en secours ; format « choices » + <think> ; limite gratuite
let models = [];
const realRun = env.AI.run;
env.AI.run = async (model, input) => { models.push(model); return realRun(model, input); };
nextOut = { reply: "Bonjour !", action: "none" };
models = []; r = await karim.req("POST", "/api/ai/assistant", { text: "salut" });
ok(r.data.reply === "Bonjour !" && models.length === 1 && models[0].includes("qwen"), "modèle léger utilisé d'abord : " + models.join());
env.AI.run = async (model, input) => { models.push(model); if (model.includes("qwen")) return { response: "bla bla" }; return realRun(model, input); };
models = []; r = await karim.req("POST", "/api/ai/assistant", { text: "salut" });
ok(r.data.reply === "Bonjour !" && models.some((m) => m.includes("llama")), "secours Llama si réponse illisible");
env.AI.run = async (model, input) => ({ choices: [{ message: { content: '<think>hmm</think>\n{"reply":"Salam","action":"none"}' } }] });
r = await karim.req("POST", "/api/ai/assistant", { text: "salam" });
ok(r.status === 200 && r.data.reply === "Salam", "format choices + <think> compris");
env.AI.run = async (model) => { if (model.includes("whisper")) throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); };
r = await karim.req("POST", "/api/ai/assistant", { text: "salam" });
ok(r.status === 429 && /limite gratuite/.test(r.data.error), "limite gratuite : message clair " + JSON.stringify(r.data));
r = await karim.req("POST", "/api/ai/listen", new TextEncoder().encode("x".repeat(900)), { "Content-Type": "audio/webm" });
ok(r.status === 429, "limite gratuite sur le micro");
env.AI.run = realRun;
r = await admin.req("GET", "/api/stats");
ok(r.data.ai_usage && r.data.ai_usage.assistant >= 10, "compteur d'utilisation IA : " + JSON.stringify(r.data.ai_usage));

// 9. Magi plus complet : mode d'emploi, activités, fiche ouverte, nouvelles actions, suggestions
const taskId = uuid(), rdvId = uuid();
await karim.req("PUT", "/api/visits/" + taskId, { client_id: amal, kind: "tache", status: "planned", date: Date.now() - 2 * 86400000, summary: "Envoyer le devis peinture" });
await karim.req("PUT", "/api/visits/" + rdvId, { client_id: atlas, kind: "rdv", status: "planned", date: Date.now() + 86400000, next_step: "Démo caisse" });
await karim.req("PUT", "/api/clients/" + amal, { notes: "Client exigeant sur les délais" });
const line = (sys, needle) => sys.split("\n").find((x) => x.includes(needle)) || "";
nextOut = (id, sys) => ({ reply: "ok", action: "none", suggestions: ["Planifier une visite", "Voir le pipeline", "x".repeat(200), "4e"] });
r = await karim.req("POST", "/api/ai/assistant", { text: "comment j'importe des clients ?", client_id: amal });
let sys2 = last.messages[0].content;
ok(sys2.includes("MODE D'EMPLOI") && sys2.includes("import de clients"), "mode d'emploi dans le contexte");
ok(sys2.includes("FICHE OUVERTE") && sys2.includes("Client exigeant sur les délais"), "fiche ouverte détaillée");
ok(/A\d+ \|.*tache \(EN RETARD\) \| Droguerie Al Amal/.test(sys2), "tâche en retard avec référence");
ok(r.data.suggestions.length === 3 && r.data.suggestions[2].length <= 90, "suggestions nettoyées");
nextOut = { reply: "Les commerciaux.", action: "guide", page: "team" };
r = await karim.req("POST", "/api/ai/assistant", { text: "import" });
ok(r.data.action.type === "guide" && !r.data.action.page, "guide : page direction refusée au commercial");
nextOut = { reply: "L'agenda.", action: "guide", page: "agenda" };
r = await karim.req("POST", "/api/ai/assistant", { text: "agenda ?" });
ok(r.data.action.type === "guide" && r.data.action.page === "agenda", "guide avec écran");
nextOut = (id, sys) => ({ reply: "2 clients.", action: "show_clients", client_ids: [line(sys, "| Droguerie Al Amal |").split(" | ")[0], line(sys, "| Garage Atlas |").split(" | ")[0], "C99", "inventé"] });
r = await karim.req("POST", "/api/ai/assistant", { text: "mes clients" });
ok(r.data.action.type === "show_clients" && r.data.action.clients.length === 2 && r.data.action.clients[0].name === "Droguerie Al Amal", "liste de fiches : " + JSON.stringify(r.data.action));
nextOut = (id, sys) => ({ reply: "Je marque la tâche comme faite.", action: "complete_activity", activity_id: line(sys, "Envoyer le devis peinture").split(" | ")[0] });
r = await karim.req("POST", "/api/ai/assistant", { text: "j'ai envoyé le devis" });
ok(r.data.action.type === "complete_activity" && r.data.action.activity_id === taskId && r.data.action.activity.client === "Droguerie Al Amal", "terminer une tâche");
nextOut = (id, sys) => ({ reply: "Je déplace.", action: "reschedule", activity_id: line(sys, "Démo caisse").split(" | ")[0], date: "2026-12-05", time: "15:30" });
r = await karim.req("POST", "/api/ai/assistant", { text: "décale la démo au 5 décembre 15h30" });
ok(r.data.action.type === "reschedule" && r.data.action.activity_id === rdvId && r.data.action.date === "2026-12-05" && r.data.action.time === "15:30", "déplacer un rdv");
nextOut = (id, sys) => ({ reply: "x", action: "reschedule", activity_id: line(sys, "Démo caisse").split(" | ")[0], date: "" });
r = await karim.req("POST", "/api/ai/assistant", { text: "x" });
ok(r.data.action.type === "none", "déplacement sans date refusé");
nextOut = (id) => ({ reply: "Je mets à jour.", action: "update_client", client_id: id("Droguerie Al Amal"), phone: "0661 99 88 77", email: "contact@alamal.ma", notes: "Préfère WhatsApp", name: "pirate" });
r = await karim.req("POST", "/api/ai/assistant", { text: "nouveau numéro pour al amal" });
ok(r.data.action.type === "update_client" && r.data.action.changes.phone === "0661 99 88 77" && r.data.action.changes.email && !r.data.action.changes.name && r.data.action.current.phone === "0661223344", "modifier une fiche : " + JSON.stringify(r.data.action));
nextOut = (id) => ({ reply: "Message de suivi.", action: "followup", client_id: id("Garage Atlas") });
r = await karim.req("POST", "/api/ai/assistant", { text: "message de suivi atlas" });
ok(r.data.action.type === "followup" && r.data.action.client_id === atlas, "message de suivi");

// 8. écoute (micro) + sans connexion
r = await karim.req("POST", "/api/ai/listen", new TextEncoder().encode("Programme un rendez-vous demain"), { "Content-Type": "audio/webm", "X-Lang": "fr" });
ok(r.status === 200 && r.data.text === "Programme un rendez-vous demain", "transcription du micro");
ok((await new Agent().req("POST", "/api/ai/assistant", { text: "x" })).status === 401, "assistant réservé aux connectés");
const saved = env.AI; env.AI = undefined;
r = await karim.req("POST", "/api/ai/assistant", { text: "x" });
ok(r.status === 503, "sans service IA : 503");
env.AI = saved;

console.log(`${pass} réussis, ${failN} échoués`);
server.close();
process.exit(failN ? 1 : 0);
