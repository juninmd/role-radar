import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn, upsertEvent } from "../src/db.ts";

beforeEach(() => db.exec("DELETE FROM events;"));

const evento = (end_date: string | null) => ({
  title: `Festival ${end_date}`,
  date: "2026-10-22",
  time: null,
  venue: null,
  city: "Franca",
  price: null,
  link: null,
  image: null,
  end_date,
});

// Fim de festival que não existe no calendário ("2026-99-99") passava na
// comparação de texto e ficava gravado; a janela do evento ficava errada.
test("end_date que não existe no calendário não é gravado", () => {
  upsertEvent(evento("2026-99-99"));
  expect(eventsOn("2026-10-22")[0]?.end_date).toBeNull();
});

test("end_date válido e posterior ao início é mantido", () => {
  upsertEvent(evento("2026-10-26"));
  expect(eventsOn("2026-10-22")[0]?.end_date).toBe("2026-10-26");
});
