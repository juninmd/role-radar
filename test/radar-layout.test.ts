import { expect, test } from "bun:test";
// @ts-expect-error módulo JS do frontend, sem declaração de tipos
import { layout } from "../public/js/views/radar-geo.js";

// Evento em andamento (começou ontem) tem daysAhead negativo; raio não pode virar NaN.
test("modo tempo: evento em andamento fica com raio finito, como se fosse hoje", () => {
  const items = [
    {
      id: "andamento",
      kind: "evento",
      category: "show",
      km: 2,
      bearing: 10,
      daysAhead: -1,
    },
    {
      id: "hoje",
      kind: "evento",
      category: "show",
      km: 2,
      bearing: 20,
      daysAhead: 0,
    },
  ];
  const { blips } = layout(items, "tempo", 20);
  const andamento = blips.find(
    (b: { it: { id: string } }) => b.it.id === "andamento",
  );
  expect(Number.isFinite(andamento.r)).toBe(true);
  // Anel de hoje (18) com o deslocamento fixo por id de até ±5.
  expect(Math.abs(andamento.r - 18)).toBeLessThanOrEqual(5);
});
