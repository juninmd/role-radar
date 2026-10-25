import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn, upsertEvent } from "../src/db.ts";

const DIA = "2026-11-06";
const base = {
  date: DIA,
  time: null,
  venue: null,
  city: "Franca",
  price: null,
  link: null,
  image: null,
};

beforeEach(() => db.exec("DELETE FROM events;"));

// "25h" ou "19:99" vindos da fonte não são horário: o card e o .ics mostrariam
// lixo. Horário fora de 00:00–23:59 não entra no banco; o evento fica sem hora.
test("horário fora da faixa é gravado como sem horário", () => {
  upsertEvent({ ...base, title: "Show Hora Ruim", time: "25:00" });
  upsertEvent({ ...base, title: "Show Min Ruim", time: "19:99" });
  upsertEvent({ ...base, title: "Show Hora Ok", time: "19:30" });
  const byTitle = Object.fromEntries(
    eventsOn(DIA).map((e) => [e.title, e.time]),
  );
  expect(byTitle["Show Hora Ruim"]).toBeNull();
  expect(byTitle["Show Min Ruim"]).toBeNull();
  expect(byTitle["Show Hora Ok"]).toBe("19:30");
});
