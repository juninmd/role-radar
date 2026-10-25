import { openDetail } from "../detail.js";
import { ensureLeaflet } from "../leaflet-loader.js";
import { emit, state } from "../state.js";
import { CATS, fmtKm, h, humanDay } from "../util.js";

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
          `${pts.length} no mapa · contorno tracejado = local aproximado`,
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
      h(
        "ul",
        { class: "sr-only", "aria-label": "Rolês no mapa (lista acessível)" },
        pts
          .slice(0, 60)
          .map((it) =>
            h(
              "li",
              {},
              h(
                "button",
                { type: "button", onclick: () => openDetail(it) },
                `${it.title}, ${fmtKm(it.km) ?? ""}`,
              ),
            ),
          ),
      ),
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
