import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { json, stubFetch } from "./fetch.ts";

// Gemini bloqueado por segurança responde 200 sem candidatos. Isso não pode virar
// TypeError: "resposta vazia" segue o caminho de parse, que conta a tentativa do lote.
test("resposta sem candidatos volta vazia, não lança TypeError", async () => {
  const original = env.aiProvider;
  env.aiProvider = "google";
  try {
    stubFetch(async () => json({ promptFeedback: { blockReason: "SAFETY" } }));
    expect(await chat("sistema", "usuario")).toBe("");
  } finally {
    env.aiProvider = original;
  }
});
