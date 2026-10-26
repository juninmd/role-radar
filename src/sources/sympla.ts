import { citySlug, inRegion, SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { readCapped } from "./public-url.ts";

// Derivado de SEARCH_CITIES: a lista de cidades vive num lugar só, então
// incluir uma cidade nova na região passa a valer aqui automaticamente.
const CITY_SLUGS = SEARCH_CITIES.map(citySlug);
// Página de busca tem ~270 KB; o teto só corta resposta fora do normal.
const MAX_HTML = 5_000_000;
// Medido em 2026-07-26: as páginas 2-4 de franca-sp devolvem 24 eventos cada,
// todos de FORA da região (o Sympla completa a lista com eventos de outras
// cidades). Só Franca e Ribeirão têm volume pra justificar a página 2; nas
// vizinhas era requisição jogada fora.
// Ribeirão Preto entra com as duas páginas: as 48 vagas vêm 100% preenchidas
// com eventos da própria cidade (Hard Rock Cafe, Teatro Santarosa, GOA).
const CITIES = [
  ...CITY_SLUGS.map((c) => `https://www.sympla.com.br/eventos/${c}`),
  "https://www.sympla.com.br/eventos/franca-sp?page=2",
  "https://www.sympla.com.br/eventos/ribeirao-preto-sp?page=2",
];

interface SymplaEvent {
  name: string;
  url: string;
  start_date: string;
  end_date?: string;
  images?: { lg?: string; original?: string };
  location?: {
    name?: string;
    city?: string;
    neighborhood?: string;
    address?: string;
  };
  organizer?: { name?: string };
}

/** Dia local (UTC-3) de um timestamp UTC do Sympla. */
const localDay = (utc: string): string | null => {
  const d = new Date(utc);
  // Data inválida faria toISOString lançar e derrubar a página inteira.
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString().slice(0, 10);
};

/** Scrape Sympla city listings (RSC payload) into structured events. */
export async function syncSympla(today: string): Promise<number> {
  // 20 páginas em série pagavam 20x o timeout; em pool são ~4 rodadas.
  const perUrl = await pool(CITIES, 5, async (url) => {
    let n = 0;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = (await readCapped(res, MAX_HTML)).replaceAll('\\"', '"');
      const chunks = html.match(/\{"end_date":.*?"event_type":"[A-Z]+"\}/g);
      for (const chunk of chunks ?? []) {
        let ev: SymplaEvent;
        try {
          ev = JSON.parse(chunk) as SymplaEvent;
        } catch {
          continue;
        }
        if (!ev.name || !ev.url || !ev.start_date) continue;
        // Páginas de cidade pequena vazam eventos de fora da região pedida.
        if (!inRegion(ev.location?.city)) continue;
        // Webinar/curso online não é rolê — o Sympla marca isso no nome do local.
        if (/\bonline\b/i.test(ev.location?.name ?? "")) continue;
        // start_date vem em UTC; evento local = UTC-3.
        const local = new Date(ev.start_date);
        // Data que não existe não pode lançar em toISOString e derrubar a página.
        if (Number.isNaN(local.getTime())) continue;
        local.setUTCHours(local.getUTCHours() - 3);
        const date = local.toISOString().slice(0, 10);
        const time = local.toISOString().slice(11, 16);
        const day = ev.end_date ? localDay(ev.end_date) : null;
        // Fim antes do início é lixo da fonte: evento de um dia.
        const endDate = day && day > date ? day : null;
        // Festival que começou ontem e vai até domingo ainda é rolê.
        if ((endDate ?? date) < today) continue;
        const descParts = [
          ev.organizer?.name ? `Produção: ${ev.organizer.name}` : null,
          ev.location?.address
            ? [ev.location.address, ev.location.neighborhood]
                .filter(Boolean)
                .join(", ")
            : null,
        ].filter(Boolean);
        const description =
          descParts.length > 0 ? descParts.join(" · ").slice(0, 300) : null;

        upsertEvent({
          title: ev.name.trim(),
          date,
          time,
          venue: ev.location?.name ?? null,
          city: ev.location?.city ?? null,
          price: null,
          description,
          link: ev.url,
          image: ev.images?.lg ?? ev.images?.original ?? null,
          end_date: endDate,
        });
        n++;
      }
    } catch (err) {
      console.warn(`[sympla] falhou ${url}: ${err}`);
    }
    return n;
  });

  const stored = perUrl.reduce((a, b) => a + b, 0);
  console.log(`[sympla] ${stored} eventos`);
  return stored;
}
