import { openDetail } from "../detail.js";
import { state } from "../state.js";
import { h, reducedMotion } from "../util.js";
import { card } from "./gallery.js";

const MAX = 8;
let duel = null; // { queue, champ, rounds, total }

// Fisher–Yates: cada duelo começa com uma ordem nova.
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function start(items) {
  const favs = items.filter((it) => state.favs.has(it.id));
  const base = favs.length >= 2 ? favs : items;
  const queue = shuffle(base).slice(0, MAX);
  duel = {
    queue: queue.slice(1),
    champ: queue[0],
    rounds: 0,
    total: queue.length - 1,
    fromFavs: favs.length >= 2,
  };
}

function pick(root, items, winner) {
  duel.champ = winner;
  duel.queue.shift();
  duel.rounds++;
  renderDuel(root, items);
  root.querySelector(".duel-pair .card-hit, .champion .btn")?.focus();
}

export function renderDuel(root, items) {
  if (items.length < 2) {
    root.replaceChildren(
      h(
        "p",
        { class: "glass pad muted center" },
        "Precisa de pelo menos 2 rolês nos filtros pra ter duelo.",
      ),
    );
    return;
  }
  if (!duel) start(items);
  const restart = h(
    "button",
    {
      type: "button",
      class: "btn",
      onclick: () => {
        start(items);
        renderDuel(root, items);
      },
    },
    "🔄 Novo duelo",
  );

  if (!duel.queue.length) {
    root.replaceChildren(
      h(
        "div",
        { class: "duel-view" },
        h(
          "div",
          { class: `champion glass pad${reducedMotion() ? "" : " party"}` },
          h("p", { class: "eyebrow" }, "🏆 Campeão do seu duelo"),
          card(duel.champ),
          h(
            "div",
            { class: "actions center" },
            h(
              "button",
              {
                type: "button",
                class: "btn primary big",
                onclick: () => openDetail(duel.champ),
              },
              "Bora nesse!",
            ),
            restart,
          ),
        ),
      ),
    );
    return;
  }
  const challenger = duel.queue[0];
  const onKey = (e) => {
    if (e.key === "ArrowLeft") pick(root, items, duel.champ);
    if (e.key === "ArrowRight") pick(root, items, challenger);
  };
  root.replaceChildren(
    h(
      "div",
      { class: "duel-view", onkeydown: onKey },
      h(
        "div",
        { class: "duel-head glass pad" },
        h("h2", {}, "⚔️ Esse ou esse?"),
        h(
          "p",
          { class: "muted" },
          `Rodada ${duel.rounds + 1} de ${duel.total}${duel.fromFavs ? " · entre os seus favoritos" : " · favorite 2+ pra duelar só entre eles"}. Toque no que você prefere — ou use ← →.`,
        ),
        h("progress", {
          max: duel.total,
          value: duel.rounds,
          "aria-label": "Progresso do duelo",
        }),
        restart,
      ),
      h(
        "div",
        { class: "duel-pair" },
        card(duel.champ, { onPick: (it) => pick(root, items, it) }),
        h("span", { class: "vs", "aria-hidden": "true" }, "VS"),
        card(challenger, { onPick: (it) => pick(root, items, it) }),
      ),
    ),
  );
}

/** Filtros mudaram: o duelo em andamento perde o sentido. */
export function resetDuel() {
  duel = null;
}
