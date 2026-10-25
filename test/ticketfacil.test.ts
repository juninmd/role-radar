import { expect, test } from "bun:test";
import { scrapeTicketFacil } from "../src/sources/ticketfacil.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";
const ITEM = JSON.stringify({
  thumbnail: {
    eventName: "Show Teste Franca",
    date: "15/10/2026 20:00",
    location: "Franca - SP",
  },
});

test("catálogo de tamanho normal continua sendo lido por inteiro", async () => {
  stubFetch(async () => new Response(`[${ITEM}]`));
  const out = await scrapeTicketFacil(TODAY);
  expect(out.map((e) => e.title)).toEqual(["Show Teste Franca"]);
});

test("resposta gigante do catálogo não é lida até o fim", async () => {
  // Corpo JSON válido de 8 MB em chunks de 64 KB, contando quantos foram lidos.
  const CHUNKS = 128;
  const head = new TextEncoder().encode(`[${ITEM}`);
  const pad = new Uint8Array(64 * 1024).fill(0x20); // espaço é whitespace JSON
  let pulled = 0;
  stubFetch(async () => {
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= CHUNKS) return ctrl.close();
        pulled++;
        ctrl.enqueue(sent === 1 ? Buffer.concat([head, pad]) : pad);
      },
    });
    return new Response(body);
  });
  await expect(scrapeTicketFacil(TODAY)).rejects.toThrow();
  expect(pulled).toBeLessThan(CHUNKS);
});
