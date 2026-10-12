import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";

// Q2 Ingressos: sede em Franca (Av. Ver. José Granzotte, 2345).
// O catálogo público de próximos eventos é disponibilizado pelo CDN oficial.
const API = "https://cdn.q2ingressos.com.br/assets/api/nextEvents.json";
const SITE = "https://q2ingressos.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface Q2Event {
  Id?: number;
  Name?: string;
  StartDate?: string;
  EndDate?: string | null;
  ImageHomeEvent?: string | null;
  ImageEvent?: string | null;
  Place?: string | null;
  City?: string | null;
  Slug?: string | null;
}

/** Eventos da Q2 Ingressos na região de Franca. */
export async function syncQ2Ingressos(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(API, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = (await res.json()) as Q2Event[];

    for (const ev of list) {
      if (!ev.Name || !ev.StartDate || !inRegion(ev.City)) continue;
      const date = ev.StartDate.slice(0, 10);
      const end = ev.EndDate ? ev.EndDate.slice(0, 10) : null;
      const validEnd = end && end > date ? end : null;
      if ((validEnd ?? date) < today) continue;

      const link = ev.Slug ? `${SITE}/events/${ev.Slug}` : `${SITE}/events`;

      upsertEvent({
        title: ev.Name.trim(),
        date,
        end_date: validEnd,
        time: null,
        venue: ev.Place ? ev.Place.trim() : null,
        city: ev.City ?? null,
        price: null,
        link,
        image: ev.ImageHomeEvent ?? ev.ImageEvent ?? null,
      });
      stored++;
    }
    console.log(
      `[q2ingressos] ${stored} eventos de ${list.length} no catálogo`,
    );
  } catch (err) {
    console.warn(`[q2ingressos] falhou: ${err}`);
  }
  return stored;
}
