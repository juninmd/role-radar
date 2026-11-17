import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { json, stubFetch } from "./fetch.ts";

// Sem teto de saída, cada chamada pode gerar o que o provedor aceitar: a conta
// cresce com a resposta, e o digest repete a chamada a cada rodada.
const body = async () => {
  const { aiTimeoutMs } = env;
  env.aiTimeoutMs = 5000;
  let sent: Record<string, unknown> = {};
  stubFetch(async (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return json({ choices: [{ message: { content: "ok" } }] });
  });
  try {
    await chat("s", "u");
    return sent;
  } finally {
    env.aiTimeoutMs = aiTimeoutMs;
  }
};

test("provedor compatível com OpenAI envia max_tokens e esforço de raciocínio baixo", async () => {
  const sent = await body();
  expect(sent.max_tokens).toBe(4096);
  expect(sent.reasoning_effort).toBe("low");
});
