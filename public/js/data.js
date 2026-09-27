import { addDays, bearing, daysBetween, distanceKm, weekday } from "./util.js";

export async function fetchCatalog() {
  const res = await fetch("/api/catalog", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const slug = (t) =>
  t
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();

/** Eventos, filmes em cartaz e lugares fixos viram um formato só. */
export function toItems(cat) {
  const events = cat.events.map((e) => ({
    ...e,
    kind: "evento",
    description: null,
    mapsUrl: null,
  }));
  const films = (cat.cinema?.days ?? []).flatMap((d) =>
    d.movies.map((m) => ({
      id: `film-${slug(m.title)}`,
      kind: "filme",
      title: m.title,
      category: "cinema",
      date: cat.today,
      time: null,
      venue: d.cinema,
      city: d.city,
      price: null,
      priceMin: null,
      pin: d.pin,
      link: m.link,
      image: m.poster,
      trailer: m.trailer,
      description: [
        m.genre,
        m.rating && `classificação ${m.rating}`,
        m.duration,
        m.premiere &&
          (m.premiere > cat.today
            ? `estreia ${m.premiere.split("-").reverse().join("/")}`
            : null),
      ]
        .filter(Boolean)
        .join(" · "),
      mapsUrl: null,
    })),
  );
  const spots = cat.spots.map((sp) => ({
    id: sp.id,
    kind: "lugar",
    title: sp.name,
    category: sp.category,
    date: null,
    time: null,
    venue: sp.venue,
    city: "Franca",
    price: null,
    priceMin: null,
    pin: sp.pin,
    link: null,
    image: sp.image,
    trailer: null,
    description: sp.description,
    mapsUrl: sp.mapsUrl,
    daily: sp.id === cat.dailySpot,
  }));
  return [...events, ...films, ...spots];
}

/** Distância/rumo a partir da origem atual e campos de tempo derivados. */
export function enrich(items, origin, today) {
  for (const it of items) {
    it.km = it.pin ? distanceKm(origin, it.pin) : null;
    it.bearing = it.pin ? bearing(origin, it.pin) : null;
    it.daysAhead = it.date ? daysBetween(today, it.date) : null;
    const hour = it.time ? Number(it.time.slice(0, 2)) : null;
    it.period =
      hour === null
        ? null
        : hour < 12
          ? "manha"
          : hour < 18
            ? "tarde"
            : "noite";
  }
  return items;
}

/** Datas do fim de semana (sex–dom) mais próximo, contando hoje. */
export function weekendDays(today) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const wd = weekday(d);
    if (wd === 5 || wd === 6 || wd === 0) out.push(d);
    if (wd === 0) break;
  }
  return out;
}

function matchesWhen(it, f, today) {
  if (!it.date) return true; // lugar fixo: sempre aberto pro radar
  if (f.day) return it.date === f.day;
  switch (f.when) {
    case "hoje":
      return it.date === today;
    case "amanha":
      return it.date === addDays(today, 1);
    case "fds":
      return weekendDays(today).includes(it.date);
    case "7d":
      return it.daysAhead <= 7;
    case "30d":
      return it.daysAhead <= 30;
    default:
      return true;
  }
}

function matchesPrice(it, f) {
  if (f.price === "qualquer") return true;
  if (it.priceMin === null) return f.unknownPrice;
  return f.price === "gratis"
    ? it.priceMin === 0
    : it.priceMin <= Number(f.price);
}

const norm = (t) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function applyFilters(items, f, today, favs) {
  const q = norm(f.q).trim();
  const out = items.filter(
    (it) =>
      f.kinds.includes(it.kind) &&
      (!f.onlyFav || favs.has(it.id)) &&
      (!f.cats.length || f.cats.includes(it.category)) &&
      (!f.cities.length || f.cities.includes(it.city)) &&
      (!f.periods.length ||
        it.kind !== "evento" ||
        f.periods.includes(it.period)) &&
      (!f.maxKm || (it.km !== null && it.km <= f.maxKm)) &&
      matchesWhen(it, f, today) &&
      matchesPrice(it, f) &&
      (!q ||
        norm(`${it.title} ${it.venue} ${it.city} ${it.description}`).includes(
          q,
        )),
  );
  const byDate = (a, b) =>
    (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
    (a.time ?? "99").localeCompare(b.time ?? "99");
  const sorters = {
    data: byDate,
    distancia: (a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || byDate(a, b),
    preco: (a, b) => (a.priceMin ?? 1e9) - (b.priceMin ?? 1e9) || byDate(a, b),
  };
  return out.sort(sorters[f.sort] ?? byDate);
}
