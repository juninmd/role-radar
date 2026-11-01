import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { parseBolaShow, syncBolaShow } from "../src/sources/bolashow.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-31";
const LINK = "https://bsky.app/profile/x/post/1";

beforeEach(() => db.exec("DELETE FROM events;"));

test("show único: título capitalizado, local e cidade separados pelo último hífen", () => {
  const [ev] = parseBolaShow(
    "RANCORE\n\n🗓️ 26/11/2026 \n📌 Goa Lounge - Ribeirão Preto",
    TODAY,
  );
  expect(ev).toMatchObject({
    title: "Rancore",
    date: "2026-11-26",
    venue: "Goa Lounge",
    city: "Ribeirão Preto",
  });
});

test("dois dias no mesmo mês viram data e end_date; Sesc e fora da região ficam de fora", () => {
  const [ev] = parseBolaShow(
    "PITTY + CONVIDADO\n\n🗓️ 28 e 29/11/2026\n📌 Espaço CHF Cultural - Ribeirão Preto",
    TODAY,
  );
  expect(ev.title).toBe("Pitty + Convidado");
  expect([ev.date, ev.end_date]).toEqual(["2026-11-28", "2026-11-29"]);
  expect(
    parseBolaShow("X\n\n🗓️ 20/11/2026\n📌 Sesc Franca - Franca", TODAY),
  ).toEqual([]);
  expect(parseBolaShow("X\n\n🗓️ 20/11/2026\n📌 Casa - Campinas", TODAY)).toEqual(
    [],
  );
});

test("show que já passou é descartado; evento de vários dias vale até o último", () => {
  expect(parseBolaShow("X\n\n🗓️ 30/10/2026\n📌 Casa - Franca", TODAY)).toEqual(
    [],
  );
  expect(
    parseBolaShow("X\n\n🗓️ 30 e 31/10/2026\n📌 Casa - Franca", TODAY),
  ).toHaveLength(1);
});

test("resumo diário: só linhas de cidades da região, sem local", () => {
  const evs = parseBolaShow(
    "HOJE TEM SHOW NO INTERIOR\n📅 05/11/2026\n\n• JAH LOVERS | Araraquara\n• MARIA RITA | Ribeirão Preto\n• TOQUINHO | Franca",
    TODAY,
  );
  expect(evs.map((e) => [e.title, e.city, e.venue])).toEqual([
    ["Maria Rita", "Ribeirão Preto", null],
    ["Toquinho", "Franca", null],
  ]);
});

test("post sem o formato esperado não gera evento", () => {
  expect(parseBolaShow("bom dia, galera", TODAY)).toEqual([]);
  expect(parseBolaShow("🗓️ 20/11/2026\n📌 Casa - Franca", TODAY)).toEqual([]);
});

test("intervalos: mês diferente, duas datas completas, lista de dias e virada de ano", () => {
  const post = (d: string) => `X

🗓️ ${d}
📌 Casa - Franca`;
  const r = (d: string) => {
    const [ev] = parseBolaShow(post(d), TODAY);
    return [ev?.date, ev?.end_date];
  };
  expect(r("30/11 a 02/12/2026")).toEqual(["2026-11-30", "2026-12-02"]);
  expect(r("20/11 e 21/11/2026")).toEqual(["2026-11-20", "2026-11-21"]);
  expect(r("28, 29 e 30/11/2026")).toEqual(["2026-11-28", "2026-11-30"]);
  expect(r("30/12 a 02/01/2027")).toEqual(["2026-12-30", "2027-01-02"]);
  expect(parseBolaShow(post("32/13/2026"), TODAY)).toEqual([]);
});

test("evento do BolaShow não grava link: o post do Bluesky não substitui o de ingresso", () => {
  const [ev] = parseBolaShow("X\n\n🗓️ 20/11/2026\n📌 Casa - Franca", TODAY);
  expect(ev.link).toBeNull();
});

test("entidade inválida num post não faz perder os posts seguintes", async () => {
  const item = (d: string) =>
    `<item><link>${LINK}</link><description>${d}</description></item>`;
  const rss = `<rss><channel>${item("RUIM&#99999999;&#xA;&#xA;🗓️ 17/11/2026&#xA;📌 Casa - Franca")}${item("BOM&#xA;&#xA;🗓️ 18/11/2026&#xA;📌 Casa - Franca")}</channel></rss>`;
  stubFetch(async () => new Response(rss));
  expect(await syncBolaShow(TODAY)).toBeGreaterThanOrEqual(1);
  expect(eventsOn("2026-11-18").map((e) => e.title)).toEqual(["Bom"]);
});

test("syncBolaShow decodifica o RSS e grava; resposta que não é RSS não grava", async () => {
  const rss = `<rss><channel><item><link>${LINK}</link><description>TOQUINHO&#xA;&#xA;🗓️ 17/11/2026 &#xA;📌 Theatro Pedro II - Ribeirão Preto</description></item></channel></rss>`;
  stubFetch(async () => new Response(rss));
  expect(await syncBolaShow(TODAY)).toBe(1);
  const [ev] = eventsOn("2026-11-17");
  expect([ev.title, ev.venue, ev.link]).toEqual([
    "Toquinho",
    "Theatro Pedro II",
    null,
  ]);

  db.exec("DELETE FROM events;");
  stubFetch(async () => new Response("<html>bloqueado</html>"));
  expect(await syncBolaShow(TODAY)).toBe(0);
});
