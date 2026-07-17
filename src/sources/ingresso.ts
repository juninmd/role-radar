import { createHash } from "node:crypto";
import { upsertEvent } from "../db.ts";

const CITIES = [
  { id: 27, label: "Cinemas de Ribeirão Preto" },
  { id: 192, label: "Cinemas de Franca" },
];

interface Movie {
  title?: string;
  premiereDate?: { localDate?: string };
  images?: { url?: string }[];
  siteURL?: string;
  urlKey?: string;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

/** Fetch upcoming movie premieres from Ingresso.com per city. */
export async function syncIngresso(today: string): Promise<number> {
  let stored = 0;
  for (const city of CITIES) {
    try {
      const res = await fetch(
        `https://api-content.ingresso.com/v0/templates/nowplaying/${city.id}?partnership=home`,
        {
          headers: { "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const movies = (await res.json()) as Movie[];
      for (const m of movies) {
        const premiere = m.premiereDate?.localDate?.slice(0, 10);
        // Só estreias futuras (em cartaz há semanas não é "evento").
        if (!m.title || !premiere || premiere < today) continue;
        upsertEvent({
          id: hash(`${m.title.toLowerCase().trim()}|${premiere}`),
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
