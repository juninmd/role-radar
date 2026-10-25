import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncQ2Ingressos } from "../src/sources/q2ingressos.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";

const q2Mock = [
  {
    Id: 1,
    Name: "Show de Rock Franca",
    StartDate: "2026-10-15T00:00:00",
    EndDate: null,
    Place: "Villa Eventos",
    City: "Franca",
    Slug: "show-de-rock-franca",
    ImageHomeEvent: "https://admin.quero2ingressos.com.br/rock.png",
  },
  {
    Id: 2,
    Name: "Festival Fora da Região",
    StartDate: "2026-10-15T00:00:00",
    EndDate: null,
    Place: "Praia",
    City: "Santos",
    Slug: "festival-santos",
  },
  {
    Id: 3,
    Name: "Evento Passado",
    StartDate: "2026-10-01T00:00:00",
    EndDate: null,
    Place: "Teatro",
    City: "Franca",
    Slug: "evento-passado",
  },
  {
    Id: 4,
    Name: "Festival Multidias Ribeirão",
    StartDate: "2026-10-11T00:00:00",
    EndDate: "2026-10-13T00:00:00",
    Place: "Arena Ribeirão",
    City: "Ribeirão Preto",
    Slug: "festival-ribeirao",
  },
];

beforeEach(() => db.exec("DELETE FROM events;"));

test("syncQ2Ingressos importa eventos da região e filtra fora e passados", async () => {
  stubFetch(async (url) => {
    if (url.includes("nextEvents.json")) {
      return json(q2Mock);
    }
    return new Response("Not found", { status: 404 });
  });

  const count = await syncQ2Ingressos(TODAY);
  expect(count).toBe(2);

  const francaEvs = eventsOn("2026-10-15");
  expect(francaEvs.length).toBe(1);
  expect(francaEvs[0].title).toBe("Show de Rock Franca");
  expect(francaEvs[0].city).toBe("Franca");
  expect(francaEvs[0].venue).toBe("Villa Eventos");
  expect(francaEvs[0].link).toBe(
    "https://q2ingressos.com.br/events/show-de-rock-franca",
  );
  expect(francaEvs[0].image).toBe(
    "https://admin.quero2ingressos.com.br/rock.png",
  );

  const ribeiraoEvs = eventsOn("2026-10-11");
  expect(ribeiraoEvs.length).toBe(1);
  expect(ribeiraoEvs[0].title).toBe("Festival Multidias Ribeirão");
  expect(ribeiraoEvs[0].end_date).toBe("2026-10-13");
});

test("catálogo gigante do Q2 não é lido até o fim", async () => {
  // Corpo de 8 MB em chunks de 64 KB, contando quantos foram lidos.
  const CHUNKS = 128;
  const head = new TextEncoder().encode("[");
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
  await syncQ2Ingressos(TODAY);
  expect(pulled).toBeLessThan(CHUNKS);
});
