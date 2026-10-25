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
