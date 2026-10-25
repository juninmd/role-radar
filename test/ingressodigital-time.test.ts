import { expect, test } from "bun:test";
import { parseDate } from "../src/sources/ingressodigital.ts";

// O site mostra "19h" além de "19:00"; perder a hora por isso esconde o evento.
test("hora no formato 19h vira HH:MM", () => {
  expect(parseDate("14 de Ago às 19h", "2026-08-01")).toEqual({
    date: "2026-08-14",
    time: "19:00",
  });
  expect(parseDate("14 de Ago às 19h30", "2026-08-01")).toEqual({
    date: "2026-08-14",
    time: "19:30",
  });
  expect(parseDate("14 de Ago às 9h", "2026-08-01")?.time).toBe("09:00");
});

test("HH:MM continua sendo lido", () => {
  expect(parseDate("14 de Ago às 19:00", "2026-08-01")?.time).toBe("19:00");
});

// Ano sem marcador de hora não pode ser lido como horário.
test("ano depois da data não vira horário", () => {
  expect(parseDate("14 de Ago 2026", "2026-08-01")).toEqual({
    date: "2026-08-14",
    time: null,
  });
});
