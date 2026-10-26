import { expect, test } from "bun:test";
import { syncGuicheWeb } from "../src/sources/guicheweb.ts";
import { syncIngresso } from "../src/sources/ingresso.ts";
import { syncZigTickets } from "../src/sources/zigtickets.ts";
import { json, stubFetch } from "./fetch.ts";

// Item nulo na lista da fonte lançava TypeError e o try da fonte parava o laço:
// os eventos seguintes da mesma rodada sumiam sem aviso.
test("guicheweb: item nulo não derruba os eventos seguintes", async () => {
  stubFetch(async () =>
    json({
      item_eventos: [
        null,
        { nome: "Show Guiche Nulo", data: "27/11/2026", cidade: "Franca" },
      ],
    }),
  );
  expect(await syncGuicheWeb("2026-10-25")).toBeGreaterThanOrEqual(1);
});

test("ingresso: item nulo não derruba as estreias seguintes", async () => {
  stubFetch(async () =>
    json([
      null,
      {
        title: "Filme Ingresso Nulo",
        premiereDate: { localDate: "2026-11-05T00:00:00" },
      },
    ]),
  );
  expect(await syncIngresso("2026-10-25")).toBeGreaterThanOrEqual(1);
});

test("zigtickets: item nulo não derruba os eventos seguintes", async () => {
  const next = {
    props: {
      pageProps: {
        events: {
          events: [
            null,
            {
              name: "Show Zig Nulo",
              start_date: "2026-11-29T20:00:00",
              is_online: false,
              event_location: { city: "Franca" },
            },
          ],
        },
      },
    },
  };
  stubFetch(
    async () =>
      new Response(
        `<html><script id="__NEXT_DATA__">${JSON.stringify(next)}</script></html>`,
        { headers: { "content-type": "text/html" } },
      ),
  );
  expect(await syncZigTickets("2026-10-25")).toBeGreaterThanOrEqual(1);
});
