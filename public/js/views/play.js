import { setPlay, state } from "../state.js";
import { h } from "../util.js";
import { renderDecide } from "./decide.js";
import { renderDuel } from "./duel.js";

/** "Me decide" tem dois modos: o sorteio ponderado e o duelo (antes era outra aba). */
export function renderPlay(root, items) {
  const btn = (id, label) =>
    h(
      "button",
      {
        type: "button",
        id: `play-${id}`,
        "aria-pressed": state.play === id ? "true" : "false",
        onclick: () => setPlay(id),
      },
      label,
    );
  const stage = h("div", {});
  root.replaceChildren(
    h(
      "div",
      { class: "play-view" },
      h(
        "div",
        { class: "seg", role: "group", "aria-label": "Modo" },
        btn("sorteio", "🎲 Sorteio"),
        btn("duelo", "⚔️ Duelo"),
      ),
      stage,
    ),
  );
  (state.play === "duelo" ? renderDuel : renderDecide)(stage, items);
}
