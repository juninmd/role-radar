import { expect, test } from "bun:test";
import { parseDataBr } from "../src/sources/comum.ts";

const HOJE = "2026-10-31";
const dia = (s: string) => parseDataBr(s, HOJE)?.date ?? null;

test("ano escrito depois do mês vale, mesmo no ano seguinte", () => {
  expect(dia("14 de novembro de 2027")).toBe("2027-11-14");
  expect(dia("14 de nov. de 2026")).toBe("2026-11-14");
  expect(dia("14 NOV 2027")).toBe("2027-11-14");
  // Dia que não existe naquele ano (2027 não é bissexto) continua descartado.
  expect(dia("29 de fevereiro de 2027")).toBeNull();
});

test("data numérica com ponto, hífen ou ano de dois dígitos", () => {
  expect(dia("14.11.2026")).toBe("2026-11-14");
  expect(dia("14-11-2026 20:00")).toBe("2026-11-14");
  expect(dia("14/11/26")).toBe("2026-11-14");
  // ISO e números soltos não são dd.mm.aa
  expect(dia("2026-11-14")).toBeNull();
  expect(dia("10-12-14")).toBeNull();
});

test("ordinal 1º e hora cheia sem minutos", () => {
  expect(dia("1º de dezembro")).toBe("2026-12-01");
  expect(parseDataBr("14/11 às 21h", HOJE)).toEqual({
    date: "2026-11-14",
    time: "21:00",
  });
  expect(parseDataBr("Sáb, 14 Nov • 9h", HOJE)?.time).toBe("09:00");
});

test("duração e idade não viram horário", () => {
  expect(parseDataBr("14/11 Duração 2h", HOJE)?.time).toBeNull();
  expect(parseDataBr("14/11 18 anos", HOJE)?.time).toBeNull();
});
