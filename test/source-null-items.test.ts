import { expect, test } from "bun:test";
import { eventsOn } from "../src/db.ts";
import { syncQ2Ingressos } from "../src/sources/q2ingressos.ts";
import { syncMegabilheteria } from "../src/sources/megabilheteria.ts";
import { scrapeTicketFacil } from "../src/sources/ticketfacil.ts";
import { json, stubFetch } from "./fetch.ts";

// Item nulo na lista da fonte lançava TypeError e o laço inteiro parava: os
// eventos seguintes da mesma rodada sumiam sem aviso.
test("q2ingressos: item nulo não derruba os eventos seguintes", async () => {
  stubFetch(async () =>
    json([
      null,
      {
        Name: "Show Q2 Nulo",
        StartDate: "2026-11-21T20:00:00",
        City: "Franca",
      },
    ]),
  );
  expect(await syncQ2Ingressos("2026-10-25")).toBe(1);
});

test("megabilheteria: item nulo não derruba e imagem com '@' não troca o host", async () => {
  stubFetch(async () =>
    json({
      data: [
        null,
        {
          name: "Show Mega Nulo",
          date: "2026-11-22T20:00:00",
          city: "Franca",
          code: "mega-nulo-1",
          image: "@evil.test/x.png",
        },
      ],
      last_page: 1,
    }),
  );
  expect(await syncMegabilheteria("2026-10-25")).toBe(1);
  const ev = eventsOn("2026-11-22").find((e) => e.title === "Show Mega Nulo");
  expect(ev).toBeDefined();
  expect(ev?.image ?? "").not.toContain("evil.test");
});

test("ticketfacil: item nulo não zera o catálogo inteiro", async () => {
  stubFetch(async () =>
    json([
      null,
      { thumbnail: { eventName: "Show TF Nulo", date: "25/11/2026" } },
    ]),
  );
  const parsed = await scrapeTicketFacil("2026-10-25");
  expect(parsed.map((p) => p.title)).toContain("Show TF Nulo");
});
