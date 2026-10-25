import { expect, test } from "bun:test";
import { scrapeTicket360 } from "../src/sources/ticket360.ts";
import { stubFetch } from "./fetch.ts";

test("página gigante da Ticket360 não é lida até o fim", async () => {
  // Corpo de 8 MB em chunks de 64 KB, contando quantos foram lidos.
  const CHUNKS = 128;
  const pad = new Uint8Array(64 * 1024).fill(0x20);
  let pulled = 0;
  stubFetch(async () => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= CHUNKS) return ctrl.close();
        pulled++;
        ctrl.enqueue(pad);
      },
    });
    return new Response(body);
  });
  await scrapeTicket360("franca", "2026-10-11");
  expect(pulled).toBeLessThan(CHUNKS);
});
