import { db } from "../db.ts";
import type { LatLng } from "./places.ts";

// O servidor web lê o mesmo SQLite em que o CronJob escreve: espera o lock em
// vez de falhar com SQLITE_BUSY no meio de uma rodada.
db.exec("PRAGMA busy_timeout = 5000;");

db.exec(`
  CREATE TABLE IF NOT EXISTS geocache (
    query TEXT PRIMARY KEY,
    lat   REAL,
    lng   REAL,
    at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS snapshots (
    key  TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    at   TEXT NOT NULL
  );
`);

/** undefined = nunca consultado; null = consultado e sem resultado. */
export function cachedCoord(query: string): LatLng | null | undefined {
  const row = db
    .query<{ lat: number | null; lng: number | null }, [string]>(
      "SELECT lat, lng FROM geocache WHERE query = ?",
    )
    .get(query);
  if (!row) return undefined;
  return row.lat === null || row.lng === null
    ? null
    : { lat: row.lat, lng: row.lng };
}

/**
 * Geocache inteiro num Map, numa query só. O catálogo resolve um pino por
 * evento: um SELECT por evento (N+1) era mais da metade do buildCatalog.
 */
export function allCoords(): Map<string, LatLng | null> {
  const rows = db
    .query<{ query: string; lat: number | null; lng: number | null }, []>(
      "SELECT query, lat, lng FROM geocache",
    )
    .all();
  return new Map(
    rows.map((r) => [
      r.query,
      r.lat === null || r.lng === null ? null : { lat: r.lat, lng: r.lng },
    ]),
  );
}

export function cacheCoord(query: string, coord: LatLng | null): void {
  db.prepare(
    "INSERT OR REPLACE INTO geocache (query, lat, lng, at) VALUES (?, ?, ?, ?)",
  ).run(
    query,
    coord?.lat ?? null,
    coord?.lng ?? null,
    new Date().toISOString(),
  );
}

export function saveSnapshot(key: string, value: unknown): void {
  db.prepare(
    "INSERT OR REPLACE INTO snapshots (key, json, at) VALUES (?, ?, ?)",
  ).run(key, JSON.stringify(value), new Date().toISOString());
}

export function loadSnapshot<T>(key: string): { value: T; at: string } | null {
  const row = db
    .query<{ json: string; at: string }, [string]>(
      "SELECT json, at FROM snapshots WHERE key = ?",
    )
    .get(key);
  return row ? { value: JSON.parse(row.json) as T, at: row.at } : null;
}
