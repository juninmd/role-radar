import { citySlug, inRegion, SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";

// Evento ON é a vitrine da Q2 Ingressos — a bilheteria que vende para casas
// como a Morada du Capiau e o Teatro Municipal, ausentes de Sympla/Duoticket.
// Uma página por cidade da região (antes só olhava Franca).
const URLS = SEARCH_CITIES.map(
  (c) => `https://www.eventoon.com.br/cidade/${citySlug(c)}`,
);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Eventos da Q2 Ingressos/Evento ON na região. */
export async function syncEventoon(today: string): Promise<number> {
  const counts = await pool(URLS, 4, async (url) => {
    let stored = 0;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      // Cada card começa na coluna da imagem e vai até o card seguinte.
      for (const card of html
        .split('<div class="col-md-3 col-sm-5 form-group">')
        .slice(1)) {
        const br = card.match(/<b><small>(\d{2})\/(\d{2})\/(\d{4})<\/small>/);
        const title = decode(
          card.match(/<label>([\s\S]*?)<\/label>/)?.[1] ?? "",
        );
        if (!br || !title) continue;
        const date = `${br[3]}-${br[2]}-${br[1]}`;
        if (date < today) continue;

        const spans = [
          ...card.matchAll(/<div><span>([^<]*)<\/span><\/div>/g),
        ].map((m) => decode(m[1]));
        const [venue, place, address] = spans;
        const city = (place ?? "").split(/\s*-\s*/)[0];
        if (!inRegion(city)) continue;

        upsertEvent({
          title,
          date,
          time: null,
          venue: venue || address || null,
          city,
          price: null,
          link:
            card.match(
              /href="(https:\/\/www\.eventoon\.com\.br\/evento\/[^"]+)"/,
            )?.[1] ?? url,
          image: card.match(/<img src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[eventoon] falhou ${url}: ${err}`);
    }
    return stored;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[eventoon] ${total} eventos`);
  return total;
}
