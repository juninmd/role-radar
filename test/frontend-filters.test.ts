import { expect, test } from "bun:test";
// @ts-expect-error módulo JS do frontend, sem declaração de tipos
import { applyFilters } from "../public/js/data.js";

// Filtro de lista: campo vazio não pode virar texto pesquisável ("null").
const base = {
  q: "",
  kinds: ["evento", "lugar"],
  onlyFav: false,
  cats: [],
  cities: [],
  periods: [],
  maxKm: 0,
  when: "qualquer",
  day: null,
  price: "qualquer",
  unknownPrice: true,
  sort: "data",
};
const ev = (over: Record<string, unknown>) => ({
  id: "x",
  kind: "evento",
  title: "Show",
  venue: null,
  city: "Franca",
  description: null,
  date: "2026-10-30",
  time: "20:00",
  category: "show",
  km: 1,
  priceMin: 10,
  daysAhead: 5,
  period: "noite",
  ...over,
});
const TODAY = "2026-10-22"; // quinta

test("busca não casa palavra inventada a partir de campo vazio", () => {
  const items = [ev({ id: "a", title: "Show Teste" })];
  expect(
    applyFilters(items, { ...base, q: "null" }, TODAY, new Set()),
  ).toHaveLength(0);
});

test("busca ignora acento e caixa na cidade e no título", () => {
  const items = [
    ev({ id: "a", title: "Festival da Cerveja", city: "Ribeirão Preto" }),
  ];
  expect(
    applyFilters(items, { ...base, q: "RIBEIRAO" }, TODAY, new Set()),
  ).toHaveLength(1);
  expect(
    applyFilters(items, { ...base, q: "cervejá" }, TODAY, new Set()),
  ).toHaveLength(1);
});

test("'fim de semana' pega sábado e domingo, não a segunda seguinte", () => {
  const items = [
    ev({ id: "sab", date: "2026-10-24" }),
    ev({ id: "seg", date: "2026-10-26" }),
  ];
  const ids = applyFilters(
    items,
    { ...base, when: "fds" },
    TODAY,
    new Set(),
  ).map((i: { id: string }) => i.id);
  expect(ids).toEqual(["sab"]);
});

test("ordenar por preço deixa preço desconhecido por último", () => {
  const items = [
    ev({ id: "nulo", priceMin: null }),
    ev({ id: "caro", priceMin: 80 }),
    ev({ id: "barato", priceMin: 5 }),
  ];
  const ids = applyFilters(
    items,
    { ...base, sort: "preco" },
    TODAY,
    new Set(),
  ).map((i: { id: string }) => i.id);
  expect(ids).toEqual(["barato", "caro", "nulo"]);
});
