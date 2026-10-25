import { state, toggleFav } from "./state.js";
import {
  CATS,
  fmtKm,
  fmtPrice,
  h,
  humanDay,
  KINDS,
  link,
  relDays,
  safeUrl,
  toast,
} from "./util.js";

let lastFocus = null;
let current = null;

const mapsDir = (it) =>
  it.mapsUrl ||
  (it.venue || it.pin
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(it.pin && !it.pin.approx ? `${it.pin.lat},${it.pin.lng}` : `${it.venue ?? ""}, ${it.city ?? ""}, SP`)}`
    : null);

/** Link "adicionar ao Google Agenda" (sem OAuth: é só um template de URL). */
function calendarUrl(it) {
  if (!it.date) return null;
  const d = it.date.replaceAll("-", "");
  let dates = `${d}/${d}`;
  if (it.time) {
    const [hh, mm] = it.time.split(":").map(Number);
    const start = `${d}T${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
    const end = `${d}T${String(Math.min(hh + 3, 23)).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
    dates = `${start}/${end}`;
  }
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: it.title,
    dates,
    ctz: "America/Sao_Paulo",
    location: [it.venue, it.city].filter(Boolean).join(", "),
    details: safeUrl(it.link) ?? "",
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

async function share(it) {
  const url = `${location.origin}${location.pathname}#${new URLSearchParams({ item: it.id })}`;
  const text = `${it.title}${it.date ? ` — ${humanDay(it.date, state.catalog.today)}` : ""}`;
  try {
    if (navigator.share) await navigator.share({ title: it.title, text, url });
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast("Link copiado!");
    }
  } catch {
    // usuário cancelou o share nativo
  }
}

export function openDetail(it) {
  const drawer = document.getElementById("drawer");
  const backdrop = document.getElementById("backdrop");
  if (!current) lastFocus = document.activeElement;
  current = it;
  const cat = CATS[it.category] ?? CATS.outros;
  const img = safeUrl(it.image);
  const fav = state.favs.has(it.id);
  const when = it.date
    ? `${humanDay(it.date, state.catalog.today)}${it.endDate ? ` até ${humanDay(it.endDate, state.catalog.today)}` : ""}${it.time ? ` às ${it.time}` : ""} (${relDays(it.date, state.catalog.today)})`
    : "Sempre aberto — é só chegar";

  const close = h(
    "button",
    {
      type: "button",
      class: "icon-btn close",
      "aria-label": "Fechar",
      onclick: closeDetail,
    },
    "✕",
  );
  drawer.replaceChildren(
    h(
      "div",
      { class: "drawer-hero", style: { "--cat": cat.color } },
      img
        ? h("img", {
            src: img,
            alt: "",
            loading: "lazy",
            referrerpolicy: "no-referrer",
            onerror: (e) => e.target.remove(),
          })
        : h("span", { class: "hero-emoji", "aria-hidden": "true" }, cat.emoji),
      close,
    ),
    h(
      "div",
      { class: "drawer-body" },
      h(
        "div",
        { class: "chips" },
        h(
          "span",
          { class: "pill", style: { "--cat": cat.color } },
          `${cat.emoji} ${cat.label}`,
        ),
        h(
          "span",
          { class: "pill" },
          `${KINDS[it.kind].emoji} ${KINDS[it.kind].label}`,
        ),
        it.daily ? h("span", { class: "pill hot" }, "✨ dica do dia") : null,
      ),
      h("h2", { id: "drawer-title" }, it.title),
      h(
        "dl",
        { class: "facts" },
        h("dt", {}, "📆 Quando"),
        h("dd", {}, when),
        it.venue || it.city
          ? [
              h("dt", {}, "📍 Onde"),
              h("dd", {}, [it.venue, it.city].filter(Boolean).join(" · ")),
            ]
          : null,
        it.km !== null
          ? [
              h("dt", {}, "🧭 Distância"),
              h(
                "dd",
                {},
                `${fmtKm(it.km)} de ${state.origin.name}${it.pin?.approx ? " (aprox., centro da cidade)" : ""}`,
              ),
            ]
          : null,
        fmtPrice(it)
          ? [h("dt", {}, "💰 Preço"), h("dd", {}, fmtPrice(it))]
          : null,
      ),
      it.description ? h("p", { class: "desc" }, it.description) : null,
      h(
        "div",
        { class: "actions" },
        link(it.link, "🎟️ Ingressos / detalhes", "btn primary"),
        link(it.trailer, "▶️ Trailer"),
        link(mapsDir(it), "🚗 Como chegar"),
        link(calendarUrl(it), "🗓️ Pôr na agenda"),
        h(
          "button",
          {
            type: "button",
            class: "btn",
            "aria-pressed": fav ? "true" : "false",
            onclick: () => {
              toggleFav(it.id);
              openDetail(it);
            },
          },
          fav ? "⭐ Favorito" : "☆ Favoritar",
        ),
        h(
          "button",
          { type: "button", class: "btn", onclick: () => share(it) },
          "📤 Compartilhar",
        ),
      ),
    ),
  );
  drawer.hidden = false;
  backdrop.hidden = false;
  setPageInert(true);
  requestAnimationFrame(() => drawer.classList.add("open"));
  close.focus();
}

// Diálogo modal: o resto da página sai da árvore de foco e da leitura de tela.
function setPageInert(on) {
  for (const el of document.body.children) {
    if (["drawer", "backdrop", "toast"].includes(el.id)) continue;
    el.inert = on;
  }
}

export function closeDetail() {
  const drawer = document.getElementById("drawer");
  drawer.classList.remove("open");
  drawer.hidden = true;
  document.getElementById("backdrop").hidden = true;
  setPageInert(false);
  current = null;
  lastFocus?.focus?.();
}

export function initDetail() {
  document.getElementById("backdrop").addEventListener("click", closeDetail);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) closeDetail();
    // Foco preso no diálogo enquanto aberto.
    if (e.key === "Tab" && current) {
      const nodes = [
        ...document.getElementById("drawer").querySelectorAll("a[href],button"),
      ];
      const first = nodes[0];
      const last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
