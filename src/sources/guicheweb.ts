import { SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";

// Guichê Web: forte atuação no interior de SP (Sertãozinho, Ribeirão Preto, Franca).
// O webservice carregar_home aceita busca por cidade via POST multipart/form-data.
const API = "https://www.guicheweb.com.br/webservices/api/api.php";
const SITE = "https://www.guicheweb.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface GWEvento {
  id_evento?: string;
  nome?: string;
  img?: string;
  cidade?: string;
  data?: string; // "DD/MM/YYYY"
  local?: string;
  url_amigavel?: string;
}

interface GWResponse {
  item_eventos?: GWEvento[];
  qtd_eventos?: number;
}

const parseDate = (d?: string): string | null => {
  if (!d) return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const cleanCity = (c?: string): string | null => {
  if (!c) return null;
  return c.replace(/\/SP$/i, "").trim();
};

/** Eventos do Guichê Web nas cidades pesquisadas da região. */
export async function syncGuicheWeb(today: string): Promise<number> {
  const counts = await pool(SEARCH_CITIES, 4, async (city) => {
    let stored = 0;
    try {
      const form = new FormData();
      form.append("a", "carregar_home");
      form.append("pesquisa", city);
      form.append("hotsite", "false");

      const res = await fetch(API, {
        method: "POST",
        body: form,
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GWResponse;

      for (const ev of data.item_eventos ?? []) {
        if (!ev.nome || !ev.data) continue;
        const date = parseDate(ev.data);
        if (!date || date < today) continue;

        upsertEvent({
          title: ev.nome.trim(),
          date,
          time: null,
          venue: ev.local ? ev.local.trim() : null,
          city: cleanCity(ev.cidade) || city,
          price: null,
          link:
            ev.url_amigavel || `${SITE}/busca?q=${encodeURIComponent(city)}`,
          image: ev.img ? `${SITE}/imagens/eventos/${ev.img}` : null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[guicheweb] falhou ${city}: ${err}`);
    }
    return stored;
  });

  const total = counts.reduce((a, b) => a + b, 0);
  console.log(`[guicheweb] ${total} eventos`);
  return total;
}
