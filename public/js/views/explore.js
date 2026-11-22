import { weekendDays } from "../data.js";
import { openDetail } from "../detail.js";
import { setFilters, setLayout, state, toggleFav } from "../state.js";
import {
  addDays,
  CATS,
  fmtKm,
  fmtPrice,
  h,
  humanDay,
  safeUrl,
  weekday,
} from "../util.js";
import { card } from "./card.js";

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const STRIP_DAYS = 14;
const PAGE = 48;
let shown = PAGE;
let lastKey = "";

/** Miniatura da linha: foto do evento ou o degradê da categoria com o emoji. */
function thumb(it, cat) {
  const img = safeUrl(it.image);
  return h(
    "span",
    { class: "row-thumb", "aria-hidden": "true" },
    h("span", { class: "row-emoji" }, cat.emoji),
    img
      ? h("img", {
          src: img,
          alt: "",
          loading: "lazy",
          referrerpolicy: "no-referrer",
          onerror: (e) => e.target.remove(),
        })
      : null,
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
      {
        type: "button",
        class: "row-main",
        "data-id": it.id,
        onclick: () => openDetail(it),
      },
      thumb(it, cat),
      h(
        "span",
        { class: "row-text" },
        h("span", { class: "row-title" }, it.title),
        h(
          "span",
          { class: "row-meta muted" },
          [`${cat.emoji} ${cat.label}`, it.venue, it.city, fmtKm(it.km)]
            .filter(Boolean)
            .join(" · "),
        ),
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
        "data-focus": `fav:${it.id}`,
        "aria-pressed": fav ? "true" : "false",
        // Rótulo fixo: o estado já vai em aria-pressed (botão de alternância).
        "aria-label": `Favoritar ${it.title}`,
        onclick: () => toggleFav(it.id),
      },
      fav ? "⭐" : "☆",
    ),
  );
}

/**
 * Faixa de dias: o único controle de data. Calor = quantos rolês cada dia tem
 * com os outros filtros aplicados; tocar fixa o dia, tocar de novo solta.
 * `items` chega já filtrado por tudo, menos a data.
 */
export function dayStrip(items, today) {
  const f = state.filters;
  const days = Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i));
  const count = (d) =>
    items.filter(
      (it) => it.date && it.date <= d && (it.endDate ?? it.date) >= d,
    ).length;
  const counts = days.map(count);
  const max = Math.max(1, ...counts);
  const tomorrow = addDays(today, 1);
  const wk = weekendDays(today);
  const nWk = items.filter(
    (it) => it.date && it.date <= wk.at(-1) && (it.endDate ?? it.date) >= wk[0],
  ).length;
  const isOn = (d) =>
    f.day === d ||
    (!f.day && f.when === "hoje" && d === today) ||
    (!f.day && f.when === "amanha" && d === tomorrow);
  const pill = (id, top, mid, bottom, pressed, onclick, extra = {}) =>
    h(
      "button",
      {
        type: "button",
        id,
        class: `daypill${extra.wknd ? " wknd" : ""}${extra.small ? " word" : ""}`,
        style: { "--heat": (extra.heat ?? 0).toFixed(2) },
        "aria-pressed": pressed ? "true" : "false",
        "aria-label": extra.label,
        onclick,
      },
      h("small", { "aria-hidden": "true" }, top),
      h("b", { "aria-hidden": "true" }, mid),
      h("i", { "aria-hidden": "true" }, bottom),
    );
  return h(
    "div",
    { class: "days glass", role: "group", "aria-label": "Escolher dia" },
    pill(
      "dia-todos",
      "todos",
      String(items.length),
      "rolês",
      !f.day && ["tudo", "7d", "30d"].includes(f.when),
      () => setFilters({ day: "", when: "tudo" }),
      { label: `Todos os dias: ${items.length} rolês` },
    ),
    pill(
      "dia-fds",
      "fim de",
      "semana",
      String(nWk),
      !f.day && f.when === "fds",
      () => setFilters({ day: "", when: f.when === "fds" ? "tudo" : "fds" }),
      { label: `Fim de semana: ${nWk} rolês`, wknd: true, small: true },
    ),
    days.map((d, i) => {
      const wd = weekday(d);
      const n = counts[i];
      return pill(
        `dia-${d}`,
        i === 0 ? "hoje" : WD[wd],
        d.slice(8),
        n ? String(n) : "–",
        isOn(d),
        () =>
          setFilters(
            isOn(d) ? { day: "", when: "tudo" } : { day: d, when: "tudo" },
          ),
        {
          heat: n / max,
          wknd: wd === 0 || wd === 5 || wd === 6,
          label: `${humanDay(d, today)}: ${n} rolê${n === 1 ? "" : "s"}`,
        },
      );
    }),
  );
}

function layoutBtn(id, label) {
  return h(
    "button",
    {
      type: "button",
      id: `fmt-${id}`,
      "aria-pressed": state.layout === id ? "true" : "false",
      onclick: () => setLayout(id),
    },
    label,
  );
}

function block(list) {
  return state.layout === "lista"
    ? h(
        "ul",
        { class: "rows" },
        list.map((it) => row(it)),
      )
    : h(
        "div",
        { class: "grid" },
        list.map((it) => card(it)),
      );
}

export function renderExplore(root, items) {
  const today = state.catalog.today;
  // Filtro novo volta à primeira página; trocar de formato mantém.
  const key = JSON.stringify(state.filters);
  if (key !== lastKey) shown = PAGE;
  lastKey = key;
  const page = items.slice(0, shown);
  // Agrupar por dia só faz sentido ordenando por data.
  const byDate = state.filters.sort === "data";
  let body;
  if (!items.length) {
    body = h(
      "p",
      { class: "glass pad muted center" },
      "Nenhum rolê com esses filtros. Toque em “todos” na faixa de dias ou afrouxe o preço.",
    );
  } else if (!byDate) {
    body = block(page);
  } else {
    const groups = new Map();
    for (const it of page) {
      // Evento que já começou entra no dia de hoje, não num dia passado.
      const k = it.date ? (it.date < today ? today : it.date) : "sempre";
      groups.set(k, [...(groups.get(k) ?? []), it]);
    }
    const keys = [...groups.keys()].sort((a, b) =>
      a === "sempre" ? 1 : b === "sempre" ? -1 : a.localeCompare(b),
    );
    body = keys.map((k) =>
      h(
        "section",
        { class: "day" },
        h(
          "h3",
          { class: "day-title" },
          k === "sempre" ? "📌 Sempre aberto" : humanDay(k, today),
          k !== "sempre" && k !== today
            ? h(
                "small",
                { class: "muted" },
                k.split("-").reverse().slice(0, 2).join("/"),
              )
            : null,
          h("span", { class: "pill" }, groups.get(k).length),
        ),
        block(groups.get(k)),
      ),
    );
  }

  root.replaceChildren(
    h(
      "div",
      { class: "explore-view" },
      h(
        "div",
        { class: "explore-bar" },
        h(
          "div",
          { class: "seg", role: "group", "aria-label": "Formato da lista" },
          layoutBtn("cards", "▦ Cards"),
          layoutBtn("lista", "☰ Lista"),
        ),
        h(
          "p",
          { class: "muted small" },
          `${items.length} ${items.length === 1 ? "rolê" : "rolês"}`,
        ),
        // Agenda inteira num arquivo: importa no Google, Apple ou Outlook.
        h(
          "a",
          { class: "btn small ghost", href: "/agenda.ics" },
          "📅 Baixar agenda (.ics)",
        ),
      ),
      body,
      items.length > shown
        ? h(
            "div",
            { class: "center pad" },
            h(
              "button",
              {
                type: "button",
                class: "btn",
                "data-focus": "mais",
                onclick: () => {
                  shown += PAGE;
                  renderExplore(root, items);
                  root.querySelector('[data-focus="mais"]')?.focus();
                },
              },
              `Mostrar mais (${items.length - shown})`,
            ),
          )
        : null,
    ),
  );
}
