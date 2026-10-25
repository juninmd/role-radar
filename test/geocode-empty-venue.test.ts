import { expect, test } from "bun:test";
import { geocodePlaces, type Place } from "../src/web/geocode.ts";
import { json, stubFetch } from "./fetch.ts";

// "(Plateia livre)" some ao limpar o nome. Buscar só ", Franca, SP" devolve o
// centro da cidade, que viraria pino exato no mapa: não se busca nome vazio.
test("local cujo nome fica vazio após a limpeza não vai ao Nominatim", async () => {
  let chamadas = 0;
  stubFetch(async () => {
    chamadas++;
    return json([{ lat: "-20.5386", lon: "-47.4006" }]);
  });
  await geocodePlaces(
    [{ venue: "(Plateia livre)", city: "Franca" } as Place],
    5,
    async () => {},
  );
  expect(chamadas).toBe(0);
});
