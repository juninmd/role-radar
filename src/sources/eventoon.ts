import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";

// Evento ON é a vitrine da Q2 Ingressos — a bilheteria que vende para casas
// como a Morada du Capiau e o Teatro Municipal, ausentes de Sympla/Duoticket.
const URL = "https://www.eventoon.com.br/cidade/franca-sp";
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

/** Eventos da Q2 Ingressos/Evento ON em Franca. */
export async function syncEventoon(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(URL, {
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
      const title = decode(card.match(/<label>([\s\S]*?)<\/label>/)?.[1] ?? "");
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
          )?.[1] ?? URL,
        image: card.match(/<img src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
      });
      stored++;
    }
  } catch (err) {
    console.warn(`[eventoon] falhou: ${err}`);
  }
  console.log(`[eventoon] ${stored} eventos`);
  return stored;
}
