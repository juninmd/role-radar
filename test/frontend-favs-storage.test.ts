// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";

// Um valor que não é lista no localStorage (ex.: "5", "{}") não pode impedir
// o módulo de estado de carregar, senão o app inteiro fica em branco.
test("favoritos salvos que não são lista não derrubam o estado", async () => {
  globalThis.localStorage = {
    getItem: (key) => (key === "rr:favs" ? "5" : null),
    setItem() {},
  };
  try {
    const { state } = await import("../public/js/state.js?favs-corrompidos");
    expect(state.favs.size).toBe(0);
  } finally {
    delete globalThis.localStorage;
  }
});

test("favoritos salvos em lista são carregados", async () => {
  globalThis.localStorage = {
    getItem: (key) => (key === "rr:favs" ? '["a","b"]' : null),
    setItem() {},
  };
  try {
    const { state } = await import("../public/js/state.js?favs-lista");
    expect([...state.favs]).toEqual(["a", "b"]);
  } finally {
    delete globalThis.localStorage;
  }
});
