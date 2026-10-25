// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { calendarUrl } from "../public/js/detail.js";

const dates = (it) => new URL(calendarUrl(it)).searchParams.get("dates");

// Festival de três dias precisa aparecer como intervalo. No Google Agenda o
// fim de dia inteiro é exclusivo, então o último dia entra com +1.
test("evento de vários dias sai como intervalo completo", () => {
  expect(
    dates({
      title: "Festival",
      date: "2026-10-25",
      endDate: "2026-10-27",
      time: null,
    }),
  ).toBe("20261025/20261028");
});

test("evento de um dia continua de um dia só", () => {
  expect(
    dates({ title: "Show", date: "2026-10-25", endDate: null, time: null }),
  ).toBe("20261025/20261025");
});
