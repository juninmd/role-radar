import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncArticket } from "../src/sources/articket.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";

const articketMock = {
  status: "success",
  data: [
    {
      id: 7260,
      title: "MOTÖRSPADES EM RIBEIRÃO PRETO - SP",
      start_date: "2026-10-23T23:00:00.000000Z",
      end_date: "2026-10-25T05:02:00.000000Z",
      image: "https://cdn.articket.com.br/motorspades.webp",
      location: "Toca do Jack Pub Underground",
      url: "https://articket.com.br/e/7260/motorspades",
    },
    {
      id: 6000,
      title: "Evento Passado",
      start_date: "2026-09-01T20:00:00.000000Z",
      location: "Local",
      url: "https://articket.com.br/e/6000/passado",
    },
  ],
};

beforeEach(() => db.exec("DELETE FROM events;"));

test("syncArticket busca e importa eventos futuros da região", async () => {
  stubFetch(async (url) => {
    if (url.includes("api/search")) {
      const u = new URL(url);
      if (u.searchParams.get("q") === "Ribeirão Preto") {
        return json(articketMock);
      }
      return json({ status: "success", data: [] });
    }
    return new Response("Not found", { status: 404 });
  });

  const count = await syncArticket(TODAY);
  expect(count).toBe(1);

  const evs = eventsOn("2026-10-23");
  expect(evs.length).toBe(1);
  expect(evs[0].title).toBe("MOTÖRSPADES EM RIBEIRÃO PRETO - SP");
  expect(evs[0].city).toBe("Ribeirão Preto");
  expect(evs[0].venue).toBe("Toca do Jack Pub Underground");
  // 23:00Z é 20:00 em São Paulo; o teste antigo fixava a hora em UTC.
  expect(evs[0].time).toBe("20:00");
  expect(evs[0].end_date).toBe("2026-10-25");
  expect(evs[0].link).toBe("https://articket.com.br/e/7260/motorspades");
});

// Item nulo na lista lançava TypeError e a cidade inteira perdia os eventos seguintes.
test("item nulo na lista do Articket não derruba os eventos seguintes", async () => {
  stubFetch(async () =>
    json({
      status: "success",
      data: [
        null,
        {
          id: 7261,
          title: "Show Articket Nulo",
          start_date: "2026-11-20T23:00:00.000000Z",
          location: "Local",
          url: "https://articket.com.br/e/7261/nulo",
        },
      ],
    }),
  );
  expect(await syncArticket(TODAY)).toBe(1);
});
