import { SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Articket: plataforma independente de ingressos com foco em rock, shows alternativos
// e casas underground (ex: Toca do Jack Pub, Armazém Baixada, eventos em Ribeirão Preto).
// A API de busca aberta responde JSON em /api/search?q={termo}.
const API = "https://articket.com.br/api/search";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface ArticketEvent {
  id?: number;
  title?: string;
  start_date?: string; // ISO UTC
  end_date?: string | null;
  image?: string | null;
  location?: string | null;
  url?: string | null;
  price?: number | string | null;
  price_min?: number | null;
  description?: string | null;
}

interface ArticketResponse {
  status?: string;
  data?: ArticketEvent[];
}

/** Eventos do Articket buscando pelas cidades da região. */
/** ISO de São Paulo (UTC-3) a partir de um instante UTC; quem chama pega dia e hora. */
function saoPauloIso(utc: string): string {
  const d = new Date(utc);
  d.setUTCHours(d.getUTCHours() - 3);
  return d.toISOString();
}

export async function syncArticket(today: string): Promise<number> {
  const seen = new Set<number>();
  const counts = await pool(SEARCH_CITIES, 4, async (city) => {
    let stored = 0;
    try {
      const res = await fetch(`${API}?q=${encodeURIComponent(city)}`, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(
        await readCapped(res, MAX_SOURCE_BODY),
      ) as ArticketResponse;

      for (const ev of json.data ?? []) {
        if (!ev?.id || seen.has(ev.id) || !ev.title || !ev.start_date) continue;
        seen.add(ev.id);

        const start = saoPauloIso(ev.start_date);
        const date = start.slice(0, 10);
        const end = ev.end_date ? saoPauloIso(ev.end_date).slice(0, 10) : null;
        const validEnd = end && end > date ? end : null;
        if ((validEnd ?? date) < today) continue;

        const time = start.slice(11, 16);
        const priceStr =
          typeof ev.price_min === "number"
            ? `A partir de R$ ${ev.price_min.toFixed(2).replace(".", ",")}`
            : typeof ev.price === "string"
              ? ev.price
              : null;
        const description = ev.description
          ? ev.description
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 300)
          : null;

        upsertEvent({
          title: ev.title.trim(),
          date,
          end_date: validEnd,
          time: time === "00:00" ? null : time,
          venue: ev.location ? ev.location.trim() : null,
          city,
          price: priceStr,
          description,
          link: ev.url || `https://articket.com.br/e/${ev.id}`,
          image: ev.image ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[articket] falhou ${city}: ${err}`);
    }
    return stored;
  });

  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[articket] ${total} eventos`);
  return total;
}
