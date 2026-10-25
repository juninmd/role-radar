import { inRegion, SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, type Parsed, parseDataBr } from "./comum.ts";
import { readBytesCapped } from "./public-url.ts";

// Teto para resposta anômala; o tamanho de uma busca com resultado não foi medido.
const MAX_PAGE = 5_000_000;

// ATENÇÃO: o site responde em ISO-8859-1. Ler como UTF-8 corrompe todo acento
// ("Inflável" vira "Infl?vel") e quebra a comparação de cidade.
const BUSCA = "https://www.ticket360.com.br/eventos/pesquisar?s=";
const SITE = "https://www.ticket360.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const TERMOS = SEARCH_CITIES;

/** Extrai os cards de uma busca. Exportada para homologar com cidade cheia. */
export async function scrapeTicket360(
  termo: string,
  today: string,
): Promise<Parsed[]> {
  const res = await fetch(`${BUSCA}${encodeURIComponent(termo)}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = new TextDecoder("iso-8859-1").decode(
    await readBytesCapped(res, MAX_PAGE),
  );

  const out: Parsed[] = [];
  const semData: string[] = [];
  for (const card of html
    .split('class="m-portlet m-portlet--bordered-semi')
    .slice(1)) {
    const title = limpa(
      card.match(/class="card-name-evento">([\s\S]*?)<\/span>/)?.[1] ?? "",
    );
    const cidade = limpa(
      card.match(/class="card-endereco">([\s\S]*?)<\/span>/)?.[1] ?? "",
    ).replace(/\s*\/\s*[A-Z]{2}$/, "");
    if (!title) continue;
    const quando = parseDataBr(limpa(card.slice(0, 2500)), today);
    if (!quando) {
      // A listagem do Ticket360 quase nunca traz data (são "eventos compostos",
      // com várias sessões) e a página do evento também não. Sem data não há
      // como postar — mas se for da nossa região, é preciso saber que existe.
      if (inRegion(cidade)) semData.push(`${title} (${cidade})`);
      continue;
    }
    if (quando.date < today) continue;
    const href = card.match(/href="(evento\/[^"]+|https?:\/\/[^"]+)"/)?.[1];
    out.push({
      title,
      date: quando.date,
      time: quando.time,
      venue:
        limpa(
          card.match(/class="card-name-local">([\s\S]*?)<\/div>/)?.[1] ?? "",
        ) || null,
      city: cidade || null,
      price: null,
      link: href ? (href.startsWith("http") ? href : `${SITE}/${href}`) : SITE,
      image:
        card.match(/src="(https?:\/\/[^"]+\.(?:jpg|png|webp))"/)?.[1] ?? null,
    });
  }
  if (semData.length)
    console.warn(
      `[ticket360] ${semData.length} evento(s) da região SEM data na listagem: ${semData.slice(0, 5).join("; ")}`,
    );
  return out;
}

/** Eventos do Ticket360 na região. */
export async function syncTicket360(today: string): Promise<number> {
  const counts = await pool(TERMOS, 2, async (termo) => {
    let n = 0;
    try {
      for (const ev of await scrapeTicket360(termo, today)) {
        if (!inRegion(ev.city)) continue;
        upsertEvent(ev);
        n++;
      }
    } catch (err) {
      console.warn(`[ticket360] falhou ${termo}: ${err}`);
    }
    return n;
  });
  const stored = counts.reduce((a, b) => a + b, 0);
  console.log(`[ticket360] ${stored} eventos`);
  return stored;
}
