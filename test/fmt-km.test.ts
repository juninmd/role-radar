import { expect, test } from "bun:test";
import { fmtKm } from "../public/js/util.js";

// Escolher a unidade antes de arredondar mostrava "1000 m" para 0,9996 km.
test("distância que arredonda para 1000 m sai em km", () => {
  expect(fmtKm(0.9996)).toBe("1.0 km");
  expect(fmtKm(0.5)).toBe("500 m");
  expect(fmtKm(0.0004)).toBe("0 m");
  expect(fmtKm(null)).toBeNull();
});
