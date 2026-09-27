import { openDetail } from "../detail.js";
import { state } from "../state.js";
import { CATS, fmtKm, h, humanDay, s } from "../util.js";
import { C, polar, R, SWEEP_S, sectorPath } from "./radar-geo.js";

function blipNode({ it, angle, r }, tip) {
  const [x, y] = polar(angle, r);
  const color = CATS[it.category]?.color ?? "#fff";
  const size = it.kind === "evento" ? (it.daysAhead === 0 ? 12 : 9) : 7;
  const label = `${it.title} — ${it.date ? humanDay(it.date, state.catalog.today) : "lugar fixo"}${it.km !== null ? `, ${fmtKm(it.km)}` : ""}`;
  const shape =
    it.kind === "lugar"
      ? s("rect", {
          x: -size * 0.8,
          y: -size * 0.8,
          width: size * 1.6,
          height: size * 1.6,
          transform: "rotate(45)",
          fill: color,
        })
      : s("circle", { r: size, fill: color });
  const g = s(
    "g",
    {
      class: `blip${it.daysAhead === 0 ? " today" : ""}${it.pin?.approx ? " approx" : ""}`,
      transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})`,
      tabindex: 0,
      role: "button",
      "aria-label": label,
      // O halo pisca quando o feixe passa por cima: atraso = ângulo / volta.
      style: {
        "--delay": `${((angle / 360) * SWEEP_S - SWEEP_S).toFixed(2)}s`,
        color,
      },
    },
    s("circle", { class: "halo", r: size + 8, fill: color }),
    shape,
    state.favs.has(it.id)
      ? s("circle", { r: size + 4, class: "fav-ring" })
      : null,
  );
  const show = () => tip.show(it, x, y);
  g.addEventListener("click", () => openDetail(it));
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail(it);
    }
  });
  g.addEventListener("mouseenter", show);
  g.addEventListener("focus", show);
  g.addEventListener("mouseleave", tip.hide);
  g.addEventListener("blur", tip.hide);
  return g;
}

export function makeTip(wrap) {
  const el = h("div", {
    class: "radar-tip glass",
    hidden: true,
    "aria-hidden": "true",
  });
  wrap.append(el);
  return {
    show(it, x, y) {
      el.replaceChildren(
        h("strong", {}, it.title),
        h(
          "span",
          {},
          [
            CATS[it.category]?.emoji,
            it.date ? humanDay(it.date, state.catalog.today) : "sempre aberto",
            it.time,
            fmtKm(it.km),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      el.style.left = `${(x / 1000) * 100}%`;
      el.style.top = `${(y / 1000) * 100}%`;
      el.hidden = false;
    },
    hide() {
      el.hidden = true;
    },
  };
}

const defs = () =>
  s(
    "defs",
    {},
    s(
      "radialGradient",
      { id: "rg-bg" },
      s("stop", {
        offset: "0%",
        "stop-color": "#1b2350",
        "stop-opacity": ".55",
      }),
      s("stop", {
        offset: "100%",
        "stop-color": "#070914",
        "stop-opacity": "0",
      }),
    ),
    s(
      "linearGradient",
      { id: "rg-sweep", x1: "0", y1: "0", x2: "1", y2: "0" },
      s("stop", { offset: "0%", "stop-color": "#4fffe0", "stop-opacity": "0" }),
      s("stop", {
        offset: "100%",
        "stop-color": "#4fffe0",
        "stop-opacity": ".35",
      }),
    ),
  );

export function radarSvg({ rings, sectors, blips }, tip, mode) {
  return s(
    "svg",
    {
      viewBox: "0 0 1000 1000",
      class: "radar",
      role: "group",
      "aria-label": `Radar com ${blips.length} rolês`,
    },
    defs(),
    s("circle", {
      cx: C,
      cy: C,
      r: R,
      fill: "url(#rg-bg)",
      class: "radar-disc",
    }),
    sectors.map((sec, i) =>
      s("path", {
        d: sectorPath(sec.from, sec.to),
        class: "sector",
        fill: CATS[sec.cat]?.color,
        "fill-opacity": i % 2 ? 0.05 : 0.09,
      }),
    ),
    sectors.map((sec) => {
      const [x, y] = polar((sec.from + sec.to) / 2, R + 30);
      return s(
        "text",
        { x, y, class: "sector-label", "text-anchor": "middle" },
        `${CATS[sec.cat]?.emoji ?? ""} ${CATS[sec.cat]?.label ?? sec.cat}`,
      );
    }),
    rings.map(([r, label]) => [
      s("circle", { cx: C, cy: C, r, class: "ring" }),
      // Rótulo a 45°: no eixo norte ele brigava com a bússola.
      s(
        "text",
        { x: C + r * 0.71 + 4, y: C - r * 0.71 - 4, class: "ring-label" },
        label,
      ),
    ]),
    s("line", { x1: C, y1: C - R, x2: C, y2: C + R, class: "axis" }),
    s("line", { x1: C - R, y1: C, x2: C + R, y2: C, class: "axis" }),
    mode === "distancia"
      ? [
          ["N", 0],
          ["L", 90],
          ["S", 180],
          ["O", 270],
        ].map(([t, a]) => {
          const [x, y] = polar(a, R + 26);
          return s(
            "text",
            { x, y: y + 8, class: "compass", "text-anchor": "middle" },
            t,
          );
        })
      : null,
    s(
      "g",
      { class: "sweep", style: { "--sweep": `${SWEEP_S}s` } },
      s("path", { d: sectorPath(-40, 0), fill: "url(#rg-sweep)" }),
      s("line", { x1: C, y1: C, x2: C, y2: C - R, class: "sweep-edge" }),
    ),
    s(
      "g",
      { class: "blips" },
      [...blips].sort((a, b) => b.r - a.r).map((b) => blipNode(b, tip)),
    ),
    s("circle", { cx: C, cy: C, r: 7, class: "origin" }),
    s(
      "text",
      { x: C, y: C + 28, class: "origin-label", "text-anchor": "middle" },
      mode === "distancia" ? state.origin.name : "agora",
    ),
  );
}
