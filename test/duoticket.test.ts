import { expect, test } from "bun:test";
import { syncDuoticket } from "../src/sources/duoticket.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";

test("página gigante da Duoticket não é lida até o fim", async () => {
  // Cada resposta é um corpo de 8 MB em chunks de 64 KB; conta leituras por resposta.
  const CHUNKS = 128;
  const pulls: number[] = [];
  const pad = new Uint8Array(64 * 1024).fill(0x20);
  stubFetch(async () => {
    let sent = 0;
    const n = pulls.push(0) - 1;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= CHUNKS) return ctrl.close();
        pulls[n]++;
        ctrl.enqueue(pad);
      },
    });
    return new Response(body);
  });
  await syncDuoticket(TODAY);
  expect(pulls.length).toBeGreaterThan(0);
  for (const p of pulls) expect(p).toBeLessThan(CHUNKS);
});
