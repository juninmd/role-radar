import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncSympla } from "../src/sources/sympla.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-09-26";

// Payload RSC do Sympla chega com aspas escapadas; o scraper desescapa.
const listing = (evs: object[]) =>
  new Response(
    evs
      .map((e) =>
        JSON.stringify({ end_date: null, ...e, event_type: "NORMAL" }),
      )
      .join(",")
      .replaceAll('"', '\\"'),
  );

const ev = (name: string, start: string, end: string | null) => ({
  end_date: end,
  name,
  url: `https://www.sympla.com.br/evento/${name}`,
  start_date: start,
  location: { name: "Praça", city: "Franca" },
});

beforeEach(() => db.exec("DELETE FROM events;"));

test("festival que começou ontem e termina amanhã entra; o que já acabou não", async () => {
  stubFetch(async (url) =>
    url.includes("franca-sp") && !url.includes("page")
      ? listing([
          ev(
            "festival",
            "2026-09-25T13:00:00+00:00",
            "2026-09-27T23:00:00+00:00",
          ),
          ev(
            "acabou",
            "2026-09-24T13:00:00+00:00",
            "2026-09-25T23:00:00+00:00",
          ),
          ev("data-quebrada", "2026-09-28T13:00:00+00:00", "nao-e-data"),
          ev(
            "fim-invertido",
            "2026-09-29T13:00:00+00:00",
            "2026-09-20T23:00:00+00:00",
          ),
        ])
      : new Response(""),
  );
  await syncSympla(TODAY);
  const hoje = eventsOn(TODAY);
  expect(hoje.map((e) => e.title)).toEqual(["festival"]);
  expect(hoje[0].end_date).toBe("2026-09-27");
  // Data de fim inválida não derruba a página: o evento entra como de um dia.
  expect(eventsOn("2026-09-28").map((e) => e.end_date)).toEqual([null]);
  // Fim antes do início não descarta um evento futuro.
  expect(eventsOn("2026-09-29").map((e) => e.title)).toEqual(["fim-invertido"]);
});

test("página gigante da Sympla não é lida até o fim, em nenhuma cidade", async () => {
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
  await syncSympla(TODAY);
  expect(pulls.length).toBeGreaterThan(0);
  for (const p of pulls) expect(p).toBeLessThan(CHUNKS);
});
