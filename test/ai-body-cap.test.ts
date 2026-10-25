import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { stubFetch } from "./fetch.ts";

const CHUNKS = 128; // 8 MB em pedaços de 64 KB
const PROVIDERS = ["litellm", "anthropic", "google"] as const;

/** Responde com 8 MB do `head` seguido de espaços; devolve os pedaços lidos. */
function hugeReply(status: number, head: string) {
  const pulls = [0];
  const enc = new TextEncoder();
  const pad = new Uint8Array(64 * 1024).fill(0x20);
  stubFetch(async () => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= CHUNKS) return ctrl.close();
        pulls[0]++;
        ctrl.enqueue(sent === 1 ? Buffer.concat([enc.encode(head), pad]) : pad);
      },
    });
    return new Response(body, { status });
  });
  return pulls;
}

for (const provider of PROVIDERS) {
  test(`${provider}: resposta de sucesso gigante não é lida até o fim`, async () => {
    env.aiProvider = provider;
    const pulls = hugeReply(200, "{");
    await expect(chat("s", "u")).rejects.toThrow();
    expect(pulls[0]).toBeLessThan(CHUNKS);
  });

  test(`${provider}: erro gigante não vira mensagem gigante`, async () => {
    env.aiProvider = provider;
    const pulls = hugeReply(500, "x");
    const err = await chat("s", "u").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message.length).toBeLessThan(2_000);
    expect(pulls[0]).toBeLessThan(CHUNKS);
  });
}
