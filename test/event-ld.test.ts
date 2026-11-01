import { expect, test } from "bun:test";
import type { Event } from "../src/db.ts";
import {
  enrichEvent,
  eventsOn,
  pruneNonLeisure,
  upsertEvent,
} from "../src/db.ts";
import {
  calendarUrl,
  eventButtons,
  eventLines,
  quando,
} from "../src/digest.ts";
import { fetchDetails, parseEventLd } from "../src/sources/ogimage.ts";
import { stubFetch } from "./fetch.ts";

const ld = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

// Formato real da Zig: AggregateOffer com faixa e horário com fuso.
test("schema.org/Event traz faixa de preço e horário", () => {
  const html = ld({
    "@type": "Event",
    startDate: "2026-10-30T21:00:00.000-03:00",
    offers: {
      "@type": "AggregateOffer",
      availability: "InStock",
      lowPrice: 80,
      highPrice: 105,
    },
  });
  expect(parseEventLd(html)).toMatchObject({
    price: "R$ 80 a R$ 105",
    time: "21:00",
    status: null,
  });
});

// Guichê Web publica "0.00" em evento pago e só a data, sem hora.
test("preço zero e data sem hora não viram grátis nem 00:00", () => {
  const html = ld({
    "@type": "Event",
    startDate: "2026-11-14",
    offers: { price: "0.00" },
  });
  expect(parseEventLd(html)).toMatchObject({ price: null, time: null });
});

test("esgotado e cancelado são lidos; JSON-LD quebrado não derruba", () => {
  expect(
    parseEventLd(
      ld({
        "@graph": [
          {
            "@type": "MusicEvent",
            offers: [{ availability: "https://schema.org/SoldOut", price: 50 }],
          },
        ],
      }),
    ).status,
  ).toBe("esgotado");
  expect(
    parseEventLd(
      ld({
        "@type": "Event",
        eventStatus: "https://schema.org/EventCancelled",
      }),
    ).status,
  ).toBe("cancelado");
  expect(
    parseEventLd('<script type="application/ld+json">{quebrado</script>'),
  ).toMatchObject({ price: null, status: null });
});

test("evento completo não abre a página", async () => {
  const calls = stubFetch(async () => new Response(""));
  const d = await fetchDetails([
    {
      id: "a",
      image: "https://img.test/a.jpg",
      link: "https://ev.test/a",
      price: "R$ 10",
      time: "20:00",
      address: "Rua A, 1",
    },
  ]);
  expect(calls).toHaveLength(0);
  expect(d.get("a")?.image).toBe("https://img.test/a.jpg");
});

test("enrichEvent completa o vazio sem apagar o que a fonte deu", () => {
  upsertEvent({
    title: "Show Enriquecido",
    date: "2031-05-10",
    time: null,
    venue: "Bar",
    city: "Franca",
    price: "R$ 30",
    link: "https://ev.test/x",
    image: null,
  });
  const [ev] = eventsOn("2031-05-10");
  enrichEvent(ev.id, { price: "R$ 99", time: "22:00", status: "esgotado" });
  const [depois] = eventsOn("2031-05-10");
  expect(depois).toMatchObject({
    price: "R$ 30",
    time: "22:00",
    status: "esgotado",
  });
});

const base = {
  id: "c1",
  title: "Stand-up do Fulano",
  date: "2026-11-01",
  time: "20:00",
  venue: "Teatro Municipal",
  city: "Franca",
  price: "grátis",
  link: "https://ev.test/c1",
  image: null,
  trailer: null,
  end_date: null,
  description: "Uma noite de risadas com o melhor da comédia regional.",
  status: "esgotado",
} as Event;

test("card mostra categoria, dia relativo, grátis e status, sem citação literal", () => {
  const card = eventLines(base, "2026-10-29");
  expect(card.startsWith("😂 *Stand-up do Fulano*")).toBe(true);
  expect(card).toContain("🚫 *ESGOTADO*");
  expect(card).toContain("(em 3 dias) às 20:00");
  expect(card).toContain("🆓 grátis");
  expect(card).not.toContain("> ");
  expect(quando("2026-10-30", "2026-10-29")).toStartWith("amanhã");
});

test("botão de agenda abre o Google Agenda já preenchido", () => {
  const url = new URL(calendarUrl(base));
  expect(url.searchParams.get("dates")).toBe("20261101T200000/20261101T230000");
  expect(url.searchParams.get("ctz")).toBe("America/Sao_Paulo");
  expect(url.searchParams.get("location")).toBe("Teatro Municipal, Franca");
  const diaInteiro = new URL(
    calendarUrl({ ...base, time: null, end_date: "2026-11-03" }),
  );
  expect(diaInteiro.searchParams.get("dates")).toBe("20261101/20261104");
  expect(
    eventButtons(base)
      .flat()
      .map((b) => b.text),
  ).toContain("📅 Salvar na agenda");
  expect(
    eventButtons({ ...base, status: "cancelado" })
      .flat()
      .map((b) => b.text),
  ).not.toContain("📅 Salvar na agenda");
});

test("curso, congresso e visita técnica saem; festa de curso fica", () => {
  const add = (title: string) =>
    upsertEvent({
      title,
      date: "2031-06-01",
      time: null,
      venue: null,
      city: "Franca",
      price: null,
      link: null,
      image: null,
    });
  add("PAMV 2026 - Clínica Médica de Pequenos Animais");
  add("Visita Técnica ao Centro Infantil Boldrini");
  add("3º CONESPIFRAN - CONGRESSO ESPÍRITA DE FRANCA");
  add("Festa da Pós-Graduação");
  add("Stacy e Soul do Brasil");
  pruneNonLeisure();
  expect(
    eventsOn("2031-06-01")
      .map((e) => e.title)
      .sort(),
  ).toEqual(["Festa da Pós-Graduação", "Stacy e Soul do Brasil"]);
});
