import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// O Franca Shopping hospeda temporadas longas (circo, parque de diversões,
// exposições) que nenhuma bilheteria lista — some do radar justamente o que
// fica meses na cidade.
const URL = "https://francashopping.com.br/eventos/";
const BASE = "https://francashopping.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/** "04/06/2026" → "2026-06-04". */
const toIso = (br: string) => {
  const m = br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Temporadas do Franca Shopping: abertura e último dia viram eventos datados. */
export async function syncFrancaShopping(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await readCapped(res, MAX_SOURCE_BODY);

    for (const card of html.split('class="dsa-card-eventos-lista').slice(1)) {
      const title = decode(card.match(/<h5[^>]*>([\s\S]*?)<\/h5>/)?.[1] ?? "");
      const period = card.match(
        /calendar_today<\/span>\s*([\d/]+)(?:\s*à\s*([\d/]+))?/,
      );
      if (!title || !period) continue;
      const start = toIso(period[1] ?? "");
      const end = period[2] ? toIso(period[2]) : start;
      if (!start || !end) continue;

      const free = /id="event-is-paid"[^>]*>\s*Gratuito/.test(card);
      const img = card.match(/src="\.\.(\/data\/files\/[^"]+)"/)?.[1];
      const base = {
        time: null,
        venue: "Franca Shopping",
        city: "Franca",
        price: free ? "grátis" : null,
        link: URL,
        image: img ? BASE + img : null,
      };

      // Abertura da temporada.
      if (start >= today) {
        upsertEvent({ ...base, title, date: start });
        stored++;
      }
      // Último dia — é o que salva a temporada que já começou antes do radar
      // olhar pra ela; datas distintas, então os dois ids são estáveis.
      // Fim antes do início é dado trocado da página: não gera "último dia".
      if (end > today && end > start) {
        upsertEvent({ ...base, title: `${title} (último dia)`, date: end });
        stored++;
      }
    }
  } catch (err) {
    console.warn(`[francashopping] falhou: ${err}`);
  }
  console.log(`[francashopping] ${stored} eventos`);
  return stored;
}
