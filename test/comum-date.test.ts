import { expect, test } from "bun:test";
import { parseDataBr } from "../src/sources/comum.ts";

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
