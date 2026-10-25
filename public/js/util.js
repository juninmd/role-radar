// DOM e formatação. Todo texto vindo das fontes entra via textContent (h/s),
// nunca innerHTML — é dado de bilheteria de terceiros.

export const CATS = {
  show: { label: "Show", emoji: "🎸", color: "#ff4fd8" },
  festa: { label: "Festa", emoji: "🪩", color: "#b36bff" },
  teatro: { label: "Teatro & dança", emoji: "🎭", color: "#ffb547" },
  comedia: { label: "Comédia", emoji: "😂", color: "#ffe066" },
  cinema: { label: "Cinema", emoji: "🎬", color: "#4fc3ff" },
  infantil: { label: "Infantil", emoji: "🧸", color: "#7dffb2" },
  esporte: { label: "Esporte", emoji: "🏀", color: "#ff7a59" },
  gastronomia: { label: "Comer & beber", emoji: "🍻", color: "#ffd1a1" },
  cultura: { label: "Cultura", emoji: "🖼️", color: "#9ad0ff" },
  outros: { label: "Outros", emoji: "✨", color: "#c9c9e8" },
};

export const KINDS = {
  evento: { label: "Eventos", emoji: "🎟️" },
  filme: { label: "Em cartaz", emoji: "🍿" },
  lugar: { label: "Lugares fixos", emoji: "📌" },
};

/** Cria elemento HTML; strings viram nós de texto (seguro contra XSS). */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    // setProperty: Object.assign ignora custom properties (--cat, --heat).
    else if (k === "style" && typeof v === "object")
      for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Só http(s) entra em href/src. */
export const safeUrl = (u) =>
  typeof u === "string" && /^https?:\/\//i.test(u) ? u : null;

export const link = (href, text, cls = "btn") => {
  const url = safeUrl(href);
  return url
    ? h(
        "a",
        { class: cls, href: url, target: "_blank", rel: "noopener noreferrer" },
        text,
      )
    : null;
};

const TZ = "America/Sao_Paulo";
export const isoToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: TZ });

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) =>
  Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000,
  );

export const weekday = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export function humanDay(iso, today) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

export const relDays = (iso, today) => {
  const d = daysBetween(today, iso);
  return d <= 0 ? "é hoje" : d === 1 ? "amanhã" : `em ${d} dias`;
};

// Mesmo fuso das datas: quem abre fora do Brasil não vê a hora do próprio relógio.
export const horaDeAtualizacao = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

export function fmtKm(km) {
  if (km === null || km === undefined) return null;
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function fmtPrice(item) {
  if (item.priceMin === 0) return "Grátis";
  if (item.priceMin)
    return `a partir de R$ ${item.priceMin.toLocaleString("pt-BR")}`;
  return item.price || null;
}

export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(x));
}

/** Rumo em graus (0 = norte, horário) de a para b. */
export function bearing(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // modo privado/armazenamento bloqueado: segue sem persistir
    }
  },
};

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
  }, 2600);
}

export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
