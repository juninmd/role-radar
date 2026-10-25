import { expect, test } from "bun:test";
import { syncArticket } from "../src/sources/articket.ts";
import { syncBasquete } from "../src/sources/basquete.ts";
import { syncBilheteriaDigital } from "../src/sources/bilheteriadigital.ts";
import { syncBilheteriaExpress } from "../src/sources/bilheteriaexpress.ts";
import { syncBlueticket } from "../src/sources/blueticket.ts";
import { nowPlaying } from "../src/sources/cinema.ts";
import { syncEventoon } from "../src/sources/eventoon.ts";
import { syncFrancaShopping } from "../src/sources/francashopping.ts";
import { syncGuicheWeb } from "../src/sources/guicheweb.ts";
import { syncIngresso } from "../src/sources/ingresso.ts";
import { syncIngressoDigital } from "../src/sources/ingressodigital.ts";
import { syncIngressoNacional } from "../src/sources/ingressonacional.ts";
import { syncMegabilheteria } from "../src/sources/megabilheteria.ts";
import { syncMinhaEntrada } from "../src/sources/minhaentrada.ts";
import { syncMultiplanHall } from "../src/sources/multiplanhall.ts";
import { syncOticket } from "../src/sources/oticket.ts";
import { syncSesc } from "../src/sources/sesc.ts";
import { syncTicket360 } from "../src/sources/ticket360.ts";
import { syncTheatroPedro2 } from "../src/sources/theatropedro2.ts";
import { syncTurismo } from "../src/sources/turismo.ts";
import { syncUhuu } from "../src/sources/uhuu.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";
const CHUNKS = 128; // 8 MB em pedaços de 64 KB
const MAX_REQUESTS = 30; // corta paginação que não termina

const SOURCES: [string, () => Promise<unknown>][] = [
  ["articket", () => syncArticket(TODAY)],
  ["basquete", () => syncBasquete(TODAY)],
  ["bilheteriadigital", () => syncBilheteriaDigital(TODAY)],
  ["bilheteriaexpress", () => syncBilheteriaExpress(TODAY)],
  ["blueticket", () => syncBlueticket(TODAY)],
  ["cinema", () => nowPlaying()],
  ["eventoon", () => syncEventoon(TODAY)],
  ["francashopping", () => syncFrancaShopping(TODAY)],
  ["guicheweb", () => syncGuicheWeb(TODAY)],
  ["ingresso", () => syncIngresso(TODAY)],
  ["ingressodigital", () => syncIngressoDigital(TODAY)],
  ["ingressonacional", () => syncIngressoNacional(TODAY)],
  ["megabilheteria", () => syncMegabilheteria(TODAY)],
  ["minhaentrada", () => syncMinhaEntrada(TODAY)],
  ["multiplanhall", () => syncMultiplanHall(TODAY)],
  ["oticket", () => syncOticket(TODAY)],
  ["sesc", () => syncSesc(TODAY)],
  ["ticket360", () => syncTicket360(TODAY)],
  ["theatropedro2", () => syncTheatroPedro2(TODAY)],
  ["turismo", () => syncTurismo(TODAY)],
  ["uhuu", () => syncUhuu(TODAY)],
];

test.each(SOURCES)(
  "%s não lê resposta gigante até o fim",
  async (_name, run) => {
    const pad = new Uint8Array(64 * 1024).fill(0x20); // espaço é whitespace em JSON e HTML
    const pulls: number[] = [];
    stubFetch(async () => {
      if (pulls.length >= MAX_REQUESTS)
        return new Response("", { status: 404 });
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
    await run().catch(() => {});
    expect(pulls.length).toBeGreaterThan(0);
    for (const p of pulls) expect(p).toBeLessThan(CHUNKS);
  },
);
