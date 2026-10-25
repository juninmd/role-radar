import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncFrancaShopping } from "../src/sources/francashopping.ts";
import { stubFetch } from "./fetch.ts";

// Temporada que abre em 10/12 e tem "último dia" 01/11, antes da abertura.
const card = `<div class="dsa-card-eventos-lista"><h5>Circo Teste</h5><span class="material-icons">calendar_today</span> 10/12/2026 à 01/11/2026</div>`;

beforeEach(() => db.exec("DELETE FROM events;"));

// Um "último dia" anterior à abertura não existe: não pode virar evento datado.
test("último dia anterior à abertura não vira evento", async () => {
  stubFetch(async () => new Response(card));
  await syncFrancaShopping("2026-10-25");
  expect(eventsOn("2026-11-01").map((e) => e.title)).toEqual([]);
  expect(eventsOn("2026-12-10").map((e) => e.title)).toEqual(["Circo Teste"]);
});
