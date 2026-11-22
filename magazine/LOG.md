# مجلة جيري — سجل النشر (Jerry Magazine publishing log)
Site: https://jaouich6.wordpress.com (blog id 257964560). Daily scheduled task: "مجلة جيري: النشر اليومي" (trig_01QX91qmSj9DpjmunkMpgq7Z, 11:41 Africa/Casablanca). To stop it: disable that scheduled task.

- 2026-11-21 | launch | site configured (Twenty Twenty-Five, Arabic), About page, 4 categories, welcome + vote post, "7 scam rules", "What is Pi Network" | https://jaouich6.wordpress.com/ | no problems
- 2026-11-21 | deploy | Cloudflare Worker jerry-magazine deployed, D1 jerry-magazine-db created, URL https://jerry-magazine.jaouich.workers.dev | WordPress site hidden, old WordPress task replaced
- 2026-11-22 | docs | 3 documentary episodes (Sahara, How the Internet Works, Ibn Battuta), Arabic + English, plus in-app Documentaries tab and daily manga notification | no problems
- 2026-11-22 | design | magazine layout v2: organised adaptive home (hero + latest, rails for manga/documentaries/courses, grid of posts, vote + newsletter), 3-column footer | no problems
- 2026-11-22 | security | videos are served only to the page's own player; downloads, subtitles and scripts need the owner key (OWNER_KEY secret, /api/owner?key=) | owner must set OWNER_KEY
