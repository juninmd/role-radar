import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db, insertItem, pendingItems } from "../src/db.ts";
import { extractEvents } from "../src/extract.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-09-26";

beforeEach(() => {
  env.aiProvider = "litellm";
  db.exec("DELETE FROM items; DELETE FROM events;");
  insertItem({
    id: "i1",
    title: "Show Teste dia 30",
    link: "https://news.test/1",
    source: "teste",
    summary: null,
    published: null,
    image: null,
    fetched_at: "2026-09-26T00:00:00Z",
  });
});

// Resposta da IA que nunca parseia: sem o limite, o mesmo lote volta em toda
// rodada do cron e a conta de IA cresce sem resultado.
test("lote com resposta que não parseia sai da fila após 3 tentativas", async () => {
  stubFetch(async () =>
    json({ choices: [{ message: { content: "não consigo ler isso" } }] }),
  );
  for (let run = 0; run < 3; run++) await extractEvents(TODAY);
  expect(pendingItems(10)).toEqual([]);
});

// Provedor fora do ar não é culpa do item: o lote continua na fila.
test("falha de rede do provedor não conta como tentativa", async () => {
  stubFetch(async () => json({ error: "upstream down" }, 503));
  for (let run = 0; run < 5; run++) await extractEvents(TODAY);
  expect(pendingItems(10).map((i) => i.id)).toEqual(["i1"]);
});
