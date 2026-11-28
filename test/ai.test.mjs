// Tests de l'IA (transcription + réunion) avec un faux service Workers AI : node test/ai.test.mjs
import { start } from "./server.mjs";

const { server, env } = await start(8798);
const B = "http://localhost:8798";
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else { failN++; console.log("ÉCHEC:", m); } };
const calls = [];
// faux Workers AI : l'« audio » de test contient directement le texte prononcé
env.AI = {
  async run(model, input) {
    calls.push({ model, input });
    if (model.includes("whisper")) {
      const text = Buffer.from(input.audio, "base64").toString("utf8");
      if (text.startsWith("PANNE")) throw new Error("service indisponible");
      return { text, segments: text.split(/(?<=[.?!])\s+/).map((t) => ({ text: t })) };
    }
    const schema = input.response_format && input.response_format.json_schema;
    if (schema && schema.properties.lines) {
      const segs = input.messages[1].content.split("\n").map((l) => l.replace(/^\d+\.\s*/, ""));
      return { response: { lines: segs.map((t, i) => ({ s: i % 2 ? "Client" : "Commercial", t })) } };
    }
    if (schema && schema.properties.a_savoir) return { response: { resume: "Client fidèle, attend le catalogue.", a_savoir: ["Préfère le matin"], en_attente: ["Catalogue peinture"], a_proposer: ["Remise volume"], questions: ["Quel budget ?"] } };
    if (schema && schema.properties.objet) return { response: { objet: "Suite à notre rencontre", message: "Bonjour, merci pour votre accueil. Comme convenu : 40 rouleaux. Karim" } };
    return { response: JSON.stringify({ resume: "Le client commande 40 rouleaux.", convenu: "- 40 rouleaux de câble", non_fait: "- Peinture en attente", demandes: "- Catalogue 2027", prochaine_etape: "Envoyer le catalogue", prochaine_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) }) };
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
const admin = new Agent();
await admin.req("POST", "/api/setup", { login: "direction", password: "motdepasse1", name: "Direction", company: "Magiscom Tech" });
const uuid = () => crypto.randomUUID();

// --- fiche client : nouveaux champs
const cid = uuid();
let r = await admin.req("PUT", "/api/clients/" + cid, { name: "Droguerie Al Amal", kind: "client", company: "Al Amal SARL", sector: "Quincaillerie", phone: "0661 22 33 44", phone2: "0523 31 22 10", email: "contact@alamal.ma", website: "alamal.ma", address: "12 Bd Hassan II", city: "Mohammedia", notes: "Préfère être appelé le matin" });
ok(r.status === 201 && r.data.client.company === "Al Amal SARL", "société enregistrée");
ok(r.data.client.website === "https://alamal.ma/", "site web complété : " + r.data.client.website);
r = await admin.req("PUT", "/api/clients/" + uuid(), { name: "X", website: "pas un site" });
ok(r.status === 400, "site web invalide refusé");

// --- note écrite
const nid = uuid();
r = await admin.req("PUT", "/api/visits/" + nid, { client_id: cid, kind: "note", status: "done", summary: "Rappeler pour la peinture" });
ok(r.status === 201 && r.data.visit.kind === "note" && r.data.visit.summary === "Rappeler pour la peinture", "note écrite");

// --- note vocale : un morceau, transcrit à l'envoi
const vid = uuid();
r = await admin.req("PUT", "/api/visits/" + vid, { client_id: cid, kind: "vocal", status: "done", ai_status: "pending", lang: "fr", duration: 12 });
ok(r.status === 201 && r.data.visit.ai_status === "pending", "note vocale créée");
const audio1 = new TextEncoder().encode("Passage chez le client. Il veut un devis pour la peinture.");
r = await admin.req("PUT", "/api/files/" + uuid(), audio1, { "Content-Type": "audio/webm", "X-Client-Id": cid, "X-Visit-Id": vid, "X-File-Name": "note.webm", "X-Category": "audio", "X-Seq": "1", "X-Transcribe": "vocal", "X-Lang": "fr" });
ok(r.status === 201 && r.data.file.transcript.startsWith("Passage chez le client"), "morceau transcrit dès l'envoi");
ok(calls.find((c) => c.model.includes("whisper")).input.language === "fr", "langue transmise à Whisper");
r = await admin.req("POST", "/api/ai/process/" + vid, { lang: "fr" });
ok(r.status === 200 && r.data.visit.ai_status === "done" && r.data.visit.transcript.includes("devis pour la peinture"), "note vocale : texte dans la fiche");

// --- réunion : 2 morceaux, intervenants + compte-rendu
const mid = uuid();
await admin.req("PUT", "/api/visits/" + mid, { client_id: cid, kind: "reunion", status: "done", ai_status: "pending", lang: "fr", duration: 360 });
const chunks = ["Bonjour Monsieur Tazi. Bonjour, la dernière livraison était lente. Nous livrons en 48 heures.", "Alors je prends 40 rouleaux. Parfait, je vous envoie le catalogue."];
for (let i = 0; i < chunks.length; i++) {
  r = await admin.req("PUT", "/api/files/" + uuid(), new TextEncoder().encode(chunks[i]), { "Content-Type": "audio/webm", "X-Client-Id": cid, "X-Visit-Id": mid, "X-File-Name": `reunion-${i + 1}.webm`, "X-Category": "audio", "X-Seq": String(i + 1), "X-Transcribe": "reunion", "X-Lang": "fr" });
  ok(r.status === 201 && r.data.file.dialogue, "morceau " + (i + 1) + " : répliques séparées");
}
r = await admin.req("POST", "/api/ai/process/" + mid, { lang: "fr" });
const mv = r.data.visit;
ok(r.status === 200 && mv.ai_status === "done", "réunion analysée " + JSON.stringify(mv && mv.ai_error));
ok(mv.transcript.startsWith("Commercial : Bonjour Monsieur Tazi.") && mv.transcript.includes("\nClient : "), "transcription avec intervenants");
ok(mv.summary === "Le client commande 40 rouleaux." && mv.agreed.includes("40 rouleaux") && mv.demands.includes("Catalogue"), "compte-rendu structuré");
ok(mv.next_date > Date.now(), "date de relance reprise");
r = await admin.req("GET", "/api/sync");
ok(r.data.visits.some((v) => v.id === mid.slice(0, 36) + "-r" && v.status === "planned" && v.kind === "rdv"), "rendez-vous ajouté à l'agenda");
ok(r.data.files.filter((f) => f.category === "audio").every((f) => typeof f.transcript === "string"), "transcriptions synchronisées");

// --- envoi hors ligne : morceau arrivé sans transcription -> transcrit lors de l'analyse
const oid = uuid();
await admin.req("PUT", "/api/visits/" + oid, { client_id: cid, kind: "vocal", status: "done", ai_status: "pending" });
await admin.req("PUT", "/api/files/" + uuid(), new TextEncoder().encode("Texte envoyé plus tard."), { "Content-Type": "audio/mp4", "X-Client-Id": cid, "X-Visit-Id": oid, "X-File-Name": "n.m4a", "X-Category": "audio" });
r = await admin.req("POST", "/api/ai/process/" + oid, {});
ok(r.data.visit.transcript === "Texte envoyé plus tard.", "transcription rattrapée à l'analyse");

// --- panne de l'IA : l'activité garde l'audio, statut « erreur », pas de blocage
const pid = uuid();
await admin.req("PUT", "/api/visits/" + pid, { client_id: cid, kind: "vocal", status: "done", ai_status: "pending" });
r = await admin.req("PUT", "/api/files/" + uuid(), new TextEncoder().encode("PANNE totale"), { "Content-Type": "audio/webm", "X-Client-Id": cid, "X-Visit-Id": pid, "X-File-Name": "p.webm", "X-Category": "audio", "X-Transcribe": "vocal" });
ok(r.status === 201 && r.data.file.transcript == null, "envoi accepté même si l'IA est en panne");
r = await admin.req("POST", "/api/ai/process/" + pid, {});
ok(r.status === 200 && r.data.visit.ai_status === "error" && /indisponible/.test(r.data.visit.ai_error), "erreur signalée proprement");
r = await admin.req("POST", "/api/ai/process/" + nid, {});
ok(r.status === 400, "rien à analyser sur une note écrite");

// --- droits : un autre commercial ne peut pas lancer l'analyse
r = await admin.req("POST", "/api/users", { name: "Karim", login: "karim", password: "karimpass1", perms: { scope: "all" } });
const k = new Agent();
await k.req("POST", "/api/auth/login", { login: "karim", password: "karimpass1" });
r = await k.req("POST", "/api/ai/process/" + mid, {});
ok(r.status === 403, "analyse réservée à l'auteur");

// --- export
r = await admin.req("GET", "/api/export/visits.xlsx");
ok(r.status === 200, "export des activités");

// --- affaires (pipeline)
const did = uuid();
r = await admin.req("PUT", "/api/deals/" + did, { client_id: cid, title: "Câblage trimestriel", amount: 18500, stage: "devis", close_date: Date.now() + 10 * 86400000 });
ok(r.status === 201 && r.data.deal.stage === "devis" && r.data.deal.amount === 18500, "affaire créée");
const pc = uuid();
await admin.req("PUT", "/api/clients/" + pc, { name: "Prospect Gagné", kind: "prospect" });
r = await admin.req("PUT", "/api/deals/" + uuid(), { client_id: pc, title: "Première commande", amount: 5000, stage: "nouveau" });
r = await admin.req("PUT", "/api/deals/" + r.data.deal.id, { stage: "gagne" });
ok(r.data.deal.closed_at > 0, "affaire gagnée datée");
r = await admin.req("GET", "/api/sync");
ok(r.data.clients.find((c) => c.id === pc).kind === "client", "affaire gagnée : le prospect devient client");
ok(r.data.deals.length === 2, "affaires synchronisées");
r = await admin.req("GET", "/api/stats");
ok(r.data.pipeline.some((x) => x.stage === "devis" && x.amount === 18500), "pipeline au tableau de bord");
r = await admin.req("GET", "/api/export/deals.xlsx");
ok(r.status === 200, "export des affaires");
r = await admin.req("PUT", "/api/deals/" + uuid(), { client_id: cid, title: "x" });
ok(r.status === 400, "objet trop court refusé");

// --- tâche
r = await admin.req("PUT", "/api/visits/" + uuid(), { client_id: cid, kind: "tache", status: "planned", date: Date.now() + 86400000, summary: "Envoyer le devis" });
ok(r.status === 201 && r.data.visit.kind === "tache", "tâche créée");

// --- import (codes existants mis à jour, nouveaux créés)
r = await admin.req("POST", "/api/clients/import", { kind: "client", rows: [{ code: "CLI001", name: "Société Import Un", phone: "0522 11 22 33", city: "Rabat" }, { code: "CLI001", name: "Société Import Un", website: "import-un.ma" }, { name: "Sans Code SARL", email: "pas-un-email" }, { code: "X2" }] });
ok(r.data.created === 2 && r.data.updated === 1 && r.data.errors.length === 1, "import : " + JSON.stringify(r.data));
r = await admin.req("GET", "/api/sync");
const imp = r.data.clients.find((c) => c.code === "CLI001");
ok(imp && imp.kind === "client" && imp.website === "https://import-un.ma/" && imp.phone === "0522 11 22 33", "import : fiche complétée");
ok(r.data.clients.find((c) => c.name === "Sans Code SARL").email == null, "import : e-mail invalide ignoré");
// un commercial importe dans son propre portefeuille, sans toucher aux fiches des autres
const kme = (await k.req("GET", "/api/me")).data.user;
const others = (await admin.req("GET", "/api/users")).data.users.filter((u) => u.id !== kme.id);
r = await k.req("POST", "/api/clients/import", { owner_id: others[0].id, rows: [{ code: "KIM01", name: "Import Karim Un" }, { name: "Import Karim Deux", city: "Fès" }, { code: "CLI001", name: "Piratage", phone: "000" }] });
ok(r.status === 200 && r.data.created === 2 && r.data.updated === 0 && r.data.errors.length === 1 && /ne pouvez pas modifier/.test(r.data.errors[0].error), "import commercial : " + JSON.stringify(r.data));
r = await admin.req("GET", "/api/sync");
const ki = r.data.clients.filter((c) => /^Import Karim/.test(c.name));
ok(ki.length === 2 && ki.every((c) => c.owner_id === kme.id), "import commercial : fiches à son nom");
ok(r.data.clients.find((c) => c.code === "CLI001").phone === "0522 11 22 33", "import commercial : fiche d'un autre intacte");
r = await k.req("POST", "/api/clients/import", { rows: [{ code: "KIM01", name: "Import Karim Un", phone: "0661" }] });
ok(r.data.updated === 1, "import commercial : met à jour sa propre fiche");
const big = Array.from({ length: 300 }, (_, i) => ({ name: "Société en masse numéro " + i, phone: "0522 00 00 " + String(i).padStart(3, "0"), email: "contact" + i + "@exemple-tres-long-pour-le-test.ma", address: "Rue très longue numéro " + i + ", quartier industriel, Casablanca", city: "Casablanca" }));
r = await k.req("POST", "/api/clients/import", { rows: big });
ok(r.status === 200 && r.data.created === 300, "import de 300 lignes d'un coup : " + r.status);

// --- préparer la visite + message de suivi
r = await admin.req("POST", "/api/ai/brief/" + cid, { lang: "fr" });
ok(r.status === 200 && r.data.brief.en_attente[0] === "Catalogue peinture", "fiche de préparation de visite");
const lastPrompt = calls[calls.length - 1].input.messages[1].content;
ok(lastPrompt.includes("Câblage trimestriel") && lastPrompt.includes("Le client commande 40 rouleaux"), "la préparation utilise affaires et historique");
r = await admin.req("POST", "/api/ai/followup/" + mid, { channel: "whatsapp", lang: "fr" });
ok(r.status === 200 && r.data.message.includes("40 rouleaux") && r.data.phone === "0661 22 33 44", "message de suivi WhatsApp");
r = await admin.req("POST", "/api/ai/followup/" + mid, { channel: "email" });
ok(r.data.channel === "email" && r.data.email === "contact@alamal.ma", "message de suivi e-mail");

// --- sans IA configurée
const keep = env.AI; delete env.AI;
r = await admin.req("POST", "/api/ai/process/" + mid, {});
ok(r.status === 503, "message clair si l'IA n'est pas activée");
env.AI = keep;

console.log(`${pass} réussis, ${failN} échoués`);
server.close();
process.exit(failN ? 1 : 0);
