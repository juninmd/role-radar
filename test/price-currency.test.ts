import { expect, test } from "bun:test";
import { parsePrice } from "../src/web/classify.ts";

// Só número com "R$" é preço. Lote, idade e horário sem o símbolo não podem
// virar o menor preço do evento.
test("número sem R$ não é preço", () => {
  expect(parsePrice("Lote 1: R$ 60")).toBe(60);
  expect(parsePrice("18 anos, R$ 30")).toBe(30);
  expect(parsePrice("R$ 40 (ingresso) - 18+")).toBe(40);
});

// "R$ 0,00" declarado é grátis; antes caía em "preço desconhecido".
test("R$ 0,00 é grátis", () => {
  expect(parsePrice("R$ 0,00")).toBe(0);
});

// "free" dentro de outra palavra (freestyle) não diz que o evento é grátis.
test("palavra que contém 'free' não marca grátis", () => {
  expect(parsePrice("Freestyle 18+")).toBeNull();
  expect(parsePrice("Free entrance")).toBe(0);
});
