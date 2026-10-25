import {
  applyFilters,
  enrich,
  fetchCatalog,
  toItems,
  weekendDays,
} from "./data.js";
import { initDetail, openDetail } from "./detail.js";
import { renderFilters } from "./filters.js";
import { emit, readHash, setView, state, subscribe, VIEWS } from "./state.js";
import { h, toast } from "./util.js";
import { renderAgenda } from "./views/agenda.js";
import { renderDecide } from "./views/decide.js";
import { renderDuel, resetDuel } from "./views/duel.js";
import { renderGallery } from "./views/gallery.js";
import { renderMap } from "./views/map.js";
import { renderRadar } from "./views/radar.js";

const RENDER = {
  radar: renderRadar,
  mapa: renderMap,
  agenda: renderAgenda,
  galeria: renderGallery,
  decide: renderDecide,
  duelo: renderDuel,
};
const REFRESH_MS = 30 * 60 * 1000;
const $ = (id) => document.getElementById(id);

// Mostra o fade só enquanto ainda há aba além da borda direita.
function markTabsScroll() {
  const t = $("tabs");
  t.classList.toggle(
    "more-right",
    t.scrollLeft + t.clientWidth < t.scrollWidth - 4,
  );
}
$("tabs").addEventListener("scroll", markTabsScroll, { passive: true });
// Girar o celular pode caber todas as abas: sem overflow, a pista some.
window.addEventListener("resize", markTabsScroll);

function renderTabs() {
  $("tabs").replaceChildren(
    ...VIEWS.map((v) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          id: `tab-${v.id}`,
          class: "tab",
          "aria-selected": state.view === v.id ? "true" : "false",
          "aria-controls": "view",
          tabindex: state.view === v.id ? 0 : -1,
          onclick: () => setView(v.id),
        },
        h("span", { "aria-hidden": "true" }, v.emoji),
        ` ${v.label}`,
      ),
    ),
  );
  markTabsScroll();
  $("view").setAttribute("aria-labelledby", `tab-${state.view}`);
}

// Setas trocam de aba (padrão WAI-ARIA de tablist).
$("tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = VIEWS.findIndex((v) => v.id === state.view);
  const next =
    VIEWS[(i + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length];
  setView(next.id);
  $(`tab-${next.id}`).focus();
});

function renderStats(visible) {
  const today = state.catalog.today;
  const ev = state.items.filter((it) => it.kind === "evento");
  const wknd = weekendDays(today);
  const stat = (n, label) =>
    h("li", { class: "stat" }, h("b", {}, n), h("span", {}, label));
  $("stats").replaceChildren(
    stat(ev.length, ev.length === 1 ? "rolê" : "rolês"),
    stat(ev.filter((it) => it.date === today).length, "hoje"),
    stat(ev.filter((it) => wknd.includes(it.date)).length, "no fds"),
    stat(ev.filter((it) => it.priceMin === 0).length, "grátis"),
    stat(visible, "no filtro"),
  );
  // Horário da coleta é de Franca: sem timeZone, quem está fora de UTC-3 lia outra hora.
  const at = new Date(state.catalog.generatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  $("updated").textContent = `atualizado às ${at} · Franca, região e Ribeirão`;
  // Região viva só com a contagem: anunciar a página inteira a cada render era ruído.
  $("count").textContent =
    `${visible} ${visible === 1 ? "rolê" : "rolês"} no filtro`;
}

function renderDock() {
  const favs = state.items.filter((it) => state.favs.has(it.id));
  const dock = $("dock");
  dock.hidden = !favs.length;
  if (!favs.length) return;
  dock.replaceChildren(
    h("span", { class: "dock-label" }, `⭐ ${favs.length}`),
    h(
      "div",
      { class: "dock-list" },
      favs
        .slice(0, 12)
        .map((it) =>
          h(
            "button",
            { type: "button", class: "chip", onclick: () => openDetail(it) },
            it.title,
          ),
        ),
    ),
    // replaceChildren(null) vira o texto "null": o botão entra como lista, vazia se não couber.
    ...(favs.length >= 2
      ? [
          h(
            "button",
            {
              type: "button",
              class: "btn primary small",
              onclick: () => {
                resetDuel();
                setView("duelo");
              },
            },
            "⚔️ Duelar favoritos",
          ),
        ]
      : []),
  );
}

let lastFilters = "";
function render() {
  if (!state.catalog) return;
  const focusId = document.activeElement?.id;
  const focusKey = document.activeElement?.dataset?.focus;
  const caret = document.activeElement?.selectionStart;
  const visible = applyFilters(
    state.items,
    state.filters,
    state.catalog.today,
    state.favs,
  );
  const key = JSON.stringify(state.filters);
  if (key !== lastFilters) resetDuel();
  lastFilters = key;
  renderTabs();
  renderStats(visible.length);
  renderFilters($("filters"), visible.length);
  RENDER[state.view]($("view"), visible);
  renderDock();
  // Painéis são redesenhados inteiros: devolve o foco (e o cursor da busca).
  // Botão sem id volta pela chave data-focus, que é estável entre renders.
  const el =
    (focusId && $(focusId)) ||
    (focusKey &&
      document.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`));
  if (el && el !== document.activeElement) {
    el.focus({ preventScroll: true });
    if (typeof caret === "number" && el.setSelectionRange)
      el.setSelectionRange(caret, caret);
  }
}

async function load() {
  try {
    state.catalog = await fetchCatalog();
    state.origin ??= state.catalog.origin;
    state.items = enrich(
      toItems(state.catalog),
      state.origin,
      state.catalog.today,
    );
    render();
  } catch (err) {
    if (!state.catalog)
      $("view").replaceChildren(
        h(
          "p",
          { class: "glass pad center" },
          "Não consegui carregar os rolês agora. ",
          h(
            "button",
            { type: "button", class: "btn", onclick: load },
            "Tentar de novo",
          ),
        ),
      );
    if (!state.catalog) $("updated").textContent = "não foi possível carregar";
    console.error(err);
  }
}

$("locate").addEventListener("click", () => {
  const btn = $("locate");
  if (btn.getAttribute("aria-pressed") === "true") {
    state.origin = state.catalog.origin;
    btn.setAttribute("aria-pressed", "false");
    enrich(state.items, state.origin, state.catalog.today);
    return emit();
  }
  if (!navigator.geolocation)
    return toast("Seu navegador não passa localização.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.origin = {
        name: "Você",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      btn.setAttribute("aria-pressed", "true");
      enrich(state.items, state.origin, state.catalog.today);
      emit();
      toast("Radar centrado em você 📍");
    },
    () => toast("Sem permissão de localização — seguimos do centro de Franca."),
    { timeout: 10000 },
  );
});

$("share").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link com seus filtros copiado!");
  } catch {
    toast(location.href);
  }
});

$("toggle-filters").addEventListener("click", () => {
  const open = $("filters").classList.toggle("open");
  $("toggle-filters").setAttribute("aria-expanded", String(open));
});

const itemFromHash = new URLSearchParams(location.hash.slice(1)).get("item");
readHash();
initDetail();
subscribe(render);
await load();
if (itemFromHash) {
  const it = state.items.find((x) => x.id === itemFromHash);
  if (it) openDetail(it);
}
// O CronJob atualiza o banco 1x/dia; aba aberta pega a novidade sozinha.
setInterval(() => {
  if (document.visibilityState === "visible") load();
}, REFRESH_MS);
