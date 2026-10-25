import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncArticket } from "../src/sources/articket.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-10-23";

beforeEach(() => db.exec("DELETE FROM events;"));

// start_date vem em UTC; o evento acontece em São Paulo (UTC-3). 01:30Z é
// 22:30 do dia anterior: tem que aparecer como hoje, às 22:30.
test("start_date em UTC vira dia e hora de São Paulo", async () => {
  stubFetch(async (url) => {
    if (
      url.includes("api/search") &&
      new URL(url).searchParams.get("q") === "Ribeirão Preto"
    )
      return json({
        status: "success",
        data: [
          {
            id: 1,
            title: "Show da Noite",
            start_date: "2026-10-24T01:30:00.000000Z",
            location: "Casa de Show",
            url: "https://articket.com.br/e/1/show",
          },
        ],
      });
    return json({ status: "success", data: [] });
  });
  await syncArticket(TODAY);
  const evs = eventsOn("2026-10-23");
  expect(evs.map((e) => e.title)).toEqual(["Show da Noite"]);
  expect(evs[0].time).toBe("22:30");
});
