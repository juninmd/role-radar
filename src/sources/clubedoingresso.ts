import { inRegion, norm, REGION_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, parseDataBr } from "./comum.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Clube do Ingresso: estava como "sem eventos da região" e em 2026-10 passou a
// vender no Teatro Municipal de Franca e em Ribeirão. A home traz o catálogo
// inteiro (~750 cards) mas o card só tem o nome do local, não a cidade.
const SITE = "https://www.clubedoingresso.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Detalhe aberto por rodada: só candidatos que citam uma cidade da região.
const MAX_DETAIL = 25;

interface Card {
  path: string;
  name: string;
  local: string;
}

export function parseClubeHome(html: string): Card[] {
  const out: Card[] = [];
  for (const m of html.matchAll(
    /<div class="ItemCarrousel__content">\s*<a href="(\/evento\/[^"]+)"[\s\S]*?ItemCarrousel__nome">([\s\S]*?)<\/div>[\s\S]*?ItemCarrousel__local[^>]*>([\s\S]*?)<\/div>/g,
  )) {
    out.push({ path: m[1], name: limpa(m[2]), local: limpa(m[3]) });
  }
  return out;
}

// "ribeiraopreto", "franca": cidade sem espaço nem acento, como aparece no slug.
const TOKENS = REGION_CITIES.map((c) => norm(c).replace(/[^a-z]/g, ""));

/** Card que cita uma cidade da região no slug, no nome ou no local. */
export const citaRegiao = (c: Card) => {
  const texto = norm(`${c.path} ${c.name} ${c.local}`).replace(/[^a-z]/g, "");
  return TOKENS.some((t) => texto.includes(t));
};

const brl = (n: number) =>
  `R$ ${n.toFixed(2).replace(".", ",").replace(",00", "")}`;

/** Data, local, cidade e faixa de preço da página do evento. */
export function parseClubeDetail(html: string, today: string) {
  // "Quarta, 04 de Novembro de 2026 - Abertura: 20:00"
  const quando = limpa(
    html.match(
      /PageEvent__select">\s*<div class="PageEvent__desc">([\s\S]*?)<\/div>/,
    )?.[1] ?? "",
  );
  const local = html.match(
    /PageEvent__local">\s*<div class="PageEvent__subTitle">([\s\S]*?)<\/div>\s*<div class="PageEvent__desc">([\s\S]*?)<\/div>/,
  );
  // Endereço termina em "- Franca, SP".
  const city = local
    ? limpa(local[2])
        .match(/-\s*([^-,]+),\s*[A-Z]{2}\s*$/)?.[1]
        ?.trim()
    : null;
  const precos = [...html.matchAll(/"price"\s*:\s*"?(\d+(?:\.\d+)?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n > 0);
  const [min, max] = [Math.min(...precos), Math.max(...precos)];
  return {
    data: parseDataBr(quando, today),
    venue: local ? limpa(local[1]) : null,
    city: city ?? null,
    price: precos.length
      ? min === max
        ? brl(min)
        : `${brl(min)} a ${brl(max)}`
      : null,
    image:
      html.match(/<img src="(https:[^"]+)"[^>]*class="PageEvent__img"/)?.[1] ??
      null,
    title: limpa(html.match(/data-nome="([^"]+)"/)?.[1] ?? ""),
  };
}

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCapped(res, MAX_SOURCE_BODY);
};

/** Eventos do Clube do Ingresso em Franca e região. */
export async function syncClubeDoIngresso(today: string): Promise<number> {
  let stored = 0;
  try {
    const cards = parseClubeHome(await get(`${SITE}/`));
    const vistos = new Set<string>();
    const alvos = cards
      .filter((c) => citaRegiao(c) && !vistos.has(c.path) && vistos.add(c.path))
      .slice(0, MAX_DETAIL);
    const paginas = await pool(alvos, 4, (c) =>
      get(`${SITE}${c.path}`).catch(() => null),
    );
    for (const [i, card] of alvos.entries()) {
      const html = paginas[i];
      if (!html) continue;
      const d = parseClubeDetail(html, today);
      // A cidade do endereço decide; o slug só escolheu quem abrir.
      if (!d.data || d.data.date < today || !inRegion(d.city)) continue;
      upsertEvent({
        title: d.title || card.name.replace(/\.\.\.$/, ""),
        date: d.data.date,
        time: d.data.time,
        venue: d.venue ?? card.local,
        city: d.city,
        price: d.price,
        link: `${SITE}${card.path}`,
        image: d.image,
      });
      stored++;
    }
    console.log(
      `[clubedoingresso] ${stored} eventos de ${alvos.length} candidatos (${cards.length} no catálogo)`,
    );
  } catch (err) {
    console.warn(`[clubedoingresso] falhou: ${err}`);
  }
  return stored;
}
