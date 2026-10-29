import { expect, test } from "bun:test";
import type { Event } from "../src/db.ts";
import {
  distanciaDeFranca,
  eventButtons,
  eventLines,
  vendaEm,
} from "../src/digest.ts";
import {
  climaDoEvento,
  linhaClima,
  parsePrevisao,
} from "../src/sources/clima.ts";
import { endereco, faixaEtaria } from "../src/sources/comum.ts";
import { parseEventLd } from "../src/sources/ogimage.ts";

const ev = (extra: Partial<Event> = {}): Event =>
  ({
    id: "x",
    title: "Art House - Funk Art Halloween",
    date: "2026-10-30",
    time: "21:00",
    end_time: "05:00",
    venue: "Art House",
    address: "R. Eliseu Guilherme, 354 - Jardim Sumaré",
    city: "Ribeirão Preto",
    price: "R$ 80 a R$ 105",
    link: "https://zig.tickets/eventos/art-house",
    image: null,
    trailer: null,
    end_date: null,
    description: null,
    age_rating: "18+",
    status: "ultimos",
    ...extra,
  }) as Event;

test("card traz endereço, distância, término, idade, clima e bilheteria", () => {
  const card = eventLines(ev(), "2026-10-29", {
    clima: "🌦️ 19–27°C · 60% de chuva",
  });
  for (const trecho of [
    "🔥 *Últimos ingressos*",
    "🗺️ R. Eliseu Guilherme, 354 - Jardim Sumaré",
    "🚗 ~83 km de Franca",
    "às 21:00 até 05:00",
    "🔞 Proibido para menores de 18",
    "🌦️ 19–27°C · 60% de chuva (previsão)",
    "🎫 Vendas: Zig",
  ])
    expect(card).toContain(trecho);
});

test("Franca não mostra distância; festival não mostra término", () => {
  expect(distanciaDeFranca("Franca")).toBeNull();
  expect(distanciaDeFranca("Cinemas")).toBeNull();
  const festival = eventLines(
    ev({ city: "Franca", end_date: "2026-11-01" }),
    "2026-10-29",
  );
  expect(festival).not.toContain("até 05:00");
  expect(festival).not.toContain("km de Franca");
});

test("Como chegar usa o endereço quando existe", () => {
  const maps = eventButtons(ev())
    .flat()
    .find((b) => b.text.includes("Como Chegar"));
  expect(decodeURIComponent(maps?.url ?? "")).toContain(
    "Art House, R. Eliseu Guilherme, 354 - Jardim Sumaré, Ribeirão Preto, SP",
  );
});

test("bilheteria pelo domínio; link estranho não quebra", () => {
  expect(vendaEm("https://www.sympla.com.br/evento/x/1")).toBe("Sympla");
  expect(vendaEm("https://cdn.q2ingressos.com.br/x")).toBe("Q2 Ingressos");
  expect(vendaEm("javascript:alert(1)")).toBeNull();
  expect(vendaEm(null)).toBeNull();
});

test("classificação e endereço normalizados", () => {
  expect(faixaEtaria("Livre")).toBe("Livre");
  expect(faixaEtaria("18+")).toBe("18+");
  expect(faixaEtaria("Classificação 16 anos")).toBe("16+");
  expect(faixaEtaria("3 anos")).toBeNull();
  expect(endereco("CHF ESPAÇO CULTURAL")).toBeNull();
  expect(endereco("Av. Santa Cruz, 2870")).toBe("Av. Santa Cruz, 2870");
});

test("JSON-LD traz término, idade, rua e lote limitado", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    startDate: "2026-10-30T21:00:00.000-03:00",
    endDate: "2026-10-31T05:00:00.000-03:00",
    typicalAgeRange: "18+",
    location: {
      address: { streetAddress: "R. Eliseu Guilherme, 354" },
    },
    offers: { availability: "LimitedAvailability", lowPrice: 80 },
  })}</script>`;
  expect(parseEventLd(html)).toMatchObject({
    end_time: "05:00",
    age_rating: "18+",
    address: "R. Eliseu Guilherme, 354",
    status: "ultimos",
  });
});

test("previsão da Open-Meteo vira linha curta do dia do evento", () => {
  const mapa = new Map([
    [
      "Franca",
      parsePrevisao({
        daily: {
          time: ["2026-10-29", "2026-10-30"],
          temperature_2m_max: [29.4, 31],
          temperature_2m_min: [17.6, 18],
          precipitation_probability_max: [10, 70],
          weather_code: [1, 95],
        },
      }),
    ],
  ]);
  expect(
    climaDoEvento(mapa, { city: "Franca", date: "2026-10-29" }, "2026-10-29"),
  ).toBe("🌤️ 18–29°C");
  expect(
    climaDoEvento(
      mapa,
      { city: "Cinema Moviecom Franca", date: "2026-10-30" },
      "2026-10-29",
    ),
  ).toBe("⛈️ 18–31°C · 70% de chuva");
  expect(
    climaDoEvento(mapa, { city: "Batatais", date: "2026-10-30" }, "2026-10-29"),
  ).toBeNull();
  expect(linhaClima({ min: 20, max: 30, chuva: null, code: 3 })).toBe(
    "☁️ 20–30°C",
  );
});

test("local que é a própria cidade não repete; teste do operador sai", async () => {
  const card = eventLines(
    ev({ venue: "Franca", city: "Franca", address: null }),
  );
  expect(card).toContain("📍 Franca\n");
  const { upsertEvent, eventsOn, pruneNonLeisure } = await import(
    "../src/db.ts"
  );
  upsertEvent({
    title: "Teste stress 30/10",
    date: "2031-07-01",
    time: null,
    venue: null,
    city: "Franca",
    price: null,
    link: null,
    image: null,
  });
  pruneNonLeisure();
  expect(eventsOn("2031-07-01")).toHaveLength(0);
});

test("endereço da Zig perde cidade, UF e sobra do fim", async () => {
  const { semCidade } = await import("../src/sources/zigtickets.ts");
  expect(
    semCidade(
      "R. Eliseu Guilherme, 354 - Jardim Sumare, Ribeirão Preto, SP - Art House",
      "Ribeirão Preto",
    ),
  ).toBe("R. Eliseu Guilherme, 354 - Jardim Sumare");
  expect(semCidade("Avenida Visconde, 2115, Centro", "Franca")).toBe(
    "Avenida Visconde, 2115, Centro",
  );
});
