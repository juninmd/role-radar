import { eventsBetween } from "../db.ts";
import type { CinemaDay } from "../sources/cinema.ts";
import { FRANCA_SPOTS, getDailySpot } from "../sources/spots.ts";
import { type Category, categorize, parsePrice } from "./classify.ts";
import { geoKey, type Place } from "./geocode.ts";
import { CITY_COORDS, jitter, type LatLng, resolveCity } from "./places.ts";
import { cachedCoord, loadSnapshot } from "./store.ts";

export interface Pin {
  lat: number;
  lng: number;
  /** true = centro da cidade (sem endereço geocodificado). */
  approx: boolean;
}

export interface CatalogEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  price: string | null;
  priceMin: number | null;
  description: string | null;
  category: Category;
  pin: Pin | null;
  link: string | null;
  image: string | null;
  trailer: string | null;
  /** Último dia (festival/feira); `date` de evento em andamento já vem como hoje. */
  endDate: string | null;
}

export interface CatalogSpot {
  id: string;
  name: string;
  description: string;
  venue: string;
  category: Category;
  pin: Pin | null;
  image: string | null;
  mapsUrl: string;
}

export interface Catalog {
  generatedAt: string;
  today: string;
  dailySpot: string;
  origin: { name: string } & LatLng;
  events: CatalogEvent[];
  spots: CatalogSpot[];
  cinema: { at: string; days: (CinemaDay & { pin: Pin | null })[] } | null;
}

/** Só http(s): texto de fonte externa nunca vira `javascript:` num href. */
export const safeUrl = (u: string | null | undefined): string | null => {
  const t = u?.trim();
  return t && /^https?:\/\//i.test(t) ? t : null;
};

function pinFor(
  place: Place | null,
  city: string | null,
  seed: string,
): Pin | null {
  const hit = place ? cachedCoord(geoKey(place)) : undefined;
  if (hit) return { ...hit, approx: false };
  const resolved = resolveCity(city);
  if (!resolved) return null;
  return { ...jitter(CITY_COORDS[resolved], seed), approx: true };
}

const spotId = (name: string) =>
  `spot-${name
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase()}`;

/** Lugares fixos como Place pro geocoder (todos ficam em Franca). */
export const spotPlaces = (): Place[] =>
  FRANCA_SPOTS.map((s) => ({ venue: s.venue, city: "Franca" }));

export function buildCatalog(today: string): Catalog {
  const events = eventsBetween(today, "9999-12-31").map(
    (ev): CatalogEvent => ({
      id: ev.id,
      title: ev.title,
      // Em andamento conta como hoje: radar, agenda e "é hoje" batem sozinhos.
      date: ev.date < today ? today : ev.date,
      time: ev.time,
      venue: ev.venue,
      city: ev.city,
      price: ev.price,
      priceMin: parsePrice(ev.price),
      description: ev.description ?? null,
      category: categorize(ev.title, ev.venue),
      pin: pinFor(
        ev.venue ? { venue: ev.venue, city: ev.city } : null,
        ev.city,
        ev.id,
      ),
      link: safeUrl(ev.link),
      image: safeUrl(ev.image),
      trailer: safeUrl(ev.trailer),
      endDate: ev.end_date,
    }),
  );
  const spots = FRANCA_SPOTS.map(
    (s): CatalogSpot => ({
      id: spotId(s.name),
      name: s.name,
      description: s.description,
      venue: s.venue,
      category: categorize(s.name, s.venue),
      pin: pinFor({ venue: s.venue, city: "Franca" }, "Franca", s.name),
      image: safeUrl(s.image),
      mapsUrl: safeUrl(s.mapsUrl) ?? "",
    }),
  );
  return {
    generatedAt: new Date().toISOString(),
    today,
    dailySpot: spotId(getDailySpot(today).name),
    origin: { name: "Centro de Franca", ...CITY_COORDS.Franca },
    events,
    spots,
    cinema: (() => {
      const snap = loadSnapshot<CinemaDay[]>("cinema");
      if (!snap) return null;
      const days = snap.value.map((d) => ({
        ...d,
        pin: pinFor({ venue: d.cinema, city: d.city }, d.city, d.cinema),
        movies: d.movies.map((m) => ({
          ...m,
          link: safeUrl(m.link) ?? "",
          poster: safeUrl(m.poster),
          trailer: safeUrl(m.trailer),
        })),
      }));
      return { at: snap.at, days };
    })(),
  };
}
