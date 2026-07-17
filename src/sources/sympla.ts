import { createHash } from "node:crypto";
import { upsertEvent } from "../db.ts";

const CITY_SLUGS = [
  "franca-sp",
  "itirapua-sp",
  "ribeirao-corrente-sp",
  "restinga-sp",
];
// Páginas 1-2 por cidade (a 3 já vira evento corporativo/curso).
const CITIES = CITY_SLUGS.flatMap((c) => [
  `https://www.sympla.com.br/eventos/${c}`,
  `https://www.sympla.com.br/eventos/${c}?page=2`,
]);

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Só cidades pedidas — páginas pequenas do Sympla vazam eventos de fora.
const ALLOWED = new Set(
  ["Franca", "Itirapuã", "Ribeirão Corrente", "Restinga"].map(norm),
);

interface SymplaEvent {
  name: string;
  url: string;
  start_date: string;
  images?: { lg?: string; original?: string };
  location?: { name?: string; city?: string };
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

/** Scrape Sympla city listings (RSC payload) into structured events. */
export async function syncSympla(today: string): Promise<number> {
  let stored = 0;
  for (const url of CITIES) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = (await res.text()).replaceAll('\\"', '"');
      const chunks = html.match(/\{"end_date":.*?"event_type":"[A-Z]+"\}/g);
      for (const chunk of chunks ?? []) {
        let ev: SymplaEvent;
        try {
          ev = JSON.parse(chunk) as SymplaEvent;
        } catch {
          continue;
        }
        if (!ev.name || !ev.url || !ev.start_date) continue;
        // Páginas de cidade pequena vazam eventos de fora da região pedida.
        if (!ev.location?.city || !ALLOWED.has(norm(ev.location.city)))
          continue;
        // start_date vem em UTC; evento local = UTC-3.
        const local = new Date(ev.start_date);
        local.setUTCHours(local.getUTCHours() - 3);
        const date = local.toISOString().slice(0, 10);
        const time = local.toISOString().slice(11, 16);
        if (date < today) continue;
        upsertEvent({
          id: hash(`${ev.name.toLowerCase().trim()}|${date}`),
          title: ev.name.trim(),
          date,
          time,
          venue: ev.location?.name ?? null,
          city: ev.location?.city ?? null,
          price: null,
          link: ev.url,
          image: ev.images?.lg ?? ev.images?.original ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[sympla] falhou ${url}: ${err}`);
    }
  }
  console.log(`[sympla] ${stored} eventos`);
  return stored;
}
