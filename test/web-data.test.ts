import { beforeEach, expect, test } from "bun:test";
import { REGION_CITIES } from "../src/config/region.ts";
import { db, upsertEvent } from "../src/db.ts";
import { buildCatalog, safeUrl } from "../src/web/catalog.ts";
import { categorize, parsePrice } from "../src/web/classify.ts";
import { cleanVenue, geocodePlaces, geoKey } from "../src/web/geocode.ts";
import { CITY_COORDS, resolveCity } from "../src/web/places.ts";
import { cachedCoord } from "../src/web/store.ts";
import { json, stubFetch } from "./fetch.ts";

const today = "2026-09-27";
const noSleep = async () => {};

beforeEach(() => {
  db.exec("DELETE FROM events; DELETE FROM geocache; DELETE FROM snapshots;");
});

test("toda cidade da região tem coordenada — senão some do mapa e do radar", () => {
  for (const c of REGION_CITIES) expect(CITY_COORDS[c]).toBeDefined();
});

test("rótulo livre resolve pra cidade mais específica", () => {
  expect(resolveCity("Cinemas de Ribeirão Preto")).toBe("Ribeirão Preto");
  expect(resolveCity("RIBEIRAO CORRENTE")).toBe("Ribeirão Corrente");
  expect(resolveCity("Cinemas")).toBeNull();
  expect(resolveCity(null)).toBeNull();
});

test("categoria vem de palavra-chave, com stand-up vencendo teatro", () => {
  expect(categorize("Estreia: Mil Luas")).toBe("cinema");
  expect(categorize("Stand-up Comedy", "Teatro Municipal")).toBe("comedia");
  expect(categorize("Show do Péricles")).toBe("show");
  expect(categorize("Sesi Franca x Flamengo - NBB")).toBe("esporte");
  expect(categorize("Cavalleria Rusticana em Ribeirão Preto")).toBe("teatro");
  expect(categorize("OKTOBERFEST RIBEIRÃO PRETO - 30/09")).toBe("festa");
  expect(categorize("Matuto SA + DJs Selectah")).toBe("festa");
  expect(categorize("MC Luiggi")).toBe("show");
  expect(categorize("Assembleia geral")).toBe("outros");
});

test("preço: menor valor em reais, 0 se grátis, null se não informado", () => {
  expect(parsePrice("R$ 80,00 a R$ 1.200,50")).toBe(80);
  expect(parsePrice("Entrada gratuita")).toBe(0);
  expect(parsePrice("a partir de R$ 35")).toBe(35);
  expect(parsePrice("consulte")).toBeNull();
  expect(parsePrice(null)).toBeNull();
});

// "Gratuito" para um público não torna grátis o preço pago por outro. Sem "R$"
// o número pode ser idade ("18+"), então a palavra ainda vale como grátis.
test("gratuito para um público com preço pago para outro não vira grátis", () => {
  expect(parsePrice("Gratuito para crianças, R$ 30 adulto")).toBe(30);
  expect(parsePrice("Gratuito 18+")).toBe(0);
  expect(parsePrice("Grátis R$ 0,00")).toBe(0);
});

test("safeUrl barra javascript: e data: vindos de fonte externa", () => {
  expect(safeUrl("javascript:alert(1)")).toBeNull();
  expect(safeUrl("data:text/html,x")).toBeNull();
  expect(safeUrl("https://x.test/a")).toBe("https://x.test/a");
});

test("geocode: erro de rede não vira cache negativo; resposta vazia vira", async () => {
  const ok = { venue: "Teatro Bom", city: "Franca" };
  const vazio = { venue: "Lugar Nenhum", city: "Franca" };
  const quebrado = { venue: "Teatro Caído", city: "Franca" };
  stubFetch(async (url) => {
    const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
    if (q.startsWith("Teatro Bom"))
      return json([{ lat: "-20.54", lon: "-47.40" }]);
    if (q.startsWith("Lugar Nenhum")) return json([]);
    return new Response("", { status: 503 });
  });
  await geocodePlaces([ok, vazio, quebrado], 10, noSleep);
  expect(cachedCoord(geoKey(ok))).toEqual({ lat: -20.54, lng: -47.4 });
  expect(cachedCoord(geoKey(vazio))).toBeNull();
  expect(cachedCoord(geoKey(quebrado))).toBeUndefined();
});

test("geocode: homônimo longe da cidade é descartado", async () => {
  const p = { venue: "Praça Central", city: "Franca" };
  stubFetch(async () => json([{ lat: "-23.55", lon: "-46.63" }])); // São Paulo
  await geocodePlaces([p], 10, noSleep);
  expect(cachedCoord(geoKey(p))).toBeNull();
});

test("geocode: respeita o teto por rodada e não repete o que já está no cache", async () => {
  const calls = stubFetch(async () => json([]));
  const places = ["A", "B", "C"].map((v) => ({ venue: v, city: "Franca" }));
  await geocodePlaces(places, 2, noSleep);
  expect(calls.length).toBe(2);
  await geocodePlaces(places, 10, noSleep);
  expect(calls.length).toBe(3);
});

test("catálogo: pin real do cache, aproximado pela cidade, nulo sem cidade", async () => {
  const ev = (
    title: string,
    venue: string | null,
    city: string | null,
    description: string | null = null,
  ) =>
    upsertEvent({
      title,
      date: today,
      time: "20:00",
      venue,
      city,
      price: "R$ 20",
      link: "javascript:x",
      image: null,
      description,
    });
  ev("Com endereço", "Teatro Bom", "Franca", "Show intimista acústico");
  ev("Só cidade", null, "Batatais");
  ev("Sem cidade", null, "Cinemas");
  stubFetch(async () => json([{ lat: "-20.54", lon: "-47.40" }]));
  await geocodePlaces([{ venue: "Teatro Bom", city: "Franca" }], 10, noSleep);

  const cat = buildCatalog(today);
  const by = (t: string) => cat.events.find((e) => e.title === t);
  expect(by("Com endereço")?.pin).toEqual({
    lat: -20.54,
    lng: -47.4,
    approx: false,
  });
  expect(by("Só cidade")?.pin?.approx).toBe(true);
  expect(by("Sem cidade")?.pin).toBeNull();
  expect(by("Com endereço")?.link).toBeNull();
  expect(by("Com endereço")?.priceMin).toBe(20);
  expect(by("Com endereço")?.description).toBe("Show intimista acústico");
  expect(by("Só cidade")?.description).toBeNull();
  expect(cat.spots.length).toBeGreaterThan(0);
  expect(cat.spots.some((s) => s.id === cat.dailySpot)).toBe(true);
});

test("nome do local sai limpo pro geocoder", () => {
  expect(cleanVenue("Alcans Park - 20h00", "Ribeirão Preto")).toBe(
    "Alcans Park",
  );
  expect(cleanVenue("Bar Dom Pedro - Ribeirão Preto", "Ribeirão Preto")).toBe(
    "Bar Dom Pedro",
  );
  expect(cleanVenue("IMESB (Plateia Livre)", "Bebedouro")).toBe("IMESB");
});
