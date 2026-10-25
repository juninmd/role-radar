import { expect, test } from "bun:test";
import { limpa } from "../src/sources/comum.ts";

// Entidade HTML crua no título aparece para o usuário; o navegador decodificaria.
test("limpa decodifica entidades nomeadas em qualquer caixa e numéricas", () => {
  expect(limpa("GH &AMP; EDUARDO")).toBe("GH & EDUARDO");
  expect(limpa("Rock &#38; Roll")).toBe("Rock & Roll");
  expect(limpa("Ca&#xE7;a &lt;3 &quot;live&quot;")).toBe('Caça <3 "live"');
});

test("limpa mantém o que já funcionava e não quebra com entidade inválida", () => {
  expect(limpa("A&amp;B&nbsp;&#39;x&#39;")).toBe("A&B 'x'");
  expect(limpa("Show &#99999999; fim")).toBe("Show &#99999999; fim");
  expect(limpa("Show &#xD800; fim")).toBe("Show &#xD800; fim");
});

// Nome de propriedade do Object não pode ser lido como entidade.
test("nome de entidade igual a propriedade do Object fica como texto", () => {
  expect(limpa("a &constructor; b")).toBe("a &constructor; b");
});
