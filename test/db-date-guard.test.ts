import { beforeEach, expect, spyOn, test } from "bun:test";
import { db, upsertEvent } from "../src/db.ts";

// Data com formato certo e dia inexistente nunca bate com "hoje": tem que ser recusada na escrita.
const evento = (title: string, date: string) => ({
  title,
  date,
  time: null,
  venue: null,
  city: "Franca",
  price: null,
  link: "https://x.test/1",
  image: null,
});
const linhas = (title: string) =>
  db
    .query<{ date: string }, [string]>(
      "SELECT date FROM events WHERE title = ?",
    )
    .all(title);

beforeEach(() => db.exec("DELETE FROM events;"));

test("evento com data inexistente (31/02) não entra no banco", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    upsertEvent(evento("Dia Impossivel", "2026-02-31"));
    expect(linhas("Dia Impossivel")).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  } finally {
    warn.mockRestore();
  }
});

test("evento com data válida continua entrando", () => {
  upsertEvent(evento("Dia Valido", "2028-02-29"));
  expect(linhas("Dia Valido")).toHaveLength(1);
});
