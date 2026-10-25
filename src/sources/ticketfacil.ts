import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { type Parsed, parseDataBr } from "./comum.ts";
import { readCapped } from "./public-url.ts";

// A busca do site é client-side (fuse.js) sobre este JSON — não adianta pedir
// /search.html?q=: a lista completa está aqui, e é nacional. Muitos itens têm
// data livre ("Todos os dias"), que não vira evento datado e é descartada.
const JSON_URL = "https://ticketfacil.com.br/search.json";
const SITE = "https://ticketfacil.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// O catálogo inteiro tem ~13 KB; o teto só corta resposta fora do normal.
const MAX_CATALOG = 5_000_000;

interface Item {
  thumbnail?: {
    eventName?: string;
    date?: string;
    location?: string;
    image?: { imageUrl?: string };
  };
  internalPageUrl?: string;
}

/** Extrai o catálogo inteiro. Exportada para inspecionar a cobertura por cidade. */
export async function scrapeTicketFacil(today: string): Promise<Parsed[]> {
  const res = await fetch(JSON_URL, {
    headers: { "user-agent": UA, accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const itens = JSON.parse(await readCapped(res, MAX_CATALOG)) as Item[];

  const out: Parsed[] = [];
  for (const it of itens ?? []) {
    const t = it.thumbnail;
    if (!t?.eventName) continue;
    const quando = t.date ? parseDataBr(t.date, today) : null;
    if (!quando || quando.date < today) continue;
    out.push({
      title: t.eventName.trim(),
      date: quando.date,
      time: quando.time,
      venue: null,
      // "São Paulo - SP" → "São Paulo"; "Theatro Da Paz | Belém - PA" → "Belém".
      city:
        t.location
          ?.split("|")
          .pop()
          ?.replace(/\s*[-/]\s*[A-Z]{2}\s*$/, "")
          .trim() || null,
      price: null,
      link: it.internalPageUrl ? `${SITE}/${it.internalPageUrl}` : SITE,
      image: t.image?.imageUrl ?? null,
    });
  }
  return out;
}

/** Eventos do Ticket Fácil na região. */
export async function syncTicketFacil(today: string): Promise<number> {
  let stored = 0;
  try {
    for (const ev of await scrapeTicketFacil(today)) {
      if (!inRegion(ev.city)) continue;
      upsertEvent(ev);
      stored++;
    }
  } catch (err) {
    console.warn(`[ticketfacil] falhou: ${err}`);
  }
  console.log(`[ticketfacil] ${stored} eventos`);
  return stored;
}
