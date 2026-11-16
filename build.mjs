// Construit dist/worker.js : un seul fichier qui contient le serveur ET la page.
// Usage : node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const assets = {
  "/": { type: "text/html; charset=utf-8", body: read("./public/index.html") },
  "/app.js": { type: "text/javascript; charset=utf-8", body: read("./public/app.js") },
  "/app.css": { type: "text/css; charset=utf-8", body: read("./public/app.css") },
  "/icon.svg": { type: "image/svg+xml", body: read("./public/icon.svg") },
  "/icon.png": { type: "image/png", b64: readFileSync(new URL("./public/icon.png", import.meta.url)).toString("base64") },
  "/logo.png": { type: "image/png", b64: readFileSync(new URL("./public/logo.png", import.meta.url)).toString("base64") },
};
const src = read("./src/worker.js");
if (!src.includes("__ASSETS__")) throw new Error("marqueur __ASSETS__ absent");
mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("./dist/worker.js", import.meta.url), src.replace("__ASSETS__", JSON.stringify(assets)));
console.log("dist/worker.js prêt");
