// db.ts — SQLite: quote/history/news cache + the watchlist.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let db: Database | null = null;

export function initDataDir(dir?: string): Database {
  const d = dir || process.env.BAOBAB_DATA || join(import.meta.dir, "..", "data");
  mkdirSync(d, { recursive: true });
  db = new Database(join(d, "baobab.db"));
  db.exec("PRAGMA journal_mode=WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      val TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS watchlist (
      sym TEXT PRIMARY KEY,
      added_at TEXT NOT NULL
    );
  `);
  return db;
}

export function getDb(): Database {
  if (!db) throw new Error("database not initialized");
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Read-through cache. Returns {val, stale} — stale when missing/expired. */
export function cacheGet(key: string, maxAgeMs: number): { val: any; stale: boolean } {
  const row = getDb().query("SELECT val, updated_at FROM kv WHERE key = ?").get(key) as any;
  if (!row) return { val: null, stale: true };
  let val: any = null;
  try { val = JSON.parse(row.val); } catch { /* corrupt */ }
  const stale = Date.now() - row.updated_at > maxAgeMs || val == null;
  return { val, stale };
}

export function cacheSet(key: string, val: any): void {
  getDb().query("INSERT INTO kv (key, val, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = excluded.updated_at")
    .run(key, JSON.stringify(val), Date.now());
}

export function watchlist(): string[] {
  return (getDb().query("SELECT sym FROM watchlist ORDER BY added_at ASC").all() as any[]).map((r) => r.sym);
}

export function watchAdd(sym: string): void {
  getDb().query("INSERT OR IGNORE INTO watchlist (sym, added_at) VALUES (?, ?)").run(sym, nowIso());
}

export function watchRemove(sym: string): boolean {
  return getDb().query("DELETE FROM watchlist WHERE sym = ?").run(sym).changes > 0;
}

/** Opaque server-side settings (API keys etc). Never exposed to the client. */
const skey = (k: string) => "setting:" + k;
export function getSetting(key: string): string | null {
  const row = getDb().query("SELECT val FROM kv WHERE key = ?").get(skey(key)) as any;
  if (!row) return null;
  try {
    const v = JSON.parse(row.val);
    return typeof v === "string" ? v : null;
  } catch { return null; }
}
export function setSetting(key: string, val: string | null): void {
  const db = getDb();
  if (val == null) db.query("DELETE FROM kv WHERE key = ?").run(skey(key));
  else db.query("INSERT INTO kv (key, val, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET val = excluded.val, updated_at = excluded.updated_at")
    .run(skey(key), JSON.stringify(val), Date.now());
}
