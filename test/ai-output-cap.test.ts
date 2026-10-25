import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { json, stubFetch } from "./fetch.ts";

// Sem teto de saída, cada chamada pode gerar o que o provedor aceitar: a conta
// cresce com a resposta, e o digest repete a chamada a cada rodada. Só o
// Anthropic tinha teto; os outros provedores agora também têm.
const body = async (provider: "litellm" | "google") => {
  const { aiProvider, aiTimeoutMs } = env;
  env.aiProvider = provider;
  env.aiTimeoutMs = 5000;
  let sent: Record<string, unknown> = {};
  stubFetch(async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return provider === "google"
      ? json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] })
      : json({ choices: [{ message: { content: "ok" } }] });
  });
  try {
    await chat("s", "u");
    return sent;
  } finally {
    env.aiProvider = aiProvider;
    env.aiTimeoutMs = aiTimeoutMs;
  }
};

test("provedor compatível com OpenAI envia max_tokens", async () => {
  expect((await body("litellm")).max_tokens).toBe(2048);
});

test("Gemini envia maxOutputTokens em generationConfig", async () => {
  const sent = await body("google");
  expect(
    (sent.generationConfig as { maxOutputTokens?: number } | undefined)
      ?.maxOutputTokens,
  ).toBe(2048);
});
