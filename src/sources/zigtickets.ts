import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { readCapped } from "./public-url.ts";

// Zig.tickets (antiga Superticket): forte presença em pubs, baladas e shows (Old Barn, Art House, etc.).
// A home renderiza via Next.js com __NEXT_DATA__ contendo o catálogo nacional de eventos.
const URL = "https://zig.tickets/";
const SITE = "https://zig.tickets";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// A home tem ~1,1 MB com o catálogo; o teto só corta resposta fora do normal.
const MAX_HTML = 5_000_000;

interface ZigLocation {
  name?: string;
  city?: string;
  formatted_address?: string;
}

interface ZigEvent {
  id?: number;
  name?: string;
  slug?: string;
  start_date?: string;
  end_date?: string | null;
  banner?: string | null;
  vertical_banner?: string | null;
  event_location?: ZigLocation;
  is_online?: boolean;
}

interface NextData {
  props?: {
    pageProps?: {
      events?: {
        events?: ZigEvent[];
      };
    };
  };
}

/** Eventos da Zig Tickets na região. */
export async function syncZigTickets(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await readCapped(res, MAX_HTML);

    const m = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!m) throw new Error("sem __NEXT_DATA__ no HTML");
    const json = JSON.parse(m[1]) as NextData;
    const list = json.props?.pageProps?.events?.events ?? [];

    for (const ev of list) {
      if (!ev.name || !ev.start_date || ev.is_online) continue;
      const city = ev.event_location?.city;
      if (!inRegion(city)) continue;

      const date = ev.start_date.slice(0, 10);
      const end = ev.end_date ? ev.end_date.slice(0, 10) : null;
      const validEnd = end && end > date ? end : null;
      if ((validEnd ?? date) < today) continue;

      const time = ev.start_date.slice(11, 16);
      const venue = ev.event_location?.name || null;
      const link = ev.slug ? `${SITE}/eventos/${ev.slug}` : SITE;

      upsertEvent({
        title: ev.name.trim(),
        date,
        end_date: validEnd,
        time: time === "00:00" ? null : time,
        venue,
        city: city ?? null,
        price: null,
        link,
        image: ev.banner ?? ev.vertical_banner ?? null,
      });
      stored++;
    }
    console.log(`[zigtickets] ${stored} eventos de ${list.length} no catálogo`);
  } catch (err) {
    console.warn(`[zigtickets] falhou: ${err}`);
  }
  return stored;
}
