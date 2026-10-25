import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn, upsertEvent } from "../src/db.ts";

const DIA = "2026-11-20";

beforeEach(() => db.exec("DELETE FROM events;"));

// "31/12/2026" > "2026-11-20" em string é verdade: sem checar o formato, o fim
// entra e o COALESCE mantém o evento visível para sempre.
test("end_date que não é data vira evento de um dia", () => {
  upsertEvent({
    title: "Feira",
    date: DIA,
    time: null,
    venue: null,
    city: "Franca",
    price: null,
    link: null,
    image: null,
    end_date: "31/12/2026",
  });
  expect(eventsOn(DIA)[0]?.end_date).toBeNull();
});
