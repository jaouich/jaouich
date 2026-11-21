# مجلة جيري (Jerry Magazine) — Cloudflare Worker

Static pages (articles, stories, manga) in `public/` plus a tiny API (`src/worker.js`) for comments, weekly votes and newsletter sign-ups on D1.

- Content: `content/articles/*.md`, `content/stories/*.md` (front matter: title, section, date, excerpt, cover), `content/manga/<series>/NN.json` (panels drawn as SVG by `lib/art.mjs`), `content/vote.json` (weekly topics).
- Build: `node build.mjs` (writes `public/`, committed so Cloudflare needs no build step). Set `baseUrl` in `site.json` once the address is known (needed for the sitemap and share images).
- Test the API: `node tests/magazine.mjs`.
- Deploy: create a Worker in Cloudflare from this repo with **root directory `magazine`** and no build command; the D1 database is created on the first deploy. Set the Worker's production branch to the branch the daily task pushes to.
- Moderation (D1 console or the Cloudflare MCP): `UPDATE comments SET hidden = 1 WHERE id = ?`; subscribers are in `subscribers`; votes in `votes`.
- Everything here is produced with AI help; the About page and the footer say so.
