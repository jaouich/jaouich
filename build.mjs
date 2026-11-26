// Construit dist/worker.js : un seul fichier avec le serveur et l'application.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const b64 = (f) => readFileSync(new URL(f, import.meta.url)).toString("base64");
const assets = {
  "/": { type: "text/html; charset=utf-8", body: read("./public/index.html") },
  "/app.js": { type: "text/javascript; charset=utf-8", body: read("./public/app.js") },
  "/app.css": { type: "text/css; charset=utf-8", body: read("./public/app.css") },
  "/sw.js": { type: "text/javascript; charset=utf-8", body: read("./public/sw.js") },
  "/manifest.webmanifest": { type: "application/manifest+json", body: read("./public/manifest.webmanifest") },
};
for (const f of ["icon-192.png", "icon-512.png", "logo.png"]) if (existsSync(new URL("./public/" + f, import.meta.url))) assets["/" + f] = { type: "image/png", b64: b64("./public/" + f) };
const src = read("./src/worker.js");
if (!src.includes("__ASSETS__")) throw new Error("marqueur __ASSETS__ absent");
mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("./dist/worker.js", import.meta.url), src.replace("__ASSETS__", JSON.stringify(assets)));
console.log("dist/worker.js prêt");
