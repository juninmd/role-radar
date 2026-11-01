import { expect, test } from "bun:test";
import { diaFinal, parseDataBr } from "../src/sources/comum.ts";

// Data inválida ou palavra que só começa com um mês não pode virar evento.

test("data que não existe no calendário é descartada", () => {
  expect(parseDataBr("31/02/2026 20:00", "2026-03-01")).toBeNull();
  expect(parseDataBr("00/13/2026", "2026-03-01")).toBeNull();
  expect(parseDataBr("29 de fevereiro", "2026-01-10")).toBeNull();
});

test("palavra que começa com nome de mês não vira data", () => {
  expect(parseDataBr("10 Maria Clara", "2026-03-01")).toBeNull();
  expect(parseDataBr("Sessão 100 mariachi 19h", "2026-03-01")).toBeNull();
  expect(parseDataBr("2 dezenas de bolos", "2026-03-01")).toBeNull();
});

test("datas válidas continuam sendo lidas", () => {
  expect(parseDataBr("14 de Ago às 19:00", "2026-08-01")).toEqual({
    date: "2026-08-14",
    time: "19:00",
  });
  expect(parseDataBr("10 de março", "2026-03-01")).toEqual({
    date: "2026-03-10",
    time: null,
  });
  expect(parseDataBr("01 AGO", "2026-08-01")).toEqual({
    date: "2026-08-01",
    time: null,
  });
  expect(parseDataBr("04 até 30/07 | Qui. 21h00", "2026-07-01")).toEqual({
    date: "2026-07-30",
    time: "21:00",
  });
  expect(parseDataBr("21 de agosto", "2026-08-22")).toEqual({
    date: "2027-08-21",
    time: null,
  });
});

// Duração ("2h30") não é o horário de início; hora de um dígito sai como HH:MM.
test("duração do espetáculo não vira horário de início", () => {
  expect(
    parseDataBr("Duração 2h30 | 18 de Ago às 21h00", "2026-08-01"),
  ).toEqual({ date: "2026-08-18", time: "21:00" });
});

test("hora de um dígito sai com zero à esquerda", () => {
  expect(parseDataBr("14 de Ago às 9h00", "2026-08-01")).toEqual({
    date: "2026-08-14",
    time: "09:00",
  });
});

// Cartaz brasileiro escreve hora cheia ("às 20h", "22H", "18 horas").
test("hora cheia sem minutos vira HH:00", () => {
  expect(parseDataBr("Sáb, 15 de Nov às 20h", "2026-10-29")).toEqual({
    date: "2026-11-15",
    time: "20:00",
  });
  expect(parseDataBr("15 NOV 2026 22H", "2026-10-29")?.time).toBe("22:00");
  expect(
    parseDataBr("Dia 7 de novembro, a partir das 18 horas", "2026-10-29")?.time,
  ).toBe("18:00");
  expect(parseDataBr("15/11 - 21hs", "2026-10-29")?.time).toBe("21:00");
  // Número que não é hora não vira horário.
  expect(parseDataBr("15 de Nov, 100 hamburgueres", "2026-10-29")?.time).toBe(
    null,
  );
});

test("ano escrito por extenso não é trocado pelo ano corrente", () => {
  expect(parseDataBr("15 de novembro de 2027", "2026-10-29")).toEqual({
    date: "2027-11-15",
    time: null,
  });
});

test("data com ponto ou hífen também é lida", () => {
  expect(parseDataBr("12.11.2026 20:00", "2026-10-29")).toEqual({
    date: "2026-11-12",
    time: "20:00",
  });
  expect(parseDataBr("12-11-2026", "2026-10-29")?.date).toBe("2026-11-12");
});

test("festa que termina de madrugada é evento de um dia", () => {
  expect(diaFinal("2026-10-30T21:00", "2026-10-31T05:00:00.000-03:00")).toBe(
    null,
  );
  // Festival de verdade, e fim "00:00" (meia-noite = sem hora), continuam.
  expect(diaFinal("2026-10-30T21:00", "2026-11-01T05:00")).toBe("2026-11-01");
  expect(diaFinal("2026-10-30T00:00", "2026-10-31T00:00")).toBe("2026-10-31");
  expect(diaFinal("2026-10-30T20:00", "2026-10-31T18:00")).toBe("2026-10-31");
  expect(diaFinal("2026-10-30T20:00", "2026-10-29T18:00")).toBe(null);
  expect(diaFinal("2026-10-30T20:00", null)).toBe(null);
});
