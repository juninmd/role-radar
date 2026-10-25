import { beforeEach, expect, test } from "bun:test";
import { norm, REGION_CITIES } from "../src/config/region.ts";
import { db, eventsOn, pruneDisallowedCities, upsertEvent } from "../src/db.ts";

const DIA = "2026-11-14";
const evento = (title: string, city: string) =>
  upsertEvent({
    title,
    date: DIA,
    time: null,
    venue: null,
    city,
    price: null,
    link: null,
    image: null,
  });

beforeEach(() => db.exec("DELETE FROM events;"));

// "Francavilla" contém "franca" mas é outra cidade: tem de ser podada. Rótulo
// com duas cidades ("Ribeirão e Franca") continua valendo pela palavra "franca".
test("cidade que só contém o nome de uma da região é podada", () => {
  evento("Fora", "Francavilla");
  evento("Franca", "Franca");
  evento("Dupla", "Ribeirão e Franca");
  pruneDisallowedCities(REGION_CITIES.map(norm));
  expect(
    eventsOn(DIA)
      .map((e) => e.title)
      .sort(),
  ).toEqual(["Dupla", "Franca"]);
});

// Fonte que escreve "Franca, SP" ou "Franca." não pode perder o evento na poda:
// a cidade é da região, só vem com pontuação depois do nome.
test("cidade com pontuação depois do nome não é podada", () => {
  evento("Virgula", "Franca, SP");
  evento("Ponto", "Franca.");
  evento("Ribeirao", "Ribeirão Preto, SP");
  pruneDisallowedCities(REGION_CITIES.map(norm));
  expect(
    eventsOn(DIA)
      .map((e) => e.title)
      .sort(),
  ).toEqual(["Ponto", "Ribeirao", "Virgula"]);
});
