// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { score } from "../public/js/views/decide-score.js";

const base = {
  id: "f1",
  category: "festa",
  priceMin: 0,
  km: 1,
  daysAhead: 1,
  daily: false,
  image: null,
  title: "Festival",
};
const pedido = (when) => ({
  company: "amigos",
  vibe: "agitar",
  when,
  budget: "qualquer",
  reach: "120",
});

// Festival de 22 a 26 cobre o fim de semana e um dia de semana em curso.
// O radar já mantém (sobreposição); "Me decide" tinha que manter também.
test("festival que cobre o dia (ou o fim de semana) entra no Me decide", () => {
  const festa = { ...base, date: "2026-10-22", endDate: "2026-10-26" };
  expect(score(festa, pedido("hoje"), "2026-10-23")).not.toBeNull();
  expect(score(festa, pedido("fds"), "2026-10-21")).not.toBeNull();
});

test("evento que não cobre o dia continua fora", () => {
  const futuro = { ...base, date: "2026-10-30", endDate: null };
  expect(score(futuro, pedido("hoje"), "2026-10-23")).toBeNull();
});
