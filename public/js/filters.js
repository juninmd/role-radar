import { DEFAULT_FILTERS, KM_STEPS, setFilters, state } from "./state.js";
import { CATS, h, KINDS } from "./util.js";

const WHEN = [
  ["hoje", "Hoje"],
  ["amanha", "Amanhã"],
  ["fds", "Fim de semana"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["tudo", "Tudo"],
];
const PERIODS = [
  ["manha", "☀️ Manhã"],
  ["tarde", "🌇 Tarde"],
  ["noite", "🌙 Noite"],
];
const PRICES = [
  ["gratis", "Grátis"],
  ["50", "até R$50"],
  ["100", "até R$100"],
  ["qualquer", "Qualquer"],
];
const SORTS = [
  ["data", "Data"],
  ["distancia", "Distância"],
  ["preco", "Preço"],
];

// id estável: o painel é redesenhado a cada clique e o foco precisa voltar.
const chip = (key, label, pressed, onclick) =>
  h(
    "button",
    {
      type: "button",
      class: "chip",
      id: `chip-${key}`,
      "aria-pressed": pressed ? "true" : "false",
      onclick,
    },
    label,
  );

const toggleIn = (list, v) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function group(title, ...content) {
  return h(
    "fieldset",
    { class: "fgroup" },
    h("legend", {}, title),
    h("div", { class: "chips" }, content),
  );
}

/** Contagem por valor considerando todos os outros filtros — mostra o que sobra. */
function countBy(key) {
  const m = new Map();
  for (const it of state.items) m.set(it[key], (m.get(it[key]) ?? 0) + 1);
  return m;
}

export function renderFilters(root, visibleCount) {
  const f = state.filters;
  const cities = [...countBy("city").entries()]
    .filter(([c]) => c)
    .sort((a, b) => b[1] - a[1]);
  const cats = countBy("category");
  const kmIdx = Math.max(0, KM_STEPS.indexOf(f.maxKm));

  const search = h("input", {
    type: "search",
    id: "q",
    class: "input",
    placeholder: "Buscar banda, lugar, peça…",
    value: f.q,
    "aria-label": "Buscar",
    autocomplete: "off",
  });
  search.addEventListener("input", () => {
    clearTimeout(search.timer);
    search.timer = setTimeout(() => setFilters({ q: search.value }), 180);
  });

  const km = h("input", {
    type: "range",
    min: 0,
    max: KM_STEPS.length - 1,
    step: 1,
    value: kmIdx,
    class: "range",
    id: "km",
    "aria-valuetext": f.maxKm ? `até ${f.maxKm} km` : "sem limite",
  });
  km.addEventListener("change", () =>
    setFilters({ maxKm: KM_STEPS[Number(km.value)] }),
  );

  const sort = h(
    "select",
    { class: "input", id: "sort", "aria-label": "Ordenar por" },
    SORTS.map(([v, l]) => h("option", { value: v, selected: f.sort === v }, l)),
  );
  sort.addEventListener("change", () => setFilters({ sort: sort.value }));

  root.replaceChildren(
    h(
      "div",
      { class: "fhead" },
      h("h2", {}, "Filtros"),
      h(
        "span",
        { class: "pill" },
        `${visibleCount} rolê${visibleCount === 1 ? "" : "s"}`,
      ),
      h(
        "button",
        {
          type: "button",
          class: "link-btn",
          onclick: () => setFilters(structuredClone(DEFAULT_FILTERS)),
        },
        "limpar",
      ),
    ),
    search,
    group(
      "O quê",
      Object.entries(KINDS).map(([k, v]) =>
        chip(`k-${k}`, `${v.emoji} ${v.label}`, f.kinds.includes(k), () =>
          setFilters({ kinds: toggleIn(f.kinds, k) }),
        ),
      ),
    ),
    group(
      "Quando",
      WHEN.map(([v, l]) =>
        chip(`w-${v}`, l, !f.day && f.when === v, () =>
          setFilters({ when: v, day: "" }),
        ),
      ),
      f.day
        ? chip(
            "day",
            `📌 ${f.day.split("-").reverse().slice(0, 2).join("/")} ✕`,
            true,
            () => {
              setFilters({ day: "" });
              // O chip some ao remover o dia: o foco vai ao chip de período ativo.
              document.getElementById(`chip-w-${f.when}`)?.focus();
            },
          )
        : null,
    ),
    group(
      "Período",
      PERIODS.map(([v, l]) =>
        chip(`p-${v}`, l, f.periods.includes(v), () =>
          setFilters({ periods: toggleIn(f.periods, v) }),
        ),
      ),
    ),
    group(
      "Vibe",
      Object.entries(CATS)
        .filter(([k]) => cats.has(k))
        .map(([k, c]) =>
          chip(
            `c-${k}`,
            [
              h("i", {
                class: "dot",
                style: { background: c.color },
                "aria-hidden": "true",
              }),
              `${c.emoji} ${c.label} `,
              h("small", {}, cats.get(k)),
            ],
            f.cats.includes(k),
            () => setFilters({ cats: toggleIn(f.cats, k) }),
          ),
        ),
    ),
    group(
      "Cidade",
      cities.map(([c, n]) =>
        chip(
          `city-${c.replace(/\W+/g, "")}`,
          [`${c} `, h("small", {}, n)],
          f.cities.includes(c),
          () => setFilters({ cities: toggleIn(f.cities, c) }),
        ),
      ),
    ),
    group(
      "Quanto",
      PRICES.map(([v, l]) =>
        chip(`$-${v}`, l, f.price === v, () => setFilters({ price: v })),
      ),
      chip("unk", "incluir sem preço", f.unknownPrice, () =>
        setFilters({ unknownPrice: !f.unknownPrice }),
      ),
    ),
    h(
      "fieldset",
      { class: "fgroup" },
      h(
        "legend",
        {},
        h(
          "label",
          { for: "km" },
          `Distância: ${f.maxKm ? `até ${f.maxKm} km` : "sem limite"}`,
        ),
      ),
      km,
      h(
        "p",
        { class: "muted small" },
        `a partir de ${state.origin?.name ?? "Franca"}`,
      ),
    ),
    h(
      "fieldset",
      { class: "fgroup row" },
      h("legend", {}, h("label", { for: "sort" }, "Ordenar")),
      sort,
      chip("fav", "⭐ só favoritos", f.onlyFav, () =>
        setFilters({ onlyFav: !f.onlyFav }),
      ),
    ),
  );
}
