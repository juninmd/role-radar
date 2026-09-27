import { store } from "./util.js";

export const VIEWS = [
  { id: "radar", label: "Radar", emoji: "📡" },
  { id: "mapa", label: "Mapa", emoji: "🗺️" },
  { id: "agenda", label: "Agenda", emoji: "📆" },
  { id: "galeria", label: "Galeria", emoji: "🖼️" },
  { id: "decide", label: "Me decide", emoji: "🎲" },
  { id: "duelo", label: "Duelo", emoji: "⚔️" },
];

export const DEFAULT_FILTERS = {
  q: "",
  kinds: ["evento", "filme"],
  when: "tudo", // hoje | amanha | fds | 7d | 30d | tudo
  day: "", // dia exato escolhido na agenda
  periods: [], // manha | tarde | noite
  cities: [],
  cats: [],
  price: "qualquer", // gratis | 50 | 100 | qualquer
  unknownPrice: true,
  maxKm: 0, // 0 = sem limite
  sort: "data", // data | distancia | preco
  onlyFav: false,
};

const ARRAYS = ["kinds", "periods", "cities", "cats"];
const listeners = new Set();

export const state = {
  view: "radar",
  filters: structuredClone(DEFAULT_FILTERS),
  origin: null, // { name, lat, lng }
  catalog: null,
  items: [],
  favs: new Set(store.get("rr:favs", [])),
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  writeHash();
  for (const fn of listeners) fn(state);
}

export function setFilters(patch) {
  Object.assign(state.filters, patch);
  emit();
}

export function setView(view) {
  if (!VIEWS.some((v) => v.id === view)) return;
  state.view = view;
  emit();
}

export function toggleFav(id) {
  if (state.favs.has(id)) state.favs.delete(id);
  else state.favs.add(id);
  store.set("rr:favs", [...state.favs]);
  emit();
}

/** Filtros e visão vivem no hash: o link compartilhado abre igual. */
function writeHash() {
  const p = new URLSearchParams();
  if (state.view !== "radar") p.set("v", state.view);
  for (const [k, v] of Object.entries(state.filters)) {
    const def = DEFAULT_FILTERS[k];
    if (JSON.stringify(v) === JSON.stringify(def)) continue;
    p.set(k, ARRAYS.includes(k) ? v.join(",") : String(v));
  }
  const hash = p.toString();
  if (location.hash.slice(1) !== hash)
    history.replaceState(null, "", hash ? `#${hash}` : location.pathname);
}

export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const v = p.get("v");
  if (v && VIEWS.some((x) => x.id === v)) state.view = v;
  for (const k of Object.keys(DEFAULT_FILTERS)) {
    if (!p.has(k)) continue;
    const raw = p.get(k) ?? "";
    const def = DEFAULT_FILTERS[k];
    if (ARRAYS.includes(k))
      state.filters[k] = raw ? raw.split(",").slice(0, 50) : [];
    else if (typeof def === "boolean") state.filters[k] = raw === "true";
    else if (typeof def === "number") state.filters[k] = Number(raw) || 0;
    else state.filters[k] = raw.slice(0, 120);
  }
}
