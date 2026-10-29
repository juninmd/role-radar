import { norm } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, parseDataBr } from "./comum.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// SESI-SP Cultura: teatro, dança e música nos Teatros do SESI. Não é o site de
// notícias franca.sesisp.org.br (descartado): é a vitrine de eventos por
// unidade, com sessão e endereço no detalhe. Os ids saem do filtro da página.
const SITE = "https://www.sesisp.org.br";
const UNITS = [
  { id: "bf3fb13b-884c-41f2-8f6a-151b18abb86b", city: "Franca" },
  { id: "1d2a9687-9384-41c5-9e4b-cf87cb38236e", city: "Ribeirão Preto" },
  { id: "a73243c6-63ed-4be1-a64b-b72f28dd7f28", city: "Barretos" },
  { id: "581f64d6-74ca-4795-9b2e-9ad6b9a8b31f", city: "Sertãozinho" },
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface Card {
  path: string;
  title: string;
  image: string | null;
  company: string | null;
}

/** Cards da listagem de uma unidade (HTML server-side). */
export function parseSesiList(html: string): Card[] {
  const out: Card[] = [];
  for (const m of html.matchAll(/<div class="card h-100[\s\S]*?<\/a>/g)) {
    const card = m[0];
    const path = card.match(/href="(\/evento\/[0-9a-f-]{36}\/[^"]+)"/)?.[1];
    const title = limpa(
      card.match(/class="card-title">([\s\S]*?)<\/h5>/)?.[1] ?? "",
    );
    if (!path || !title) continue;
    out.push({
      path,
      title,
      image: card.match(/background-image:\s*url\(([^)]+)\)/)?.[1] ?? null,
      company:
        limpa(card.match(/class="card-text">([\s\S]*?)<\/p>/)?.[1] ?? "") ||
        null,
    });
  }
  return out;
}

/**
 * Sessões de UMA unidade no detalhe. A página lista a turnê inteira (Franca,
 * Ribeirão, Bauru…) em painéis "SESI <cidade>"; só o painel da unidade vale.
 * Um evento por dia, no primeiro horário do dia.
 */
export function parseSesiSessions(
  html: string,
  city: string,
  today: string,
): { date: string; time: string | null; venue: string | null }[] {
  const painel = html
    .split('class="panel pb-1"')
    .slice(1)
    .find((p) => {
      const nome = p.match(/role="button"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
      return norm(limpa(nome)) === norm(`SESI ${city}`);
    });
  if (!painel) return [];
  const venue =
    limpa(painel.match(/<strong>([\s\S]*?)<\/strong>/)?.[1] ?? "") || null;
  const out: { date: string; time: string | null; venue: string | null }[] = [];
  for (const dia of painel.split('class="accordion-day-item"').slice(1)) {
    const rotulo = dia.match(/<h4 class="mb-0">\s*(\d{1,2})\s+([A-Za-zÇç]+)/);
    if (!rotulo) continue;
    const quando = parseDataBr(`${rotulo[1]} de ${rotulo[2]}`, today);
    if (!quando) continue;
    const time = dia.match(/fa-clock[^>]*><\/i>\s*(\d{2}:\d{2})/)?.[1] ?? null;
    out.push({ date: quando.date, time, venue });
  }
  return out;
}

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return readCapped(res, MAX_SOURCE_BODY);
};

/** Teatros do SESI em Franca e região. */
export async function syncSesiSp(today: string): Promise<number> {
  const counts = await pool(UNITS, 2, async (unit) => {
    let stored = 0;
    try {
      const cards = parseSesiList(
        await get(`${SITE}/eventos?data=0&codigoUnidade=${unit.id}&search=`),
      );
      const detalhes = await pool(cards, 4, (c) =>
        get(`${SITE}${c.path}`).catch(() => null),
      );
      for (const [i, card] of cards.entries()) {
        const html = detalhes[i];
        if (!html) continue;
        const sessoes = parseSesiSessions(html, unit.city, today).filter(
          (s) => s.date >= today,
        );
        // Temporada (3+ dias: torneio, curso, mostra) é um evento com fim, não
        // uma linha por dia lotando a agenda.
        const lista =
          sessoes.length >= 3
            ? [{ ...sessoes[0], end_date: sessoes[sessoes.length - 1].date }]
            : sessoes.map((s) => ({ ...s, end_date: null }));
        for (const s of lista) {
          upsertEvent({
            title: card.title,
            date: s.date,
            end_date: s.end_date,
            time: s.time,
            venue: s.venue ?? `SESI ${unit.city}`,
            city: unit.city,
            price: null,
            link: `${SITE}${card.path}`,
            image: card.image,
            description: card.company ? `Com ${card.company}` : null,
          });
          stored++;
        }
      }
    } catch (err) {
      console.warn(`[sesisp] ${unit.city} falhou: ${err}`);
    }
    return stored;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[sesisp] ${total} sessões`);
  return total;
}
