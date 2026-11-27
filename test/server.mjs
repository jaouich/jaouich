// Serveur local : node test/server.mjs  →  http://localhost:8787
import http from "node:http";
import { Readable } from "node:stream";
import worker from "../dist/worker.js";
import { D1, R2 } from "./env.mjs";

export function start(port = 8787) {
  const sent = [];
  const env = { DB: new D1(), MEDIA: new R2(), APP_URL: "https://terrain.example" };
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  env.__sent = sent; env.__flush = () => Promise.all(pending.splice(0));
  const server = http.createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const hasBody = !["GET", "HEAD"].includes(req.method);
    const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: "half" });
    // undici retire Content-Length : on le remet comme Cloudflare le fournit
    const resp = await worker.fetch(new Proxy(request, { get: (t, p) => (p === "headers" ? headers : typeof t[p] === "function" ? t[p].bind(t) : t[p]) }), env, ctx);
    const out = {};
    resp.headers.forEach((v, k) => { if (k !== "set-cookie") out[k] = v; });
    const cookies = resp.headers.getSetCookie();
    if (cookies.length) out["set-cookie"] = cookies;
    res.writeHead(resp.status, out);
    if (resp.body) Readable.fromWeb(resp.body).pipe(res); else res.end();
  });
  return new Promise((r) => server.listen(port, () => r({ server, env })));
}
if (import.meta.url === `file://${process.argv[1]}`) start().then(() => console.log("MAGISALESFORCE sur http://localhost:8787"));
