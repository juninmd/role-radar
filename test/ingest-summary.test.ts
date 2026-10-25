import { beforeEach, expect, test } from "bun:test";
import { db } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import { stubFetch } from "./fetch.ts";

// Resumo cortado no meio de um emoji grava um surrogate isolado (vira "�" no banco).
const feed = (descricao: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>t</title>
<item><title>Show Teste</title><link>https://ex.test/show-1</link>
<description><![CDATA[${descricao}]]></description></item>
</channel></rss>`;

beforeEach(() => db.exec("DELETE FROM items;"));

test("resumo cortado em 500 não quebra um emoji ao meio", async () => {
  stubFetch(
    async () =>
      new Response(feed("a".repeat(499) + "🎸" + "fim"), {
        headers: { "content-type": "application/rss+xml" },
      }),
  );
  await ingest();
  const row = db
    .query<{ summary: string }, []>(
      "SELECT summary FROM items WHERE title = 'Show Teste' LIMIT 1",
    )
    .get();
  expect(row?.summary.endsWith("🎸")).toBe(true);
});

test("resumo tira tags e colapsa espaços sem mexer nas letras", async () => {
  stubFetch(
    async () =>
      new Response(feed("Show   com\n\n  <b>espaços</b> sessão"), {
        headers: { "content-type": "application/rss+xml" },
      }),
  );
  await ingest();
  const row = db
    .query<{ summary: string }, []>(
      "SELECT summary FROM items WHERE title = 'Show Teste' LIMIT 1",
    )
    .get();
  expect(row?.summary).toBe("Show com espaços sessão");
});
