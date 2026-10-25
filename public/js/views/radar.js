import { openDetail } from "../detail.js";
import { setFilters, state } from "../state.js";
import { CATS, fmtKm, h, humanDay } from "../util.js";
import { layout } from "./radar-geo.js";
import { makeTip, radarSvg } from "./radar-svg.js";

let mode = "distancia";

const toggleCat = (c) =>
  setFilters({
    cats: state.filters.cats.includes(c)
      ? state.filters.cats.filter((x) => x !== c)
      : [...state.filters.cats, c],
  });

export function renderRadar(root, items) {
  const lay = layout(items, mode, state.filters.maxKm);
  const wrap = h("div", { class: "radar-wrap" });
  const tip = makeTip(wrap);
  wrap.prepend(radarSvg(lay, tip, mode));

  const near = [...lay.blips]
    .sort((a, b) => a.r - b.r)
    .slice(0, 8)
    .map((b) => b.it);
  const hidden = items.length - lay.blips.length;
  const cats = [...new Set(items.map((it) => it.category))];
  const modeBtn = (m, label) =>
    h(
      "button",
      {
        type: "button",
        class: "chip",
        id: `radar-${m}`,
        "aria-pressed": mode === m ? "true" : "false",
        onclick: () => {
          mode = m;
          renderRadar(root, items);
          document.getElementById(`radar-${m}`)?.focus();
        },
      },
      label,
    );

  root.replaceChildren(
    h(
      "div",
      { class: "radar-view" },
      h(
        "div",
        { class: "radar-stage glass" },
        h(
          "div",
          { class: "radar-toolbar" },
          h(
            "div",
            { class: "chips", role: "group", "aria-label": "Modo do radar" },
            modeBtn("distancia", "🧭 Distância"),
            modeBtn("tempo", "⏳ Tempo × vibe"),
          ),
          h(
            "p",
            { class: "muted small" },
            mode === "distancia"
              ? "Centro = você. Direção real, raio = distância."
              : "Centro = agora. Cada fatia é uma vibe, raio = quantos dias faltam.",
          ),
        ),
        wrap,
        hidden > 0
          ? h(
              "p",
              { class: "muted small center" },
              `${hidden} ${hidden === 1 ? "item sem" : "itens sem"} ${mode === "distancia" ? "localização" : "data"} ${hidden === 1 ? "fica" : "ficam"} só nas listas.`,
            )
          : null,
        h(
          "div",
          { class: "legend" },
          cats.map((c) =>
            h(
              "button",
              {
                type: "button",
                class: "legend-item",
                "aria-pressed": state.filters.cats.includes(c)
                  ? "true"
                  : "false",
                onclick: () => toggleCat(c),
              },
              h("i", {
                class: "dot",
                style: { background: CATS[c]?.color },
                "aria-hidden": "true",
              }),
              CATS[c]?.label ?? c,
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "radar-side glass" },
        h("h3", {}, mode === "distancia" ? "📍 Mais perto" : "⏱️ Mais cedo"),
        near.length
          ? h(
              "ol",
              { class: "mini-list" },
              near.map((it) =>
                h(
                  "li",
                  {},
                  h(
                    "button",
                    {
                      type: "button",
                      class: "mini",
                      onclick: () => openDetail(it),
                    },
                    h("i", {
                      class: "dot",
                      style: { background: CATS[it.category]?.color },
                      "aria-hidden": "true",
                    }),
                    h("span", { class: "mini-title" }, it.title),
                    h(
                      "small",
                      { class: "muted" },
                      [
                        it.date
                          ? humanDay(it.date, state.catalog.today)
                          : "sempre",
                        fmtKm(it.km),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    ),
                  ),
                ),
              ),
            )
          : h("p", { class: "muted" }, "Nada no radar com esses filtros."),
      ),
    ),
  );
}
