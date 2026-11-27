  // ---- prospects : magazine de la direction (admin ou droit « prospects »). Les fiches sont ajoutées directement dans la base par la veille.
  if (p === "/api/prospects" || p.startsWith("/api/prospects/")) {
    if (!(me.p.admin || me.p.prospects)) fail(403, "Accès refusé", "forbidden");
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS prospect_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL, company TEXT NOT NULL, city TEXT, sector TEXT, tag TEXT, signal TEXT, source_name TEXT, source_url TEXT, contact TEXT, status TEXT NOT NULL DEFAULT 'new', note TEXT, client_id TEXT, dedupe TEXT UNIQUE)").run();
    const PR_STATUS = ["new", "seen", "contacted", "converted", "archived"];
    if (p === "/api/prospects" && m === "GET") {
      const q = url.searchParams, where = ["1=1"], args = [];
      const st = q.get("status"), tg = q.get("tag"), s = (q.get("q") || "").trim().slice(0, 80);
      if (st && PR_STATUS.includes(st)) { where.push("status = ?"); args.push(st); }
      if (tg) { where.push("tag = ?"); args.push(tg.slice(0, 40)); }
      if (s) { const l = "%" + s + "%"; where.push("(company LIKE ? OR signal LIKE ? OR city LIKE ? OR sector LIKE ?)"); args.push(l, l, l, l); }
      const lim = Math.min(200, Math.max(1, Number(q.get("limit")) || 100)), off = Math.max(0, Number(q.get("offset")) || 0);
      const rows = await env.DB.prepare("SELECT id, created_at, company, city, sector, tag, signal, source_name, source_url, contact, status, note, client_id FROM prospect_posts WHERE " + where.join(" AND ") + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?").bind(...args, lim, off).all();
      const cnt = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM prospect_posts GROUP BY status").all();
      return json({ items: rows.results, counts: Object.fromEntries(cnt.results.map((r) => [r.status, r.n])) });
    }
    if (p === "/api/prospects/seen-all" && m === "POST") {
      const r = await env.DB.prepare("UPDATE prospect_posts SET status = 'seen' WHERE status = 'new'").run();
      await log("prospect.seen_all", "prospect", "-", String((r.meta && r.meta.changes) || 0));
      return json({ ok: true });
    }
    const pm = p.match(/^\/api\/prospects\/(\d+)\/(status|convert)$/);
    if (pm && m === "POST") {
      const pid = Number(pm[1]);
      const row = await env.DB.prepare("SELECT * FROM prospect_posts WHERE id = ?").bind(pid).first();
      if (!row) fail(404, "Prospect introuvable", "not_found");
      if (pm[2] === "status") {
        const b = await req.json().catch(() => ({}));
        if (!PR_STATUS.includes(b.status) || b.status === "converted") fail(400, "Statut invalide", "bad_status");
        await env.DB.prepare("UPDATE prospect_posts SET status = ? WHERE id = ?").bind(b.status, pid).run();
        await log("prospect.status", "prospect", String(pid), b.status);
        return json({ ok: true });
      }
      if (row.client_id) fail(409, "Fiche déjà créée", "exists");
      const cid = crypto.randomUUID(), code = await nextCode(env, "prospect"), t0 = now();
      const contact = String(row.contact || "");
      const mail = (contact.match(/[^\s,;]+@[^\s,;]+/) || [null])[0];
      const tel = contact.replace(mail || "", "").trim().slice(0, 40) || null;
      const notes = [row.signal, row.source_url ? "Source : " + row.source_url : null, "Magazine prospects du " + new Date(row.created_at).toISOString().slice(0, 10)].filter(Boolean).join("\n").slice(0, 2000);
      await env.DB.prepare("INSERT INTO clients (id, code, name, kind, company, phone, email, city, sector, notes, owner_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(cid, code, String(row.company).slice(0, 200), "prospect", String(row.company).slice(0, 200), tel, mail, row.city || null, row.sector || null, notes, me.id, me.id, t0, t0).run();
      await env.DB.prepare("UPDATE prospect_posts SET status = 'converted', client_id = ? WHERE id = ?").bind(cid, pid).run();
      await log("prospect.convert", "prospect", String(pid), code + " " + row.company);
      return json({ ok: true, client_id: cid, code });
    }
    fail(404, "Introuvable", "not_found");
  }
