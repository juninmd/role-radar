import { openDetail } from "../detail.js";
import { setFilters, state, toggleFav } from "../state.js";
import {
  addDays,
  CATS,
  fmtKm,
  fmtPrice,
  h,
  humanDay,
  weekday,
} from "../util.js";

const WD = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Faixa dos próximos 30 dias: intensidade = nº de rolês. Clique fixa o dia. */
function heatStrip(items, today) {
  const counts = new Map();
  for (const it of items)
    if (it.date) counts.set(it.date, (counts.get(it.date) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));
  return h(
    "div",
    {
      class: "heat",
      role: "group",
      "aria-label": "Rolês por dia nos próximos 30 dias",
    },
    days.map((d) => {
      const n = counts.get(d) ?? 0;
      const wd = weekday(d);
      return h(
        "button",
        {
          type: "button",
          class: `heat-cell${wd === 0 || wd === 6 || wd === 5 ? " wknd" : ""}`,
          style: { "--heat": (n / max).toFixed(2) },
          "aria-pressed": state.filters.day === d ? "true" : "false",
          "aria-label": `${humanDay(d, today)}: ${n} rolê${n === 1 ? "" : "s"}`,
          title: `${humanDay(d, today)} · ${n}`,
          onclick: () => setFilters({ day: state.filters.day === d ? "" : d }),
        },
        h("span", { class: "wd", "aria-hidden": "true" }, WD[wd]),
        h("span", { class: "dn", "aria-hidden": "true" }, d.slice(8)),
        n ? h("b", { "aria-hidden": "true" }, n) : null,
      );
    }),
  );
}

export function row(it) {
  const cat = CATS[it.category] ?? CATS.outros;
  const fav = state.favs.has(it.id);
  return h(
    "li",
    { class: "row", style: { "--cat": cat.color } },
    h(
      "span",
      { class: "row-time" },
      it.time ?? (it.kind === "filme" ? "🍿" : "—"),
    ),
    h(
      "button",
      { type: "button", class: "row-main", onclick: () => openDetail(it) },
      h("span", { class: "row-title" }, it.title),
      h(
        "span",
        { class: "row-meta muted" },
        [`${cat.emoji} ${cat.label}`, it.venue, it.city, fmtKm(it.km)]
          .filter(Boolean)
          .join(" · "),
      ),
    ),
    fmtPrice(it)
      ? h(
          "span",
          { class: `row-price${it.priceMin === 0 ? " free" : ""}` },
          fmtPrice(it),
        )
      : null,
    h(
      "button",
      {
        type: "button",
        class: "icon-btn",
        "aria-pressed": fav ? "true" : "false",
        "aria-label": fav
          ? `Tirar ${it.title} dos favoritos`
          : `Favoritar ${it.title}`,
        onclick: () => toggleFav(it.id),
      },
      fav ? "⭐" : "☆",
    ),
  );
}

export function renderAgenda(root, items) {
  const today = state.catalog.today;
  const byDay = new Map();
  for (const it of items) {
    const key = it.date ?? "sempre";
    byDay.set(key, [...(byDay.get(key) ?? []), it]);
  }
  const keys = [...byDay.keys()].sort((a, b) =>
    a === "sempre" ? 1 : b === "sempre" ? -1 : a.localeCompare(b),
  );
  root.replaceChildren(
    h(
      "div",
      { class: "agenda-view" },
      h(
        "div",
        { class: "glass pad" },
        h("h3", {}, "🔥 Próximos 30 dias"),
        heatStrip(
          state.items.filter((it) => it.kind === "evento"),
          today,
        ),
        h(
          "p",
          { class: "muted small" },
          "Clique num dia pra ver só ele. Sex–dom em destaque.",
        ),
      ),
      keys.length
        ? keys.map((k) =>
            h(
              "section",
              { class: "day glass" },
              h(
                "h3",
                { class: "day-title" },
                k === "sempre" ? "📌 Sempre aberto" : humanDay(k, today),
                k !== "sempre" && k !== today
                  ? h(
                      "small",
                      { class: "muted" },
                      ` ${k.split("-").reverse().join("/")}`,
                    )
                  : null,
                h("span", { class: "pill" }, byDay.get(k).length),
              ),
              h(
                "ul",
                { class: "rows" },
                byDay.get(k).map((it) => row(it)),
              ),
            ),
          )
        : h(
            "p",
            { class: "glass pad muted center" },
            "Nenhum rolê com esses filtros. Tenta afrouxar a data ou o preço.",
          ),
    ),
  );
}
