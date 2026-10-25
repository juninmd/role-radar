import { expect, test } from "bun:test";
import type { CatalogEvent } from "../src/web/catalog.ts";
import { buildIcs } from "../src/web/ics.ts";

const NOW = new Date("2026-10-25T12:00:00Z");
const base: CatalogEvent = {
  id: "ev-1",
  title: "Show, de Samba; ao vivo",
  date: "2026-11-07",
  time: "20:00",
  venue: "Teatro Municipal",
  city: "Franca",
  price: null,
  priceMin: null,
  description: null,
  category: "show",
  pin: null,
  link: "https://ingressos.test/show",
  image: null,
  trailer: null,
  endDate: null,
};
const unfold = (s: string) => s.replace(/\r\n[ \t]/g, "");
const events = (ics: string) =>
  unfold(ics)
    .split("\r\n")
    .filter((l) => l === "BEGIN:VEVENT").length;

// Calendário que o cliente aceita: texto escapado (vírgula e ponto-e-vírgula
// quebram o campo) e linhas CRLF, sem linha acima de 75 octetos.
test("escapa vírgula, ponto-e-vírgula e quebra de linha no SUMMARY", () => {
  const ics = buildIcs([{ ...base, title: "A, B; C\nD\\E" }], NOW);
  expect(unfold(ics)).toContain("SUMMARY:A\\, B\\; C\\nD\\\\E\r\n");
});

test("linhas têm no máximo 75 octetos e terminam em CRLF", () => {
  const long = { ...base, title: "Festival de música brasileira ".repeat(6) };
  const ics = buildIcs([long], NOW);
  for (const line of ics.split("\r\n"))
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(ics.endsWith("\r\n")).toBe(true);
  expect(unfold(ics)).toContain(long.title.replace(/ $/, ""));
});

test("evento com horário vira DTSTART local e DTEND de 3 h, virando o dia", () => {
  const ics = unfold(buildIcs([{ ...base, time: "22:00" }], NOW));
  expect(ics).toContain("DTSTART:20261107T220000\r\n");
  expect(ics).toContain("DTEND:20261108T010000\r\n");
});

test("evento sem horário ou com fim vira dia inteiro, com DTEND exclusivo", () => {
  const ics = unfold(
    buildIcs([{ ...base, time: null, endDate: "2026-11-09" }], NOW),
  );
  expect(ics).toContain("DTSTART;VALUE=DATE:20261107\r\n");
  expect(ics).toContain("DTEND;VALUE=DATE:20261110\r\n");
});

// Hora que não existe (25:00) vinda de uma fonte não pode derrubar a agenda
// inteira: o evento sai como dia inteiro e os demais continuam no arquivo.
test("hora fora do dia não derruba o calendário inteiro", () => {
  const ics = unfold(
    buildIcs(
      [
        { ...base, time: "25:00" },
        { ...base, id: "ev-2" },
      ],
      NOW,
    ),
  );
  expect(ics).toContain("DTSTART;VALUE=DATE:20261107\r\n");
  expect(events(ics)).toBe(2);
});

test("local e link entram; evento sem link não cria URL vazia", () => {
  const ics = unfold(buildIcs([{ ...base, link: null }], NOW));
  expect(ics).toContain("LOCATION:Teatro Municipal\\, Franca\r\n");
  expect(ics).not.toContain("URL:");
});

test("uma VEVENT por evento e UID estável", () => {
  const ics = buildIcs([base, { ...base, id: "ev-2" }], NOW);
  expect(events(ics)).toBe(2);
  expect(unfold(ics)).toContain("UID:ev-1@role-radar\r\n");
});
