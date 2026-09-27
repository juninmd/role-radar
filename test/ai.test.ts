import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { stubFetch } from "./fetch.ts";

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
