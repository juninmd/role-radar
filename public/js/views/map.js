import { openDetail } from "../detail.js";
import { ensureLeaflet } from "../leaflet-loader.js";
import { emit, setRings, state } from "../state.js";
import { CATS, fmtKm, h, humanDay } from "../util.js";
import { card } from "./card.js";

// Anéis que antes eram o "radar de distância": agora são camada do mapa real.
const RINGS_KM = [10, 50, 100];
const CAROUSEL_MAX = 40;

// Tooltip/popup recebem nó DOM, nunca string: string vira innerHTML no Leaflet.
// Um mapa só, reaproveitado entre renders: recriar o Leaflet a cada filtro
// piscaria os tiles e vazaria listeners.
let map = null;
let layer = null;
let originLayer = null;
// Enquadramento só muda quando o conjunto de pinos muda; senão cada favorito
// desfazia o zoom e o pan que o usuário tinha feito.
let fittedKey = null;
const box = h("div", {
  class: "map",
  role: "region",
  "aria-label": "Mapa dos rolês",
});

function popup(it) {
  const cat = CATS[it.category] ?? CATS.outros;
  return h(
    "div",
    { class: "pop" },
    h("strong", {}, `${cat.emoji} ${it.title}`),
    h(
      "span",
      {},
      [
        it.date ? humanDay(it.date, state.catalog.today) : "sempre aberto",
        it.time,
        fmtKm(it.km),
      ]
        .filter(Boolean)
        .join(" · "),
    ),
    it.venue ? h("span", { class: "muted" }, it.venue) : null,
    it.pin.approx
      ? h(
          "em",
          { class: "muted small" },
          "posição aproximada (centro da cidade)",
        )
      : null,
    h(
      "button",
      {
        type: "button",
        class: "btn primary small",
        onclick: () => openDetail(it),
      },
      "Ver detalhes",
    ),
  );
}

/** Toque no pino traz o card dele para o meio do carrossel e o destaca. */
function focusCard(it) {
  const el = document.querySelector(
    `.map-carousel .card-hit[data-id="${CSS.escape(it.id)}"]`,
  );
  if (!el) return;
  for (const c of document.querySelectorAll(".map-carousel .card.sel"))
    c.classList.remove("sel");
  el.closest(".card")?.classList.add("sel");
  el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

export function renderMap(root, items) {
  const pts = items.filter((it) => it.pin);
  root.replaceChildren(
    h(
      "div",
      { class: "map-view glass" },
      h(
        "div",
        { class: "map-head" },
        h(
          "p",
          { class: "muted small" },
          `${pts.length} ${pts.length === 1 ? "rolê" : "rolês"} no mapa · contorno tracejado = local aproximado`,
        ),
        h(
          "button",
          {
            type: "button",
            class: "chip",
            id: "map-rings",
            "aria-pressed": state.rings ? "true" : "false",
            onclick: () => setRings(!state.rings),
          },
          "◎ Anéis de distância",
        ),
        h(
          "div",
          { class: "legend" },
          [...new Set(pts.map((it) => it.category))].map((c) =>
            h(
              "span",
              { class: "legend-item static" },
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
      // Sem pino o mapa só mostra a origem: a frase diz por que está vazio.
      pts.length
        ? null
        : h(
            "p",
            { class: "glass pad muted center" },
            "Nenhum rolê com localização nesses filtros. Os sem local ficam só nas listas.",
          ),
      box,
      pts.length
        ? h(
            "div",
            {
              class: "map-carousel",
              role: "list",
              "aria-label": "Rolês no mapa",
            },
            pts
              .slice(0, CAROUSEL_MAX)
              .map((it) =>
                h("div", { role: "listitem" }, card(it, { compact: true })),
              ),
          )
        : null,
    ),
  );

  if (!window.L) {
    box.replaceChildren(
      h("p", { class: "muted center pad" }, "Carregando o mapa…"),
    );
    ensureLeaflet().then(
      () => emit(),
      () =>
        box.replaceChildren(
          h(
            "p",
            { class: "muted center pad" },
            "Não consegui carregar o mapa (CDN do Leaflet fora do ar). As outras visões seguem funcionando.",
          ),
        ),
    );
    return;
  }
  const L = window.L;
  if (!map) {
    // Tira o aviso de carregamento (ou de erro) antes de o Leaflet montar ali.
    box.replaceChildren();
    map = L.map(box, { zoomControl: true, attributionControl: true }).setView(
      [state.origin.lat, state.origin.lng],
      11,
    );
    L.tileLayer(
      // Tiles do OSM (sem chave); o tema escuro é filtro CSS em .map-tiles.
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        className: "map-tiles",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ).addTo(map);
    layer = L.layerGroup().addTo(map);
    originLayer = L.layerGroup().addTo(map);
  }
  layer.clearLayers();
  originLayer.clearLayers();

  L.circleMarker([state.origin.lat, state.origin.lng], {
    radius: 8,
    color: "#4fffe0",
    fillColor: "#4fffe0",
    fillOpacity: 1,
    weight: 3,
  })
    .bindTooltip(h("span", {}, state.origin.name))
    .addTo(originLayer);
  if (state.rings)
    for (const km of RINGS_KM) {
      L.circle([state.origin.lat, state.origin.lng], {
        radius: km * 1000,
        color: "#4fc3ff",
        weight: 1,
        opacity: 0.6,
        fill: false,
        dashArray: "2 8",
        interactive: false,
      }).addTo(originLayer);
      // Rótulo na borda norte do anel (1° de latitude ≈ 111 km).
      L.marker([state.origin.lat + km / 111, state.origin.lng], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "ring-label",
          html: `${km} km`,
          iconSize: [48, 16],
          iconAnchor: [24, 8],
        }),
      }).addTo(originLayer);
    }
  if (state.filters.maxKm)
    L.circle([state.origin.lat, state.origin.lng], {
      radius: state.filters.maxKm * 1000,
      color: "#4fffe0",
      weight: 1,
      fillOpacity: 0.04,
      dashArray: "4 6",
    }).addTo(originLayer);

  for (const it of pts) {
    const color = CATS[it.category]?.color ?? "#fff";
    L.circleMarker([it.pin.lat, it.pin.lng], {
      radius: it.kind === "evento" ? (it.daysAhead === 0 ? 10 : 8) : 6,
      color: state.favs.has(it.id) ? "#ffd84f" : color,
      weight: state.favs.has(it.id) ? 3 : 2,
      dashArray: it.pin.approx ? "3 3" : null,
      fillColor: color,
      fillOpacity: it.pin.approx ? 0.35 : 0.85,
    })
      .bindPopup(() => popup(it))
      .on("click", () => focusCard(it))
      .bindTooltip(h("span", {}, it.title))
      .addTo(layer);
  }
  // O container acabou de voltar pro DOM: Leaflet precisa remedir.
  const key = pts.map((it) => it.id).join("|");
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (pts.length && key !== fittedKey)
      map.fitBounds(
        L.latLngBounds(pts.map((it) => [it.pin.lat, it.pin.lng])).pad(0.15),
        { maxZoom: 14 },
      );
    fittedKey = key;
  });
}
