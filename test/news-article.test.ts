import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import {
  db,
  eventsBetween,
  eventsOn,
  type Item,
  insertItem,
  pruneEventsBefore,
  upsertEvent,
} from "../src/db.ts";
import { extractEvents } from "../src/extract.ts";
import { enrichItems } from "../src/sources/article.ts";
import { json, stubFetch } from "./fetch.ts";

// Reprodução sintética do caso real: festival de 3 dias noticiado só pelo
// Google News (resumo = título) e com as datas apenas no corpo da matéria.
const GNEWS = "https://news.google.com/rss/articles/CBMiTESTE?oc=5";
const ARTICLE = "https://jornal.test/festival-asiatico";
const HEADLINE =
  "Franca recebe festival gratuito de gastronomia e cultura asiática - Jornal Teste";
const BODY =
  "Franca recebe, entre os dias 25 e 27 de setembro (sexta a domingo), o Festival Mundo Asiático. O evento acontece na Praça Capelinha, com entrada gratuita, das 10h às 23h.";

const html = `<html><head><meta property="og:description" content="Festival na praça">
<script type="application/ld+json">{"@type":"NewsArticle","articleBody":${JSON.stringify(BODY)}}</script>
</head><body><nav><p>Menu com texto irrelevante de navegação do portal</p></nav>
<article><p>${BODY}</p></article></body></html>`;

let prompts: string[] = [];

/** Google News → URL real → matéria; a IA só acha o evento se ler o corpo. */
function network() {
  prompts = [];
  return stubFetch(async (url, init) => {
    if (url.startsWith("https://news.google.com/articles/"))
      return new Response('<div data-n-a-sg="SIG" data-n-a-ts="123"></div>');
    if (url.includes("batchexecute")) {
      const inner = JSON.stringify(["garturlres", ARTICLE, 1]);
      return new Response(
        `)]}'\n\n${JSON.stringify([["wrb.fr", "Fbv4je", inner]])}\n`,
      );
    }
    if (url === ARTICLE) return new Response(html);
    if (url.includes("/chat/completions")) {
      const body = String(init?.body);
      prompts.push(body);
      const content = body.includes("entre os dias 25 e 27")
        ? '[{"title":"Festival Mundo Asiático","date":"2026-09-25","end_date":"2026-09-27","time":"10:00","venue":"Praça Capelinha","city":"Franca","price":"grátis","item":1}]'
        : "[]";
      return json({ choices: [{ message: { content } }] });
    }
    return new Response("", { status: 404 });
  });
}

beforeEach(() => {
  env.aiProvider = "litellm";
  db.exec("DELETE FROM items; DELETE FROM events;");
  insertItem({
    id: "gn1",
    title: HEADLINE,
    link: GNEWS,
    source: "Google News",
    summary: HEADLINE,
    published: "2026-09-24T15:30:00Z",
    image: null,
    fetched_at: "2026-09-24T16:00:00Z",
  });
});

test("notícia só com manchete vira evento lendo o corpo da matéria real", async () => {
  network();
  expect(await extractEvents("2026-09-24")).toBe(1);
  const [ev] = eventsBetween("2026-09-24", "2026-09-30");
  expect(ev.title).toBe("Festival Mundo Asiático");
  expect(ev.link).toBe(ARTICLE); // link real, não o redirect do Google
  expect(ev.price).toBe("grátis");
  // Texto de navegação do portal não vai pro prompt, o corpo sim.
  expect(prompts[0]).not.toContain("Menu com texto irrelevante");
});

test("Google 429: para de insistir no Google, mas lê o portal direto", async () => {
  for (const n of [2, 3, 4, 5])
    insertItem({
      id: `gn${n}`,
      title: `Festival ${n} em Franca`,
      link: `https://news.google.com/rss/articles/CBMiOUTRO${n}`,
      source: "Google News",
      summary: null,
      published: null,
      image: null,
      fetched_at: "2026-09-24T16:00:00Z",
    });
  insertItem({
    id: "direto",
    title: "Festival asiático em Franca",
    link: ARTICLE,
    source: "Verdade ON",
    summary: null,
    published: null,
    image: null,
    fetched_at: "2026-09-24T16:00:00Z",
  });
  let googleHits = 0;
  stubFetch(async (url) => {
    if (url.startsWith("https://news.google.com/")) {
      googleHits++;
      return new Response("sorry", { status: 429 });
    }
    if (url === ARTICLE) return new Response(html);
    return new Response("", { status: 404 });
  });
  const items = db.query<Item, []>("SELECT * FROM items ORDER BY id").all();
  const { read, unread } = await enrichItems(items);
  expect(read).toBe(1);
  expect(unread.size).toBe(5); // todos os do Google, nenhum outro
  // pool de 3 pode disparar até 3 em paralelo antes do 1º 429 voltar.
  expect(googleHits).toBeLessThanOrEqual(3);
  expect(items.find((i) => i.id === "direto")?.body).toContain(
    "entre os dias 25 e 27",
  );
});

test("item recente bloqueado pelo Google fica na fila; antigo é descartado", async () => {
  insertItem({
    id: "gnNovo",
    title: "Festival coreano reúne 600 pratos em Franca",
    link: "https://news.google.com/rss/articles/CBMiNOVO",
    source: "Google News",
    summary: null,
    published: null,
    image: null,
    fetched_at: new Date().toISOString(),
  });
  stubFetch(async () => new Response("sorry", { status: 429 }));
  await extractEvents("2026-09-24");
  const pending = db
    .query<{ id: string }, []>("SELECT id FROM items WHERE digested = 0")
    .all()
    .map((r) => r.id);
  // gn1 (beforeEach) foi buscado há mais de 48h: não fica preso na fila.
  expect(pending).toEqual(["gnNovo"]);
});

test("candidato além do teto de matérias não é tentado e volta como unread", async () => {
  let hits = 0;
  stubFetch(async () => {
    hits++;
    return new Response("", { status: 404 });
  });
  const items = db.query<Item, []>("SELECT * FROM items").all();
  const { unread } = await enrichItems(items, 0);
  expect(hits).toBe(0);
  expect([...unread]).toEqual(["gn1"]);
});

test("end_date antes do início vira evento de um dia, não descarte", async () => {
  stubFetch(async (url) =>
    url.includes("/chat/completions")
      ? json({
          choices: [
            {
              message: {
                content:
                  '[{"title":"Show na Praça","date":"2026-09-30","end_date":"2026-09-20","time":null,"venue":null,"city":"Franca","price":null,"item":1}]',
              },
            },
          ],
        })
      : new Response("", { status: 404 }),
  );
  db.exec("UPDATE items SET title = 'Show na Praça dia 30'");
  expect(await extractEvents("2026-09-24")).toBe(1);
  expect(eventsOn("2026-09-30").map((e) => e.end_date)).toEqual([null]);
});

test("cidade com sufixo de estado ('Franca-SP') vira a cidade canônica", () => {
  upsertEvent({
    title: "Show",
    date: "2026-10-01",
    time: null,
    venue: null,
    city: "Franca-SP",
    price: null,
    link: null,
    image: null,
  });
  upsertEvent({
    title: "Outro",
    date: "2026-10-01",
    time: null,
    venue: null,
    city: "ribeirao preto / SP",
    price: null,
    link: null,
    image: null,
  });
  expect(
    eventsOn("2026-10-01")
      .map((e) => e.city)
      .sort(),
  ).toEqual(["Franca", "Ribeirão Preto"]);
});

test("evento de vários dias continua no radar até o último dia", async () => {
  network();
  await extractEvents("2026-09-24");
  pruneEventsBefore("2026-09-26"); // limpeza diária no 2º dia do festival
  expect(eventsOn("2026-09-26").map((e) => e.title)).toEqual([
    "Festival Mundo Asiático",
  ]);
  pruneEventsBefore("2026-09-28");
  expect(eventsBetween("2026-09-28", "2026-10-05")).toEqual([]);
});
