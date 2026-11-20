import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn, insertItem } from "../src/db.ts";
import { extractEvents } from "../src/extract.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-09-26";

beforeEach(() => {
  db.exec("DELETE FROM items; DELETE FROM events;");
  insertItem({
    id: "i1",
    title: "Banda toca amanhã na praça",
    link: "https://news.test/1",
    source: "teste",
    summary: null,
    published: null,
    image: null,
    fetched_at: "2026-09-26T00:00:00Z",
  });
});

// "amanhã" é a única pista de data: sem ela o item seria descartado antes da IA.
test('item cuja única pista de data é "amanhã" chega à extração', async () => {
  stubFetch(async () =>
    json({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { title: "Banda Teste", date: "2026-09-27", item: 1 },
            ]),
          },
        },
      ],
    }),
  );
  await extractEvents(TODAY);
  expect(eventsOn("2026-09-27")).toHaveLength(1);
});
