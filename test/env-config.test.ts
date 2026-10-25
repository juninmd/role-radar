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

// Erro de digitação em AI_PROVIDER tem de falhar, não cair no Ollama sem aviso.
test("provedor desconhecido falha em vez de cair no Ollama", async () => {
  const { chat } = await import("../src/ai.ts");
  const { env } = await import("../src/config/env.ts");
  const original = env.aiProvider;
  env.aiProvider = "litelm" as typeof original;
  try {
    await expect(chat("sistema", "usuario")).rejects.toThrow(
      "AI_PROVIDER desconhecido: litelm",
    );
  } finally {
    env.aiProvider = original;
  }
});

// AI_PROVIDER vazio (variável declarada e sem valor) é "não definido", não um provedor.
test("AI_PROVIDER vazio usa o provedor padrão", async () => {
  process.env.AI_PROVIDER = "";
  try {
    const caminho: string = "../src/config/env.ts?provider-vazio";
    const { env } = await import(caminho);
    expect(env.aiProvider).toBe("litellm");
  } finally {
    delete process.env.AI_PROVIDER;
  }
});
