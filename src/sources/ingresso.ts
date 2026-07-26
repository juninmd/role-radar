import { upsertEvent } from "../db.ts";

const CITIES = [{ id: 192, label: "Cinema Moviecom Franca" }];

interface Movie {
  title?: string;
  premiereDate?: { localDate?: string };
  images?: { url?: string }[];
  siteURL?: string;
  urlKey?: string;
}

/** localDate ISO ("2026-07-23T00:00:00+00:00") → "2026-07-23", ou null. */
function toIso(raw?: string): string | null {
  return raw?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Fetch upcoming movie premieres (next 14 days) from Ingresso.com per city. */
export async function syncIngresso(today: string): Promise<number> {
  const horizon = addDays(today, 14);
  let stored = 0;
  for (const city of CITIES) {
    try {
      const res = await fetch(
        `https://api-content.ingresso.com/v0/templates/soon/${city.id}?partnership=home`,
        {
          headers: { "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const movies = (await res.json()) as Movie[];
      for (const m of movies) {
        const premiere = toIso(m.premiereDate?.localDate);
        // Só estreias na janela de 14 dias (senão flooda com meses de filmes).
        if (!m.title || !premiere) continue;
        if (premiere < today || premiere > horizon) continue;
        upsertEvent({
          title: `Estreia: ${m.title.trim()}`,
          date: premiere,
          time: null,
          venue: null,
          city: city.label,
          price: null,
          link: m.siteURL ?? `https://www.ingresso.com/filme/${m.urlKey}`,
          image: m.images?.[0]?.url ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[ingresso] cidade ${city.id} falhou: ${err}`);
    }
  }
  console.log(`[ingresso] ${stored} estreias`);
  return stored;
}
