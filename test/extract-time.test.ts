import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db, eventsOn, insertItem } from "../src/db.ts";
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

const respond = (events: unknown[]) =>
  stubFetch(async () =>
    json({
      choices: [{ message: { content: JSON.stringify(events) } }],
    }),
  );

// O horário vai para a mensagem do Telegram em Markdown; a IA não controla
// esse texto. Só "HH:MM" passa; qualquer outra forma vira sem horário.
test("horário fora do formato HH:MM não é gravado", async () => {
  respond([
    { title: "Show Teste", date: "2026-09-30", time: "19:00*", item: 1 },
  ]);
  await extractEvents(TODAY);
  expect(eventsOn("2026-09-30")[0]?.time).toBeNull();
});

test("horário HH:MM é mantido", async () => {
  respond([
    { title: "Show Teste", date: "2026-09-30", time: "19:30", item: 1 },
  ]);
  await extractEvents(TODAY);
  expect(eventsOn("2026-09-30")[0]?.time).toBe("19:30");
});
