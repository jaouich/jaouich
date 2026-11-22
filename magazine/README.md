# مجلة جيري (Jerry Magazine) — Cloudflare Worker

Static pages (articles, stories, manga) in `public/` plus a tiny API (`src/worker.js`) for comments, weekly votes and newsletter sign-ups on D1.

- Content: `content/articles/*.md`, `content/stories/*.md` (front matter: title, section, date, excerpt, cover), `content/manga/<series>/NN.json` (panels drawn as SVG by `lib/art.mjs`), `content/vote.json` (weekly topics).
- Build: `node build.mjs` (writes `public/`, committed so Cloudflare needs no build step). Set `baseUrl` in `site.json` once the address is known (needed for the sitemap and share images).
- Test the API: `node tests/magazine.mjs`.
- Deploy: create a Worker in Cloudflare from this repo with **root directory `magazine`** and no build command; the D1 database is created on the first deploy. Set the Worker's production branch to the branch the daily task pushes to.
- Moderation (D1 console or the Cloudflare MCP): `UPDATE comments SET hidden = 1 WHERE id = ?`; subscribers are in `subscribers`; votes in `votes`.
- Everything here is produced with AI help; the About page and the footer say so.

## English video courses
- Lessons are JSON files in `courses/<course>/NN.json` (slides with `say` narration, `scene` art, `pts` bullet points). `node courses/make.mjs all` renders each into `public/courses/<course>/NN.mp4` (slides, silent), `.srt` (subtitles timed to the narration) and `.txt` (title, description, hashtags and the voice-over script). `node build.mjs` then builds the pages (keeps the rendered files).
- There is no text-to-speech engine in the build environment, so the videos are silent with subtitles and a timed script (about 150 words per minute); the owner records the voice or uses a TTS tool when publishing to YouTube/Facebook.

## Documentaries (Arabic + English)
`docs/<slug>.json` holds one episode with both languages (`slides[].en` / `.ar`). `node courses/make.mjs doc:<slug>` (or `doc:all`) renders `public/docs/<slug>/{en,ar}.{mp4,srt,txt}`; `node build.mjs` builds `/docs/`. Silent videos with subtitles and a timed voice-over script (no text-to-speech engine in the build environment).

## Protecting the videos (owner-only downloads)
- The player pages have no download buttons (`controlsList="nodownload"`, no right-click menu). `.mp4`, `.srt` and `.txt` under `/courses/` and `/docs/` run through the Worker (`run_worker_first` in `wrangler.toml`): a video is only served when the request comes from the page's own `<video>` (`Sec-Fetch-Dest: video`, `Sec-Fetch-Site: same-origin`), subtitles only to the `<track>`, and the `.txt` scripts never.
- The owner downloads with the Cloudflare secret **`OWNER_KEY`** (Worker → Settings → Variables and Secrets → add a *Secret*; choose a long random value and never share it): open `/api/owner?key=<OWNER_KEY>` for the list of files. With no `OWNER_KEY` set, nobody can download.
- Honest limit: anything a browser can play can be copied by a determined person (screen recording, scripts that fake the headers). This stops casual saving, direct links, hotlinking and bots.
