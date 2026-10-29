import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncZigTickets } from "../src/sources/zigtickets.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";

const zigMock = {
  props: {
    pageProps: {
      events: {
        events: [
          {
            id: 101,
            name: "Baile do Art",
            slug: "baile-do-art",
            start_date: "2026-10-16T22:00:00.000-03:00",
            end_date: "2026-10-17T05:00:00.000-03:00",
            banner: "https://zigtickets-assets.s3.amazonaws.com/art.png",
            is_online: false,
            event_location: {
              name: "Art House",
              city: "Ribeirão Preto",
            },
          },
          {
            id: 102,
            name: "Show em Franca",
            slug: "show-franca",
            start_date: "2026-10-20T20:00:00.000-03:00",
            end_date: null,
            banner: null,
            vertical_banner:
              "https://zigtickets-assets.s3.amazonaws.com/franca.png",
            is_online: false,
            event_location: {
              name: "Espaço Franca",
              city: "Franca",
            },
          },
          {
            id: 103,
            name: "Evento em Santos",
            slug: "santos-event",
            start_date: "2026-10-16T22:00:00.000-03:00",
            end_date: null,
            is_online: false,
            event_location: {
              name: "Praia",
              city: "Santos",
            },
          },
          {
            id: 104,
            name: "Live Online",
            slug: "live-online",
            start_date: "2026-10-16T22:00:00.000-03:00",
            is_online: true,
            event_location: {
              city: "Franca",
            },
          },
          {
            id: 105,
            name: "Evento Passado",
            slug: "passado",
            start_date: "2026-10-01T22:00:00.000-03:00",
            is_online: false,
            event_location: {
              city: "Franca",
            },
          },
        ],
      },
    },
  },
};

const html = `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(zigMock)}</script></body></html>`;

beforeEach(() => db.exec("DELETE FROM events;"));

test("syncZigTickets extrai eventos da região de __NEXT_DATA__ descartando online e fora da região", async () => {
  stubFetch(async (url) => {
    if (url === "https://zig.tickets/") {
      return new Response(html, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  });

  const count = await syncZigTickets(TODAY);
  expect(count).toBe(2);

  const rpEvs = eventsOn("2026-10-16");
  expect(rpEvs.length).toBe(1);
  expect(rpEvs[0].title).toBe("Baile do Art");
  expect(rpEvs[0].city).toBe("Ribeirão Preto");
  expect(rpEvs[0].venue).toBe("Art House");
  expect(rpEvs[0].time).toBe("22:00");
  // 22h até 05h do dia seguinte é a mesma noite: evento de um dia.
  expect(rpEvs[0].end_date).toBeNull();
  expect(rpEvs[0].link).toBe("https://zig.tickets/eventos/baile-do-art");

  const francaEvs = eventsOn("2026-10-20");
  expect(francaEvs.length).toBe(1);
  expect(francaEvs[0].title).toBe("Show em Franca");
  expect(francaEvs[0].city).toBe("Franca");
  expect(francaEvs[0].image).toBe(
    "https://zigtickets-assets.s3.amazonaws.com/franca.png",
  );
});

test("home gigante da Zig Tickets não é lida até o fim", async () => {
  // Corpo de 8 MB em chunks de 64 KB, contando quantos foram lidos.
  const CHUNKS = 128;
  const head = new TextEncoder().encode("<html>");
  const pad = new Uint8Array(64 * 1024).fill(0x20);
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
  await syncZigTickets(TODAY);
  expect(pulled).toBeLessThan(CHUNKS);
});
