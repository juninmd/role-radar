import { SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";

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
}

interface ArticketResponse {
  status?: string;
  data?: ArticketEvent[];
}

/** Eventos do Articket buscando pelas cidades da região. */
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
      const json = (await res.json()) as ArticketResponse;

      for (const ev of json.data ?? []) {
        if (!ev.id || seen.has(ev.id) || !ev.title || !ev.start_date) continue;
        seen.add(ev.id);

        const date = ev.start_date.slice(0, 10);
        const end = ev.end_date ? ev.end_date.slice(0, 10) : null;
        const validEnd = end && end > date ? end : null;
        if ((validEnd ?? date) < today) continue;

        const time = ev.start_date.slice(11, 16);

        upsertEvent({
          title: ev.title.trim(),
          date,
          end_date: validEnd,
          time: time === "00:00" ? null : time,
          venue: ev.location ? ev.location.trim() : null,
          city,
          price: null,
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
