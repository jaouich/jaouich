// Magiscom CRM : fonctionnement hors ligne (application + photos déjà vues)
const SHELL = "crm-shell-v2", FILES = "crm-files-v1";
const SHELL_URLS = ["/", "/app.js", "/app.css", "/manifest.webmanifest", "/icon-192.png",
  "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css", "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_URLS.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => ![SHELL, FILES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // photos des fiches : gardées pour être revues sans réseau
  if (url.origin === location.origin && /^\/api\/files\/[^/]+$/.test(url.pathname) && !req.headers.get("range") && !url.search) {
    e.respondWith(caches.open(FILES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && /^image\//.test(res.headers.get("content-type") || "") && Number(res.headers.get("content-length") || 0) < 4e6) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(SHELL).then((c) => c.put("/", r.clone())); return r; }).catch(() => caches.match("/")));
    return;
  }
  // l'application elle-même : toujours la dernière version quand il y a du réseau, la copie locale sinon
  if (url.origin === location.origin && SHELL_URLS.includes(url.pathname)) {
    e.respondWith(Promise.race([
      fetch(req, { cache: "no-cache" }).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(SHELL).then((c) => c.put(req, cp)); } return r; }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("lent")), 4000)),
    ]).catch(() => caches.match(req).then((hit) => hit || fetch(req))));
    return;
  }
  if (SHELL_URLS.includes(url.href) || SHELL_URLS.includes(url.pathname) || url.hostname.endsWith("tile.openstreetmap.org")) {
    e.respondWith(caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => { if (r.ok || r.type === "opaque") caches.open(url.hostname.includes("openstreetmap") ? FILES : SHELL).then((c) => c.put(req, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
