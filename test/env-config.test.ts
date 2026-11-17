import { expect, test } from "bun:test";

// Número inválido no ambiente não pode virar NaN: slice(0, NaN) esvazia a rodada
// sem erro nenhum.
test("limite numérico inválido cai no padrão", async () => {
  process.env.DIGEST_MAX_ITEMS = "abc";
  try {
    const caminho: string = "../src/config/env.ts?max-abc";
    const { env } = await import(caminho);
    expect(env.digestMaxItems).toBe(120);
  } finally {
    delete process.env.DIGEST_MAX_ITEMS;
  }
});

// Limite negativo vira slice(0, -n): derruba os últimos itens sem aviso.
test("limite numérico negativo cai no padrão", async () => {
  process.env.MAX_ITEMS_PER_FEED = "-5";
  try {
    const caminho: string = "../src/config/env.ts?max-neg";
    const { env } = await import(caminho);
    expect(env.maxItemsPerFeed).toBe(20);
  } finally {
    delete process.env.MAX_ITEMS_PER_FEED;
  }
});
