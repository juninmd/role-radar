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

for (const provider of ["litellm", "anthropic", "google"] as const) {
  test(`${provider} travado vira erro em vez de pendurar o digest`, async () => {
    env.aiProvider = provider;
    env.aiTimeoutMs = 50;
    stubFetch(hang);
    await expect(chat("s", "u")).rejects.toThrow();
  });
}

// A chave na query vai parar em URL de erro/log; no header não.
test("google manda a chave no header, nunca na URL", async () => {
  const { aiProvider, geminiKey, aiTimeoutMs } = env;
  env.aiProvider = "google";
  env.geminiKey = "chave-de-teste";
  env.aiTimeoutMs = 5000;
  const seen: { url: string; init?: RequestInit }[] = [];
  stubFetch(async (url, init) => {
    seen.push({ url, init });
    return json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  });
  try {
    expect(await chat("s", "u")).toBe("ok");
  } finally {
    Object.assign(env, { aiProvider, geminiKey, aiTimeoutMs });
  }
  expect(seen[0]?.url).not.toContain("key=");
  expect(new Headers(seen[0]?.init?.headers).get("x-goog-api-key")).toBe(
    "chave-de-teste",
  );
});
