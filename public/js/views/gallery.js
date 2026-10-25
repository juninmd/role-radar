import { openDetail } from "../detail.js";
import { state, toggleFav } from "../state.js";
import { CATS, fmtKm, fmtPrice, h, humanDay, safeUrl } from "../util.js";

export function card(it, { compact = false, onPick = null } = {}) {
  const cat = CATS[it.category] ?? CATS.outros;
  const img = safeUrl(it.image);
  const fav = state.favs.has(it.id);
  const today = state.catalog.today;
  return h(
    "article",
    {
      class: `card glass${compact ? " compact" : ""}`,
      style: { "--cat": cat.color },
    },
    h(
      "button",
      {
        type: "button",
        class: "card-hit",
        // Acha o card de volta ao fechar o drawer, mesmo após o re-render.
        "data-id": it.id,
        onclick: () => (onPick ? onPick(it) : openDetail(it)),
        "aria-label": onPick
          ? `Escolher ${it.title}`
          : `Detalhes de ${it.title}`,
      },
      h(
        "div",
        { class: "card-img" },
        img
          ? h("img", {
              src: img,
              alt: "",
              loading: "lazy",
              referrerpolicy: "no-referrer",
              onerror: (e) => e.target.remove(),
            })
          : null,
        h("span", { class: "card-emoji", "aria-hidden": "true" }, cat.emoji),
        h(
          "div",
          { class: "badges" },
          it.daysAhead === 0 ? h("span", { class: "badge hot" }, "HOJE") : null,
          it.priceMin === 0
            ? h("span", { class: "badge free" }, "GRÁTIS")
            : null,
          it.daily ? h("span", { class: "badge" }, "✨ dica do dia") : null,
        ),
      ),
      h(
        "div",
        { class: "card-body" },
        h("span", { class: "card-cat" }, `${cat.emoji} ${cat.label}`),
        h("h3", { class: "card-title" }, it.title),
        h(
          "p",
          { class: "card-meta muted" },
          [
            it.date ? humanDay(it.date, today) : "sempre aberto",
            it.endDate && `até ${humanDay(it.endDate, today)}`,
            it.time,
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        h(
          "p",
          { class: "card-meta muted" },
          [it.city, fmtKm(it.km), fmtPrice(it)].filter(Boolean).join(" · "),
        ),
      ),
    ),
    onPick
      ? null
      : h(
          "button",
          {
            type: "button",
            class: "icon-btn card-fav",
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

const PAGE = 48;
let shown = PAGE;

export function renderGallery(root, items) {
  const grid = h(
    "div",
    { class: "grid" },
    items.slice(0, shown).map((it) => card(it)),
  );
  root.replaceChildren(
    h(
      "div",
      {},
      items.length
        ? grid
        : h(
            "p",
            { class: "glass pad muted center" },
            "Nada por aqui com esses filtros.",
          ),
      items.length > shown
        ? h(
            "div",
            { class: "center pad" },
            h(
              "button",
              {
                type: "button",
                class: "btn",
                onclick: () => {
                  shown += PAGE;
                  renderGallery(root, items);
                },
              },
              `Mostrar mais (${items.length - shown})`,
            ),
          )
        : null,
    ),
  );
}
