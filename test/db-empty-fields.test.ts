import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn, upsertEvent } from "../src/db.ts";

const DIA = "2026-11-05";
const base = {
  title: "Show Vazio",
  date: DIA,
  time: null,
  venue: null,
  city: "Franca",
  price: null,
  link: null,
  image: null,
};

beforeEach(() => db.exec("DELETE FROM events;"));

// Uma fonte que manda "" não tem o campo: não pode apagar o horário e o local
// que outra rodada já tinha gravado. COALESCE só protege contra NULL.
test("campo vazio numa nova coleta não apaga o horário e o local já gravados", () => {
  upsertEvent({ ...base, time: "19:00", venue: "Teatro" });
  upsertEvent({ ...base, time: "", venue: "   " });
  const [ev] = eventsOn(DIA);
  expect(ev?.time).toBe("19:00");
  expect(ev?.venue).toBe("Teatro");
});
