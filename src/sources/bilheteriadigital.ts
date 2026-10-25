import { inRegion, SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, type Parsed, parseDataBr } from "./comum.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Busca server-side por termo livre. Hoje não devolve nada da região, mas o
// parser fica pronto — a plataforma vende para teatro e infantil, que é o tipo
// de evento que costuma chegar em Franca por temporada.
const BUSCA = "https://www.bilheteriadigital.com/busca/";
const SITE = "https://www.bilheteriadigital.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const TERMOS = SEARCH_CITIES;

/** Extrai os cards de uma busca. Exportada para homologar com cidade cheia. */
export async function scrapeBilheteriaDigital(
  termo: string,
  today: string,
): Promise<Parsed[]> {
  const html = await fetch(`${BUSCA}${encodeURIComponent(termo)}/as/1`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return readCapped(r, MAX_SOURCE_BODY);
  });

  const out: Parsed[] = [];
  for (const card of html.split('class="box-li-evento"').slice(1)) {
    const title = limpa(
      card.match(/class="titulo-evento-thumb">([\s\S]*?)<\/p>/)?.[1] ?? "",
    );
    const href = card.match(/href="([^"]+)"/)?.[1];
    if (!title || !href) continue;
    // O <div> da data traz um svg antes do texto; limpa() derruba o svg.
    const dataTxt = limpa(
      card.match(/class="data-evento-div"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "",
    );
    const quando = parseDataBr(dataTxt, today);
    if (!quando || quando.date < today) continue;
    out.push({
      title,
      date: quando.date,
      time: quando.time,
      venue: null,
      // A busca é por cidade, então o termo é a melhor pista disponível.
      city: termo,
      price: null,
      // Só caminho absoluto: "@host" colado mudaria o domínio do link.
      link: href.startsWith("http")
        ? href
        : href.startsWith("/")
          ? `${SITE}${href}`
          : SITE,
      image: card.match(/src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
    });
  }
  return out;
}

/** Eventos da Bilheteria Digital na região. */
export async function syncBilheteriaDigital(today: string): Promise<number> {
  const counts = await pool(TERMOS, 2, async (termo) => {
    let n = 0;
    try {
      for (const ev of await scrapeBilheteriaDigital(termo, today)) {
        if (!inRegion(ev.city)) continue;
        upsertEvent(ev);
        n++;
      }
    } catch (err) {
      console.warn(`[bilheteriadigital] falhou ${termo}: ${err}`);
    }
    return n;
  });
  const stored = counts.reduce((a, b) => a + b, 0);
  console.log(`[bilheteriadigital] ${stored} eventos`);
  return stored;
}
