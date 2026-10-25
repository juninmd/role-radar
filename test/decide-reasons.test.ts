// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { score } from "../public/js/views/decide-score.js";

const hoje = "2026-10-25";
const comedia = {
  id: "c1",
  category: "comedia",
  priceMin: 0,
  km: 1,
  daysAhead: 3,
  daily: false,
  image: null,
};
const pedido = {
  company: "amigos",
  vibe: "rir",
  when: "qualquer",
  budget: "qualquer",
  reach: "120",
};

// O motivo mostrava a chave interna ("rir"); o texto tem que usar o nome da vibe.
test("motivo da vibe usa o nome da opção, não a chave interna", () => {
  const r = score(comedia, pedido, hoje);
  expect(r.reasons).toContain('bem a vibe "dar risada"');
});
