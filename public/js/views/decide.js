import { openDetail } from "../detail.js";
import { state } from "../state.js";
import {
  CATS,
  fmtKm,
  fmtPrice,
  h,
  humanDay,
  reducedMotion,
  store,
} from "../util.js";
import { pickWeighted, Q, score, spotsPool } from "./decide-score.js";
import { card } from "./gallery.js";

const DECIDE_DEFAULTS = {
  company: "amigos",
  vibe: "agitar",
  when: "qualquer",
  budget: "qualquer",
  reach: "20",
  spots: true,
};
// Valor corrompido no localStorage (ex.: "null") não pode esvaziar a aba.
const salvo = store.get("rr:decide", null);
let answers = {
  ...DECIDE_DEFAULTS,
  ...(salvo && typeof salvo === "object" ? salvo : {}),
};

function spin(ranked, stage, live, onDone) {
  const top = ranked.slice(0, 8);
  if (!top.length) return;
  const winner = pickWeighted(top);
  const show = (r, final) => {
    stage.replaceChildren(
      h(
        "div",
        { class: `slot${final ? " win" : ""}` },
        h(
          "span",
          { class: "slot-emoji", "aria-hidden": "true" },
          CATS[r.it.category]?.emoji,
        ),
        h("strong", {}, r.it.title),
        final
          ? h(
              "span",
              { class: "muted" },
              [
                r.it.date
                  ? humanDay(r.it.date, state.catalog.today)
                  : "sempre aberto",
                r.it.time,
                fmtKm(r.it.km),
                fmtPrice(r.it),
              ]
                .filter(Boolean)
                .join(" · "),
            )
          : null,
        final
          ? h(
              "button",
              {
                type: "button",
                class: "btn primary",
                onclick: () => openDetail(r.it),
              },
              "Bora! Ver detalhes",
            )
          : null,
      ),
    );
  };
  const finish = () => {
    show(winner, true);
    live.textContent = `Sorteado: ${winner.it.title}`;
    onDone();
  };
  if (reducedMotion()) return finish();
  let i = 0;
  let delay = 50;
  const tick = () => {
    show(top[i++ % top.length], false);
    delay *= 1.13;
    if (delay < 420) setTimeout(tick, delay);
    else setTimeout(finish, 250);
  };
  tick();
}

export function renderDecide(root, items) {
  const today = state.catalog.today;
  // Lugares fixos seguem os mesmos filtros (cidade, busca, vibe) das outras listas.
  const pool =
    answers.spots && !state.filters.kinds.includes("lugar")
      ? [
          ...items,
          ...spotsPool(
            state.items.filter((it) => it.kind === "lugar"),
            state.filters,
            today,
            state.favs,
          ),
        ]
      : items;
  const ranked = pool
    .map((it) => score(it, answers, today))
    .filter(Boolean)
    .sort((a, b) => b.pts - a.pts);
  const set = (k, v) => {
    answers = { ...answers, [k]: v };
    store.set("rr:decide", answers);
    renderDecide(root, items);
    document
      .getElementById(k === "spots" ? "dq-spots" : `dq-${k}-${v}`)
      ?.focus();
  };
  const live = h("p", { class: "sr-only", "aria-live": "assertive" });
  const stage = h(
    "div",
    { class: "slot-stage" },
    h(
      "p",
      { class: "muted" },
      "Responde aí em cima e deixa a sorte (ponderada) escolher.",
    ),
  );

  root.replaceChildren(
    h(
      "div",
      { class: "decide-view" },
      h(
        "div",
        { class: "quiz glass pad" },
        h("h2", {}, "🎲 Me decide"),
        Q.map(([k, label, opts]) =>
          h(
            "fieldset",
            { class: "fgroup" },
            h("legend", {}, label),
            h(
              "div",
              { class: "chips" },
              opts.map(([v, l]) =>
                h(
                  "button",
                  {
                    type: "button",
                    class: "chip big",
                    id: `dq-${k}-${v}`,
                    "aria-pressed": answers[k] === v ? "true" : "false",
                    onclick: () => set(k, v),
                  },
                  l,
                ),
              ),
            ),
          ),
        ),
        h(
          "button",
          {
            type: "button",
            class: "chip",
            id: "dq-spots",
            "aria-pressed": answers.spots ? "true" : "false",
            onclick: () => set("spots", !answers.spots),
          },
          "📌 Incluir lugares fixos (bares, cafés, parques) como plano B",
        ),
      ),
      h(
        "div",
        { class: "glass pad roulette" },
        h(
          "div",
          { class: "roulette-head" },
          h(
            "h3",
            {},
            ranked.length === 0
              ? "Nenhuma opção combina"
              : ranked.length === 1
                ? "1 opção combina"
                : `${ranked.length} opções combinam`,
          ),
          h(
            "button",
            {
              type: "button",
              class: "btn primary big",
              disabled: !ranked.length,
              onclick: (e) => {
                // Um sorteio por vez: um segundo clique sobrepõe as trocas de slot.
                const btn = e.currentTarget;
                btn.disabled = true;
                spin(ranked, stage, live, () => {
                  btn.disabled = !ranked.length;
                });
              },
            },
            "🎰 Sortear",
          ),
        ),
        stage,
        live,
      ),
      ranked.length
        ? h(
            "div",
            { class: "podium" },
            ranked
              .slice(0, 3)
              .map((r, i) =>
                h(
                  "div",
                  { class: "podium-slot" },
                  h(
                    "div",
                    { class: "match", style: { "--p": r.match } },
                    h("span", {}, `${r.match}%`),
                    h("small", {}, ["🥇", "🥈", "🥉"][i]),
                  ),
                  card(r.it, { compact: true }),
                  r.reasons.length
                    ? h(
                        "p",
                        { class: "muted small" },
                        `Porque: ${r.reasons.slice(0, 3).join(" · ")}`,
                      )
                    : null,
                ),
              ),
          )
        : h(
            "p",
            { class: "glass pad muted center" },
            'Nada combinou. Afrouxa a distância, o orçamento ou o "quando".',
          ),
      ranked.length > 3
        ? h(
            "details",
            { class: "glass pad" },
            h("summary", {}, `Ver o ranking completo (${ranked.length})`),
            h(
              "ol",
              { class: "mini-list" },
              ranked.slice(3, 60).map((r) =>
                h(
                  "li",
                  {},
                  h(
                    "button",
                    {
                      type: "button",
                      class: "mini",
                      onclick: () => openDetail(r.it),
                    },
                    h("span", { class: "pill" }, `${r.match}%`),
                    h("span", { class: "mini-title" }, r.it.title),
                    h(
                      "small",
                      { class: "muted" },
                      [
                        r.it.date ? humanDay(r.it.date, today) : "sempre",
                        fmtKm(r.it.km),
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    ),
                  ),
                ),
              ),
            ),
          )
        : null,
    ),
  );
}
