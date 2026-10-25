// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { DEFAULT_FILTERS } from "../public/js/state.js";
import { spotsPool } from "../public/js/views/decide-score.js";

const lugar = {
  id: "l1",
  kind: "lugar",
  category: "outros",
  city: "Franca",
  title: "Parque",
  period: null,
  priceMin: null,
  km: 1,
  date: null,
  daysAhead: null,
  daily: false,
};

// Os filtros padrão não listam "lugar" em kinds, então o toggle "Incluir lugares"
// ficava sem efeito: todo lugar era descartado antes de entrar no ranking.
test("lugar fixo entra no plano B mesmo com os filtros padrão", () => {
  expect(
    spotsPool([lugar], DEFAULT_FILTERS, "2026-10-25", new Set()),
  ).toHaveLength(1);
});

test("plano B ainda respeita cidade dos filtros", () => {
  const outraCidade = { ...lugar, id: "l2", city: "Batatais" };
  const f = { ...DEFAULT_FILTERS, cities: ["Franca"] };
  expect(
    spotsPool([lugar, outraCidade], f, "2026-10-25", new Set()).map(
      (i) => i.id,
    ),
  ).toEqual(["l1"]);
});
