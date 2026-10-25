import { expect, test } from "bun:test";
import { inRegion, norm } from "../src/config/region.ts";

// Região decide cada evento de cada fonte: acento, caixa e espaço não podem mudar o resultado.
test("cidade da região é aceita independente de acento, caixa e espaço nas bordas", () => {
  for (const c of [
    "Franca",
    "FRANCA",
    " franca ",
    "Ribeirão Preto",
    "Ribeirao Preto",
    "RIBEIRÃO PRETO",
    "São Joaquim da Barra",
    "Sao Joaquim da Barra",
    "Patrocínio Paulista",
    "Ribeirão Corrente",
  ]) {
    expect(inRegion(c)).toBe(true);
  }
});

test("cidade fora da região ou nome parecido não entra", () => {
  for (const c of [
    "Mococa",
    "Sao Paulo",
    "Franca Shopping",
    "",
    null,
    undefined,
  ]) {
    expect(inRegion(c)).toBe(false);
  }
});
