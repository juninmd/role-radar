import { expect, test } from "bun:test";
import { categorize } from "../src/web/classify.ts";

// Palavra-chave sem limite de palavra casa dentro de outra palavra: "opera" em
// "cooperativa" e "rave" em "travessia" classificavam o evento errado.
test("palavra-chave curta não casa dentro de outra palavra", () => {
  expect(categorize("Cooperativa de Artesanato")).not.toBe("teatro");
  expect(categorize("Travessia Cultural")).not.toBe("festa");
  expect(categorize("Discovery Day")).not.toBe("show");
});

test("palavra-chave inteira continua valendo", () => {
  expect(categorize("Ópera Carmen")).toBe("teatro");
  expect(categorize("Festa Rave Noturna")).toBe("festa");
  expect(categorize("Cover de Queen")).toBe("show");
});
