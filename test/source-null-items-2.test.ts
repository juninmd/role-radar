import { expect, test } from "bun:test";
import { syncBlueticket } from "../src/sources/blueticket.ts";
import { syncIngressoNacional } from "../src/sources/ingressonacional.ts";
import { json, stubFetch } from "./fetch.ts";

// Item nulo na lista da fonte lançava TypeError e o laço parava: os eventos
// seguintes da mesma rodada sumiam sem aviso.
test("blueticket: item nulo não derruba os eventos seguintes", async () => {
  stubFetch(async () =>
    json([
      null,
      {
        name: "Show Blue Nulo",
        date: "2026-11-23T20:00:00",
        cityName: "Franca",
      },
    ]),
  );
  expect(await syncBlueticket("2026-10-25")).toBe(1);
});

test("ingressonacional: item nulo não derruba os eventos seguintes", async () => {
  stubFetch(async () =>
    json({
      sucesso: {
        eventos: [
          null,
          { Nome: "Show IN Nulo", DataOrdem: "20261124", Cidade: "Franca" },
        ],
      },
    }),
  );
  expect(await syncIngressoNacional("2026-10-25")).toBe(1);
});
