import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./config/env.ts";

mkdirSync(dirname(env.dbPath), { recursive: true });

export const db = new Database(env.dbPath, { create: true });
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    link        TEXT NOT NULL,
    source      TEXT NOT NULL,
    summary     TEXT,
    published   TEXT,
    fetched_at  TEXT NOT NULL,
    digested    INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_items_digested ON items(digested, fetched_at);
`);

export interface Item {
  id: string;
  title: string;
  link: string;
  source: string;
  summary: string | null;
  published: string | null;
  fetched_at: string;
  digested: number;
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO items (id, title, link, source, summary, published, fetched_at, digested)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`);

export function insertItem(row: Omit<Item, "digested">): boolean {
  const { changes } = insertStmt.run(
    row.id,
    row.title,
    row.link,
    row.source,
    row.summary,
    row.published,
    row.fetched_at,
  );
  return changes > 0;
}

export function pendingItems(limit: number): Item[] {
  return db
    .query<Item, [number]>(
      "SELECT * FROM items WHERE digested = 0 ORDER BY fetched_at DESC LIMIT ?",
    )
    .all(limit);
}

export function markDigested(ids: string[]): void {
  if (!ids.length) return;
  const stmt = db.prepare<unknown, [string]>(
    "UPDATE items SET digested = 1 WHERE id = ?",
  );
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}
