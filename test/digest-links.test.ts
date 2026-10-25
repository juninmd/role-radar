import { expect, test } from "bun:test";
import { movieBits } from "../src/digest.ts";

const TODAY = "2026-10-25";
const movie = {
  premiere: null,
  trailer: null,
  link: "https://www.ingresso.com/filme/x",
};

// Link de API externa vai dentro de `[texto](url)`: um `)` ou protocolo
// estranho quebra o Markdown da mensagem inteira e o digest falha.
test("trailer que não é http(s) não vira link no Telegram", () => {
  const out = movieBits({ ...movie, trailer: "javascript:alert(1)" }, TODAY);
  expect(out).not.toContain("javascript:");
  expect(out).not.toContain("trailer");
});

test("parêntese no URL não fecha o link antes da hora", () => {
  const out = movieBits({ ...movie, link: "https://x.test/a)b" }, TODAY);
  expect(out).toContain("(https://x.test/a%29b)");
});

test("link que não é http(s) some em vez de quebrar o texto", () => {
  expect(movieBits({ ...movie, link: "ftp://x.test/a" }, TODAY)).toBe("");
});
