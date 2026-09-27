import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./config/env.ts";
import { norm, REGION_CITIES } from "./config/region.ts";

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
  CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    date         TEXT NOT NULL,
    time         TEXT,
    venue        TEXT,
    city         TEXT,
    price        TEXT,
    link         TEXT,
    image        TEXT,
    posted_today INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
  CREATE TABLE IF NOT EXISTS digest_runs (
    date  TEXT NOT NULL,
    block TEXT NOT NULL,
    PRIMARY KEY (date, block)
  );
`);

// Migrações: colunas adicionadas depois que bancos já existiam.
for (const sql of [
  "ALTER TABLE items ADD COLUMN image TEXT",
  "ALTER TABLE events ADD COLUMN trailer TEXT",
  "ALTER TABLE events ADD COLUMN end_date TEXT",
  "ALTER TABLE items ADD COLUMN body TEXT",
]) {
  try {
    db.exec(sql);
  } catch {
    // coluna já existe
  }
}

export interface Item {
  id: string;
  title: string;
  link: string;
  source: string;
  summary: string | null;
  published: string | null;
  image: string | null;
  fetched_at: string;
  digested: number;
  /** Texto da matéria original, buscado só para itens candidatos a evento. */
  body?: string | null;
}

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO items (id, title, link, source, summary, published, image, fetched_at, digested)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
`);

export function insertItem(row: Omit<Item, "digested" | "body">): boolean {
  const { changes } = insertStmt.run(
    row.id,
    row.title,
    row.link,
    row.source,
    row.summary,
    row.published,
    row.image,
    row.fetched_at,
  );
  return changes > 0;
}

/**
 * Título reduzido à sua forma canônica: sem acento, sem pontuação, sem a data
 * embutida ("Livre - 26/07") e sem o sufixo de cidade ("em Franca/SP"). É o que
 * faz o mesmo rolê vindo de Sympla, Duoticket, Evento ON e notícia virar UM
 * evento só, em vez de quatro posts quase idênticos.
 */
const canonicalTitle = (title: string) =>
  // norm() tira o acento ANTES do strip geral: sem isso "Família" viraria
  // "fam lia" (o combinante vira espaço) e não casaria com "Familia".
  norm(title)
    .replace(/\d{1,2}\s*[/-]\s*\d{1,2}(\s*[/-]\s*\d{2,4})?/g, " ")
    .replace(/\b(em|na|no)\s+franca\b|\bfranca\b|\bsp\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Identidade de um evento: título canônico + data. Só upsertEvent/rekey usam. */
export const eventId = (title: string, date: string) =>
  createHash("sha1")
    .update(`${canonicalTitle(title)}|${date}`)
    .digest("hex");

export interface Event {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  price: string | null;
  link: string | null;
  image: string | null;
  /** Só estreias de cinema têm — vem do Ingresso.com. */
  trailer: string | null;
  /** Último dia de evento de vários dias (festival, feira); null = um dia só. */
  end_date: string | null;
  posted_today: number;
  created_at: string;
}

const upsertEventStmt = db.prepare(`
  INSERT INTO events (id, title, date, time, venue, city, price, link, image, trailer, end_date, posted_today, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  ON CONFLICT(id) DO UPDATE SET
    time = COALESCE(excluded.time, time),
    venue = COALESCE(excluded.venue, venue),
    price = COALESCE(excluded.price, price),
    image = COALESCE(excluded.image, image),
    trailer = COALESCE(excluded.trailer, trailer),
    end_date = COALESCE(excluded.end_date, end_date)
`);

/**
 * Grava/atualiza um evento. O id é derivado aqui de propósito: quando a fonte
 * o calculava por fora, bastava usar uma string diferente da que ia em `title`
 * pra o mesmo evento renascer com outra chave a cada rodada.
 */
const CIDADE_CANONICA = new Map(REGION_CITIES.map((c) => [norm(c), c]));

/**
 * Cada fonte escreve a cidade do seu jeito ("Ribeirao Preto", "ribeirao preto",
 * "RIBEIRÃO PRETO"). Sem isto viram cidades diferentes na agenda.
 */
const cidadeCanonica = (city: string | null) =>
  city
    ? (CIDADE_CANONICA.get(norm(city).replace(/[\s/-]+sp$/, "")) ?? city)
    : null;

export function upsertEvent(
  // trailer é opcional: só a fonte de estreias de cinema tem o que informar.
  ev: Omit<
    Event,
    "id" | "posted_today" | "created_at" | "trailer" | "end_date"
  > & {
    trailer?: string | null;
    end_date?: string | null;
  },
): void {
  upsertEventStmt.run(
    eventId(ev.title, ev.date),
    ev.title,
    ev.date,
    ev.time,
    ev.venue,
    cidadeCanonica(ev.city),
    ev.price,
    ev.link,
    ev.image,
    ev.trailer ?? null,
    // Fim antes do início é lixo da fonte: trata como evento de um dia.
    ev.end_date && ev.end_date > ev.date ? ev.end_date : null,
    new Date().toISOString(),
  );
}

/**
 * Migração idempotente: reescreve os ids antigos (sha1 do título cru) para a
 * chave canônica, fundindo duplicatas. `posted_today` do grupo é preservado
 * como OR — evento já anunciado não volta pro Telegram.
 */
function rekeyEvents(): void {
  const rows = db
    .query<
      { id: string; title: string; date: string; posted_today: number },
      []
    >("SELECT id, title, date, posted_today FROM events")
    .all();
  if (!rows.length) return;
  const del = db.prepare<unknown, [string]>("DELETE FROM events WHERE id = ?");
  const upd = db.prepare<unknown, [string, number, string]>(
    "UPDATE events SET id = ?, posted_today = ? WHERE id = ?",
  );
  const keep = new Map<string, { id: string; posted: number }>();
  const tx = db.transaction(() => {
    for (const r of rows) {
      const nid = eventId(r.title, r.date);
      const cur = keep.get(nid);
      if (!cur) {
        keep.set(nid, { id: r.id, posted: r.posted_today });
        continue;
      }
      // Duplicata: fica a linha já escolhida, o flag de postado é o OR das duas.
      cur.posted = Math.max(cur.posted, r.posted_today);
      del.run(r.id);
    }
    // Sempre grava: o id pode não ter mudado, mas o flag fundido, sim.
    for (const [nid, k] of keep) upd.run(nid, k.posted, k.id);
  });
  tx();
  const merged = rows.length - keep.size;
  if (merged) console.log(`[db] ${merged} evento(s) duplicado(s) fundido(s)`);
}

rekeyEvents();

export function eventsOn(date: string): Event[] {
  return db
    .query<Event, [string]>(
      // Festival que começou antes e ainda não acabou também é "hoje".
      "SELECT * FROM events WHERE date <= ?1 AND COALESCE(end_date, date) >= ?1 ORDER BY time, title",
    )
    .all(date);
}

export function eventsBetween(from: string, to: string): Event[] {
  return db
    .query<Event, [string, string]>(
      "SELECT * FROM events WHERE date <= ?2 AND COALESCE(end_date, date) >= ?1 ORDER BY date, time, title",
    )
    .all(from, to);
}

export function markEventsPosted(ids: string[]): void {
  if (!ids.length) return;
  const stmt = db.prepare<unknown, [string]>(
    "UPDATE events SET posted_today = 1 WHERE id = ?",
  );
  const tx = db.transaction((list: string[]) => {
    for (const id of list) stmt.run(id);
  });
  tx(ids);
}

export function pruneEventsBefore(date: string): void {
  db.prepare("DELETE FROM events WHERE COALESCE(end_date, date) < ?").run(date);
}

/**
 * Remove eventos de cidades fora da lista pedida. Preserva city nula,
 * rótulos de cinema/streaming e notícias multi-cidade (ex.: "Ribeirão e Franca")
 * — filtra só quando a cidade é claramente uma cidade de fora.
 */
export function pruneDisallowedCities(allowedNormalized: string[]): void {
  const rows = db
    .query<{ id: string; city: string | null }, []>(
      "SELECT id, city FROM events",
    )
    .all();
  const del = db.prepare<unknown, [string]>("DELETE FROM events WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of rows) {
      if (!r.city) continue;
      const c = norm(r.city);
      // Rótulos genéricos de estreia. "Cinemas de Ribeirão Preto" NÃO é
      // genérico — cai na checagem de cidade abaixo e é podado.
      if (c === "cinema" || c === "cinemas" || c.startsWith("streaming"))
        continue;
      if (allowedNormalized.some((a) => c.includes(a))) continue;
      del.run(r.id);
    }
  });
  tx();
}

/** Webinar/curso/live não é rolê — o local delata ("O evento será online"). */
export function pruneOnlineEvents(): void {
  // LIKE do SQLite já é case-insensitive em ASCII.
  db.prepare("DELETE FROM events WHERE venue LIKE '%online%'").run();
}

/**
 * Bloco do digest (cinema, dica, agenda) já entregue no dia: um retry do
 * CronJob ou disparo manual não repete no grupo o que já saiu.
 */
export function blockSent(date: string, block: string): boolean {
  return !!db
    .query<unknown, [string, string]>(
      "SELECT 1 FROM digest_runs WHERE date = ? AND block = ?",
    )
    .get(date, block);
}

export function markBlockSent(date: string, block: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO digest_runs (date, block) VALUES (?, ?)",
  ).run(date, block);
}

export function pruneDigestRunsBefore(date: string): void {
  db.prepare("DELETE FROM digest_runs WHERE date < ?").run(date);
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
