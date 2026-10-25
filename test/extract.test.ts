import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db, eventsOn, insertItem, pendingItems } from "../src/db.ts";
import { extractEvents } from "../src/extract.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-09-26";

const item = (n: number, title = `Show ${n} dia 30`) => ({
  id: `i${n}`,
  title,
  link: `https://news.test/${n}`,
  source: "teste",
  summary: null,
  published: null,
  image: null,
  // fetched_at distinto: fixa a ordem da fila e, portanto, a dos lotes.
  fetched_at: `2026-09-26T00:00:${String(99 - n).padStart(2, "0")}Z`,
});

const completion = (content: string) =>
  json({ choices: [{ message: { content } }] });

beforeEach(() => {
  env.aiProvider = "litellm";
  db.exec("DELETE FROM items; DELETE FROM events;");
});

// Barra escapada ("\\") seguida de "u" é JSON válido: não pode ser "consertada" e quebrar.
test("barra escapada seguida de u não derruba o lote", async () => {
  insertItem(item(1));
  stubFetch(async () =>
    completion(
      String.raw`[{"title":"Festival C:\\users","date":"2026-10-30","item":1}]`,
    ),
  );
  await extractEvents(TODAY);
  expect(pendingItems(10)).toEqual([]);
  expect(eventsOn("2026-10-30").map((e) => e.title)).toEqual([
    "Festival C:\\users",
  ]);
});

test("lote com IA fora do ar continua na fila para a próxima rodada", async () => {
  insertItem(item(1));
  stubFetch(async () => json({ error: "upstream down" }, 503));
  await extractEvents(TODAY);
  expect(pendingItems(10).map((i) => i.id)).toEqual(["i1"]);
});

test("só o lote que falhou fica pendente; o resto sai da fila", async () => {
  for (let n = 1; n <= 25; n++) insertItem(item(n));
  // Lotes de 10: o 1º (itens 1..10) falha, os demais respondem.
  stubFetch(async (_url, init) =>
    String(init?.body).includes("Show 1 dia 30")
      ? json({}, 503)
      : completion("[]"),
  );
  await extractEvents(TODAY);
  const pending = pendingItems(50).map((i) => i.id);
  expect(pending).toHaveLength(10);
  expect(pending).toContain("i1");
  expect(pending).not.toContain("i21");
});

test("item sem data e lote bem-sucedido saem da fila", async () => {
  insertItem(item(1));
  insertItem(item(2, "Prefeitura inaugura praça"));
  stubFetch(async () =>
    completion(
      '[{"title":"Show 1","date":"2026-09-30","time":null,"venue":null,"city":"Franca","price":null,"item":1}]',
    ),
  );
  expect(await extractEvents(TODAY)).toBe(1);
  expect(pendingItems(10)).toEqual([]);
});
