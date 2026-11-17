import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { json, stubFetch } from "./fetch.ts";

// Provider que aceita a conexão e nunca responde: só o abort encerra. O
// interval faz o papel do socket aberto — o timer do AbortSignal.timeout é
// unref e, sozinho, não mantém o event loop vivo.
const hang = (_url: string, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    const socket = setInterval(() => {}, 1000);
    init?.signal?.addEventListener("abort", () => {
      clearInterval(socket);
      reject(init.signal?.reason);
    });
  });

test("LiteLLM travado vira erro em vez de pendurar o digest", async () => {
  env.aiTimeoutMs = 50;
  stubFetch(hang);
  await expect(chat("s", "u")).rejects.toThrow();
});

test("chama só o LiteLLM do cluster, com a chave no header", async () => {
  const { aiTimeoutMs } = env;
  env.aiTimeoutMs = 5000;
  const seen: { url: string; init?: RequestInit }[] = [];
  stubFetch(async (url, init) => {
    seen.push({ url, init });
    return json({ choices: [{ message: { content: "ok" } }] });
  });
  try {
    expect(await chat("s", "u")).toBe("ok");
  } finally {
    env.aiTimeoutMs = aiTimeoutMs;
  }
  expect(seen).toHaveLength(1);
  expect(seen[0]?.url).toBe(`${env.litellmBaseUrl}/chat/completions`);
});
