// Environnement local de test : SQLite (à la place de D1) et mémoire (à la place de R2)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a.map((v) => (v === undefined ? null : v))); }
  async first() { const r = this.db.prepare(this.sql).get(...this.args); return r ? { ...r } : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: r.changes } }; }
  _exec() { return this.db.prepare(this.sql).run(...this.args); }
}
export class D1 {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  }
  prepare(sql) { return new Stmt(this.db, sql); }
  async batch(stmts) {
    this.db.exec("BEGIN");
    try { const out = stmts.map((s) => s._exec()); this.db.exec("COMMIT"); return out; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
}
export class R2 {
  constructor() { this.m = new Map(); }
  async put(key, body, opts) {
    const buf = Buffer.from(await new Response(body).arrayBuffer());
    this.m.set(key, { buf, type: opts?.httpMetadata?.contentType });
    return { key, size: buf.length };
  }
  async get(key, opts) {
    const o = this.m.get(key);
    if (!o) return null;
    const b = opts?.range ? o.buf.subarray(opts.range.offset, opts.range.offset + opts.range.length) : o.buf;
    return { body: new Blob([b]).stream(), size: o.buf.length };
  }
  async delete(k) { for (const x of [].concat(k)) this.m.delete(x); }
}
