import { expect, test } from "bun:test";
import { parsePrice } from "../src/web/classify.ts";

// "Não gratuito" é o contrário de grátis: a palavra não pode zerar o preço.
test("negação antes de grátis não vira preço zero", () => {
  expect(parsePrice("Não gratuito, consulte")).toBeNull();
  expect(parsePrice("Não é gratuito")).toBeNull();
});

test("grátis afirmado continua valendo zero", () => {
  expect(parsePrice("Gratuito")).toBe(0);
  expect(parsePrice("Entrada gratuita")).toBe(0);
});
