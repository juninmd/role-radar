import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// A Mega Bilheteria vende para o Teatro Municipal e casas da região. A API
// pública ignora todo filtro de cidade que se mande (city, cityName, city_path,
// state: sempre devolvem o catálogo inteiro), mas ela é pequena — ~230 eventos
// em 3 páginas — então varre-se tudo e filtra pelo campo `city` de cada item.
const API = "https://web.megabilheteria.com/api/public/v2/events";
const SITE = "https://megabilheteria.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const MAX_PAGES = 10;

interface MegaEvent {
  code?: number;
  name?: string;
  image?: string;
  /** "2026-09-19T19:00:00" — horário local, sem timezone. */
  date?: string;
  kind?: string;
  local?: string;
  city?: string;
}

interface Page {
  data?: MegaEvent[];
  last_page?: number;
}

/** Eventos da Mega Bilheteria na região de Franca. */
export async function syncMegabilheteria(today: string): Promise<number> {
  let stored = 0;
  try {
    const all: MegaEvent[] = [];
    let last = 1;
    for (let page = 1; page <= Math.min(last, MAX_PAGES); page++) {
      const res = await fetch(`${API}?size=100&page=${page}`, {
        headers: { "user-agent": UA, accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as Page;
      all.push(...(json.data ?? []));
      last = json.last_page ?? 1;
    }

    for (const ev of all) {
      if (!ev?.name || !ev.date || !inRegion(ev.city)) continue;
      const date = ev.date.slice(0, 10);
      const time = ev.date.slice(11, 16) || null;
      if (date < today) continue;
      upsertEvent({
        title: ev.name.trim(),
        date,
        time,
        venue: ev.local?.trim() || null,
        city: ev.city ?? null,
        price: null,
        description: ev.kind ? `Gênero: ${ev.kind.trim()}` : null,
        // Padrão que o próprio front do site usa: /evento?id={code}.
        link: ev.code ? `${SITE}/evento?id=${ev.code}` : SITE,
        // Só caminho absoluto: "@host" colado mudaria o domínio da imagem.
        image: ev.image?.startsWith("/") ? `${SITE}${ev.image}` : null,
      });
      stored++;
    }
    console.log(
      `[megabilheteria] ${stored} eventos de ${all.length} no catálogo`,
    );
  } catch (err) {
    console.warn(`[megabilheteria] falhou: ${err}`);
  }
  return stored;
}
