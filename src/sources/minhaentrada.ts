import { SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Minha Entrada: bilheteria nacional (vende o Theatro Pedro II, por exemplo).
// A busca da home chama /buscar-eventos?buscaNome=&buscaLocal=<cidade> e devolve
// um fragmento HTML com os cards - achado no js/home/index.js do site.
const SITE = "https://minhaentrada.com.br";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "x-requested-with": "XMLHttpRequest",
};

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Eventos da Minha Entrada por cidade da região. */
export async function syncMinhaEntrada(today: string): Promise<number> {
  const counts = await pool(SEARCH_CITIES, 4, async (city) => {
    let stored = 0;
    try {
      const res = await fetch(
        `${SITE}/buscar-eventos?buscaNome=&buscaLocal=${encodeURIComponent(city)}`,
        { headers: HEADERS, signal: AbortSignal.timeout(20000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await readCapped(res, MAX_SOURCE_BODY);

      for (const card of html
        .split('<div class="card-evento-relacionado">')
        .slice(1)) {
        const href = card.match(/href="(\/evento\/[^"]+)"/)?.[1];
        const title = decode(
          card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? "",
        );
        const when = card.match(
          /(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}:\d{2}))/,
        );
        if (!href || !title || !when) continue;
        const date = `${when[3]}-${when[2]}-${when[1]}`;
        if (date < today) continue;
        const venue = decode(
          card.match(/zmdi-pin[^>]*><\/i>([\s\S]*?)<\/p>/)?.[1] ?? "",
        );
        upsertEvent({
          title,
          date,
          time: when[4] ?? null,
          venue: venue || null,
          city,
          price: null,
          link: `${SITE}${href}`,
          image: card.match(/<img src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[minhaentrada] falhou ${city}: ${err}`);
    }
    return stored;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[minhaentrada] ${total} eventos`);
  return total;
}
