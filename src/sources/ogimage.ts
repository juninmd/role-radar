import { pool } from "../pool.ts";
import { endereco, faixaEtaria } from "./comum.ts";
import { fetchPublic, readCapped } from "./public-url.ts";

const MAX_HTML = 200_000;
// Sites de terceiros: poucas conexões por vez, não uma por evento.
const BATCH_CONCURRENCY = 4;

/**
 * O que a página do evento sabe e o catálogo da bilheteria não trouxe. Zig e
 * Guichê Web publicam schema.org/Event: preço (lowPrice/highPrice), horário de
 * início e se está esgotado ou cancelado — nada disso vem na listagem.
 */
export interface PageMeta {
  image: string | null;
  price: string | null;
  time: string | null;
  description: string | null;
  /** "esgotado", "ultimos", "cancelado", "adiado"; null = à venda ou sem informação. */
  status: string | null;
  end_time: string | null;
  age_rating: string | null;
  address: string | null;
}

const VAZIO: PageMeta = {
  image: null,
  price: null,
  time: null,
  description: null,
  status: null,
  end_time: null,
  age_rating: null,
  address: null,
};

type Ld = Record<string, unknown>;

/** Nós de JSON-LD da página, com @graph e arrays achatados. */
function ldNodes(html: string): Ld[] {
  const out: Ld[] = [];
  const add = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === "object") {
      out.push(v as Ld);
      add((v as Ld)["@graph"]);
    }
  };
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      add(JSON.parse(m[1]));
    } catch {
      // JSON-LD quebrado é comum em CMS; o resto da página ainda vale.
    }
  }
  return out;
}

const brl = (n: number) =>
  `R$ ${n.toFixed(2).replace(".", ",").replace(",00", "")}`;

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) && v !== null && v !== "" ? n : null;
};

/** Faixa de preço das ofertas: "R$ 80 a R$ 105", "R$ 60" ou null. */
function precoDasOfertas(offers: unknown): string | null {
  const lista = (Array.isArray(offers) ? offers : [offers]).filter(
    (o): o is Ld => !!o && typeof o === "object",
  );
  const valores: number[] = [];
  for (const o of lista) {
    for (const k of ["lowPrice", "highPrice", "price"]) {
      const n = num(o[k]);
      if (n !== null) valores.push(n);
    }
    if (o.offers) {
      const sub = precoDasOfertas(o.offers);
      if (sub) return sub;
    }
  }
  // Preço 0 sozinho é placeholder em mais de uma bilheteria (Guichê Web põe
  // "0.00" em evento pago): só valor pago entra.
  const pagos = valores.filter((n) => n > 0);
  if (!pagos.length) return null;
  const [min, max] = [Math.min(...pagos), Math.max(...pagos)];
  return min === max ? brl(min) : `${brl(min)} a ${brl(max)}`;
}

const STATUS: [RegExp, string][] = [
  [/EventCancelled/i, "cancelado"],
  [/EventPostponed|EventRescheduled/i, "adiado"],
];

/** Preço, horário e status do primeiro schema.org/Event da página. */
export function parseEventLd(html: string): Omit<PageMeta, "image"> {
  const ev = ldNodes(html).find((n) => /Event$/.test(String(n["@type"] ?? "")));
  if (!ev) {
    const { image: _, ...vazio } = VAZIO;
    return vazio;
  }
  const inicio = String(ev.startDate ?? "");
  // Só data ("2026-11-14") ou meia-noite é "sem horário", não 00:00.
  const hora = inicio.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
  const fim = String(ev.endDate ?? "").match(/T(\d{2}:\d{2})/)?.[1] ?? null;
  const lugar = (ev.location ?? {}) as Ld;
  const end = (lugar.address ?? {}) as Ld;
  const rua =
    typeof lugar.address === "string"
      ? lugar.address
      : String(end.streetAddress ?? "");
  const offers = ev.offers;
  const disponivel = JSON.stringify(offers ?? "");
  const status =
    STATUS.find(([re]) => re.test(String(ev.eventStatus ?? "")))?.[1] ??
    // Esgotado só quando nenhuma oferta está à venda.
    (/SoldOut/i.test(disponivel) &&
    !/InStock|LimitedAvailability/i.test(disponivel)
      ? "esgotado"
      : // Sobrou lote só com estoque limitado: avisar antes de esgotar.
        /LimitedAvailability/i.test(disponivel) && !/InStock/i.test(disponivel)
        ? "ultimos"
        : null);
  const desc = typeof ev.description === "string" ? ev.description.trim() : "";
  return {
    price: precoDasOfertas(offers),
    time: hora && hora !== "00:00" ? hora : null,
    // Descrição curta demais é slogan da bilheteria, não do evento.
    description: desc.length >= 40 ? desc : null,
    status,
    end_time: fim && fim !== hora ? fim : null,
    age_rating: faixaEtaria(String(ev.typicalAgeRange ?? "")),
    address: endereco(rua),
  };
}

const ogImage = (html: string) => {
  const m =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    );
  const img = m?.[1] ?? null;
  return img?.startsWith("http") ? img : null;
};

/** Fetch a page and pull og:image + schema.org/Event. Never throws. */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  try {
    const res = await fetchPublic(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return { ...VAZIO };
    const html = await readCapped(res, MAX_HTML);
    return { ...parseEventLd(html), image: ogImage(html) };
  } catch {
    return { ...VAZIO };
  }
}

/** Fetch a page and pull its og:image, or null. Never throws. */
export async function fetchOgImage(url: string): Promise<string | null> {
  return (await fetchPageMeta(url)).image;
}

interface Alvo {
  id: string;
  image: string | null;
  link: string | null;
  price?: string | null;
  time?: string | null;
  address?: string | null;
}

/**
 * Detalhe de cada evento a postar: a página só é aberta se falta capa, preço
 * ou horário. A imagem já salva tem precedência sobre a og:image.
 */
export async function fetchDetails(
  events: Alvo[],
  limit = BATCH_CONCURRENCY,
): Promise<Map<string, PageMeta>> {
  const pairs = await pool(events, limit, async (ev) => {
    const falta = !ev.image || !ev.price || !ev.time || !ev.address;
    const meta = falta && ev.link ? await fetchPageMeta(ev.link) : { ...VAZIO };
    return [ev.id, { ...meta, image: ev.image ?? meta.image }] as const;
  });
  return new Map(pairs);
}

/** Capa de cada evento: a imagem já salva, ou a og:image da página. */
export async function fetchOgImages(
  events: { id: string; image: string | null; link: string | null }[],
  limit = BATCH_CONCURRENCY,
): Promise<Map<string, string | null>> {
  const pairs = await pool(
    events,
    limit,
    async (ev) =>
      [
        ev.id,
        ev.image ?? (ev.link ? await fetchOgImage(ev.link) : null),
      ] as const,
  );
  return new Map(pairs);
}
