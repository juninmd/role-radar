import { beforeEach, expect, test } from "bun:test";
import { db, mergeSeasonDuplicates, upsertEvent } from "../src/db.ts";
import { buildCatalog } from "../src/web/catalog.ts";

const base = {
  time: "10:00",
  venue: "Foyer do Teatro do SESI Ribeirão Preto",
  city: "Ribeirão Preto",
  price: null,
  link: "https://www.sesisp.org.br/eventos/x",
  image: null,
};

beforeEach(() => {
  db.exec("DELETE FROM events;");
});

test("temporada cujo início anda a cada rodada continua uma linha só", () => {
  for (const date of ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"])
    upsertEvent({
      ...base,
      title: "Aerofractal",
      date,
      end_date: "2026-11-30",
    });
  const n = db.query("SELECT COUNT(*) AS n FROM events").get() as { n: number };
  expect(n.n).toBe(1);
});

test("migração funde temporadas já repetidas no banco", () => {
  const ins = db.prepare(
    "INSERT INTO events (id, title, date, city, end_date, posted_today, posted_launch, created_at) VALUES (?, 'Ciclo Vivo', ?, 'Ribeirão Preto', '2026-11-30', 0, ?, '')",
  );
  ins.run("a", "2026-11-19", 1);
  ins.run("b", "2026-11-20", 0);
  ins.run("c", "2026-11-21", 0);
  expect(mergeSeasonDuplicates()).toBe(2);
  const rows = db.query("SELECT id, posted_launch FROM events").all();
  expect(rows).toEqual([{ id: "a", posted_launch: 1 }]);
});

test("galeria não repete o mesmo evento em andamento", () => {
  // Duas linhas do mesmo show (fim diferente) que viram "hoje" no catálogo.
  upsertEvent({ ...base, title: "O Veneno do Teatro", date: "2026-11-20" });
  upsertEvent({
    ...base,
    title: "O Veneno do Teatro",
    date: "2026-11-21",
    end_date: "2026-11-22",
  });
  upsertEvent({ ...base, title: "Outro", date: "2026-11-21" });
  const cat = buildCatalog("2026-11-21");
  const titles = cat.events.map((e) => e.title).sort();
  expect(titles).toEqual(["O Veneno do Teatro", "Outro"]);
});
