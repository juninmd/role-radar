import { norm } from "../config/region.ts";

export const CATEGORIES = [
  "cinema",
  "show",
  "teatro",
  "comedia",
  "infantil",
  "esporte",
  "festa",
  "gastronomia",
  "cultura",
  "outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Ordem importa: o primeiro que casar vence ("Stand-up no teatro" é comédia).
const RULES: [Category, RegExp][] = [
  ["cinema", /^estreia\b|\bcinema|\bfilme\b|\bsessao\b/],
  ["comedia", /stand ?up|comedia|humor|comedy|risada/],
  [
    "infantil",
    /infantil|infanto|infancia|kids|crianca|familia|circo|fantoche|patati|galinha pintadinha|cantigas de roda/,
  ],
  [
    "esporte",
    /basquete|corrida|\brun\b|futebol|campeonato|volei|jogo|nbb|sesi franca|pedal|trilha|maratona/,
  ],
  [
    "teatro",
    /teatro|\bpeca\b|espetaculo|musical|danca|ballet|bale\b|opera|cavalleria/,
  ],
  [
    "festa",
    /festa|balada|open bar|rave|baile|\bnight\b|\bafter\b|\bdjs?\b|halloween|carnaval|oktoberfest|\bfest\b|\bclub\b|anos (80|90|2000)|\bvibe\b|\bgin\b|dia de praia|inter unifran/,
  ],
  [
    "show",
    /show|musica|banda|sertanej|rock|samba|pagode|forro|festival|tributo|cover|orquestra|concerto|acustico|turne|rap\b|funk|mpb|jazz|blues|coral|\bmcs?\b|\bdvd\b|metal|arrocha|trap\b|carreira|ao vivo|coldplay|imagine dragons/,
  ],
  [
    "gastronomia",
    /gastronom|cerveja|chopp|food|churrasc|vinho|feira|boteco|buteco|cafe|sushi|pizza|hamburg|beef|restaurante|bar\b|grill|emporio|bistro/,
  ],
  [
    "cultura",
    /exposi|museu|palestra|sarau|literat|cultura|oficina|workshop|pinacoteca|artista|catedral|historic|summit|forum|geek|congresso|seminario|curso|experience/,
  ],
];

/** Categoria por palavra-chave no título + local — determinístico, sem IA. */
export function categorize(title: string, venue?: string | null): Category {
  const text = norm(`${title} ${venue ?? ""}`).replace(/[-_]/g, " ");
  return RULES.find(([, re]) => re.test(text))?.[0] ?? "outros";
}

const FREE = /gratis|gratuit|\bfree\b|entrada franca|entrada livre|sem custo/;

/**
 * Menor valor pago citado no texto de preço, 0 se grátis, null se não dá pra
 * saber ("consulte", ausente). "R$ 1.200,50" → 1200.5. Só número com "R$" conta:
 * "Lote 1" e "18 anos" não são preço.
 */
export function parsePrice(price: string | null): number | null {
  if (!price) return null;
  const text = norm(price);
  const values = [
    ...text.matchAll(/r\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g),
  ].map((m) => Number(`${m[1].replace(/\./g, "")}.${m[2] ?? "0"}`));
  const pagos = values.filter((n) => Number.isFinite(n) && n > 0);
  if (pagos.length) return Math.min(...pagos);
  // "R$ 0,00" é grátis; "gratuito para crianças, R$ 30 adulto" já caiu no 30 acima.
  return values.length || FREE.test(text) ? 0 : null;
}
