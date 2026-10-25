// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { readHash, state } from "../public/js/state.js";

// Link com distância fora das opções do slider (0, 2, 5, 10, 20, 50, 100, 150)
// filtrava por 7 km, mas o slider mostrava "sem limite". Agora cai no padrão.
test("distância do link fora das opções do slider volta para sem limite", () => {
  globalThis.location = { hash: "#maxKm=7" };
  readHash();
  expect(state.filters.maxKm).toBe(0);
});

test("distância do link dentro das opções é mantida", () => {
  globalThis.location = { hash: "#maxKm=20" };
  readHash();
  expect(state.filters.maxKm).toBe(20);
});

// Quando e ordenação fora das opções não casam com nenhum chip nem select: a lista
// saía vazia sem nenhum controle marcado para explicar o motivo.
test("quando e ordenação fora das opções voltam ao padrão", () => {
  globalThis.location = { hash: "#when=lixo&sort=nada" };
  readHash();
  expect(state.filters.when).toBe("tudo");
  expect(state.filters.sort).toBe("data");
});

// Preço fora das opções do chip virava NaN no filtro: todo item com preço sumia
// e nenhum chip ficava marcado para explicar o motivo.
test("preço do link fora das opções do chip volta para qualquer", () => {
  globalThis.location = { hash: "#price=abc" };
  readHash();
  expect(state.filters.price).toBe("qualquer");
});

test("preço do link dentro das opções é mantido", () => {
  globalThis.location = { hash: "#price=50" };
  readHash();
  expect(state.filters.price).toBe("50");
});
