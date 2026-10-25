import { expect, test } from "bun:test";
import { syncOticket } from "../src/sources/oticket.ts";
import { stubFetch } from "./fetch.ts";

// Um item nulo na lista da API lançava TypeError e a rodada inteira parava:
// os eventos seguintes do mesmo feed eram descartados sem aviso.
test("item nulo na resposta do OTicket não derruba os eventos seguintes", async () => {
  stubFetch(
    async () =>
      new Response(
        JSON.stringify({
          result: [
            null,
            {
              name: "Show de teste",
              date: "2026-10-20T20:00:00",
              city: "Franca",
              slug: "show-de-teste",
            },
          ],
        }),
      ),
  );
  expect(await syncOticket("2026-10-11")).toBe(1);
});
