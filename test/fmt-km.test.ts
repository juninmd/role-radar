// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { fmtKm } from "../public/js/util.js";

// Escolher a unidade antes de arredondar mostrava "1000 m" para 0,9996 km.
test("distância que arredonda para 1000 m sai em km", () => {
  expect(fmtKm(0.9996)).toBe("1.0 km");
  expect(fmtKm(0.5)).toBe("500 m");
  expect(fmtKm(0.0004)).toBe("0 m");
  expect(fmtKm(null)).toBeNull();
});

// Com uma casa decimal, 9,96 km virava "10.0 km"; a forma tem que ser escolhida
// pelo valor já arredondado, como já se faz com metros.
test("distância perto de 10 km não mostra 10.0 km", () => {
  expect(fmtKm(9.96)).toBe("10 km");
  expect(fmtKm(9.94)).toBe("9.9 km");
  expect(fmtKm(12.4)).toBe("12 km");
});
