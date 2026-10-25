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

// Opções do slider de distância; o hash só aceita estas (0 = sem limite).
export const KM_STEPS = [0, 2, 5, 10, 20, 50, 100, 150];
// Opções dos chips de preço (filters.js); o hash só aceita estas.
export const PRICE_STEPS = ["qualquer", "gratis", "50", "100"];
// Opções dos chips de quando e do select de ordenação; o hash só aceita estas.
const WHEN_STEPS = ["hoje", "amanha", "fds", "7d", "30d", "tudo"];
const SORT_STEPS = ["data", "distancia", "preco"];
const ARRAYS = ["kinds", "periods", "cities", "cats"];
const listeners = new Set();

// Valor salvo que não é lista (corrompido à mão ou por outra versão) não pode
// impedir o app de abrir.
const listaSalva = (key) => {
  const v = store.get(key, []);
  return Array.isArray(v) ? v : [];
};

export const state = {
  view: "radar",
  filters: structuredClone(DEFAULT_FILTERS),
  origin: null, // { name, lat, lng }
  catalog: null,
  items: [],
  favs: new Set(listaSalva("rr:favs")),
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
    else if (k === "maxKm")
      state.filters[k] = KM_STEPS.includes(Number(raw)) ? Number(raw) : 0;
    else if (k === "price")
      state.filters[k] = PRICE_STEPS.includes(raw) ? raw : "qualquer";
    else if (k === "when")
      state.filters[k] = WHEN_STEPS.includes(raw) ? raw : def;
    else if (k === "sort")
      state.filters[k] = SORT_STEPS.includes(raw) ? raw : def;
    else if (typeof def === "number") state.filters[k] = Number(raw) || 0;
    else state.filters[k] = raw.slice(0, 120);
  }
}
