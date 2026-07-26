import { createHash } from "node:crypto";
import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";

// Duoticket é a bilheteria com maior presença em Franca (festas, sertanejo,
// pagode, corridas). A home lista "Próximos Eventos" de todas as cidades.
const BASE = "https://duoticket.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Teto de requisições de detalhe por execução (local/horário só existem lá).
const MAX_DETAILS = 25;

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/**
 * Local, horário e nome completo só existem na página do evento — a listagem
 * trunca o título ("8 anos Bar do Ademir. Porco á p...").
 */
async function detail(url: string) {
  try {
    const html = await get(url);
    const box = html.match(
      /LOCAL<\/h4>\s*<div class="content-sidebar-short-description">([\s\S]*?)<\/div>/,
    )?.[1];
    const title = decode(
      html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "",
    ).replace(/\s*-\s*Duoticket$/, "");
    if (!box) return { title: title || null };
    const line = decode(box.split("<br>")[0] ?? "");
    const [venue, hours] = line.split("|").map((s) => s.trim());
    const hm = hours?.match(/(\d{1,2})h(\d{2})?/);
    return {
      title: title || null,
      venue: venue || null,
      time: hm ? `${hm[1].padStart(2, "0")}:${hm[2] ?? "00"}` : null,
    };
  } catch {
    return {};
  }
}

/** Eventos da Duoticket na região de Franca. */
export async function syncDuoticket(today: string): Promise<number> {
  let stored = 0;
  try {
    const html = await get(`${BASE}/`);
    const chunks = html.split('class="item-listing-container-skrn"').slice(1);
    const found: {
      title: string;
      date: string;
      city: string;
      link: string;
      image: string | null;
    }[] = [];

    for (const chunk of chunks) {
      const card = chunk.slice(0, 2000);
      const title = decode(
        card.match(/text-name-event"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ??
          "",
      );
      const slug = card.match(/href="(evento\/\d+\/[^"]+)"/)?.[1];
      const br = card.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      const city = decode(
        card.match(/fa-map-marker-alt"><\/i>\s*([^|<]+)\|/)?.[1] ?? "",
      );
      if (!title || !slug || !br || !inRegion(city)) continue;
      const date = `${br[3]}-${br[2]}-${br[1]}`;
      if (date < today) continue;
      found.push({
        title,
        date,
        city,
        link: `${BASE}/${slug}`,
        image: card.match(/data-src="(https:\/\/[^"]+)"/)?.[1] ?? null,
      });
    }

    for (const ev of found.slice(0, MAX_DETAILS)) {
      const { title = null, venue = null, time = null } = await detail(ev.link);
      // O título da listagem vem cortado; o da página do evento é o completo.
      const full = title ?? ev.title;
      upsertEvent({
        id: hash(`${full.toLowerCase()}|${ev.date}`),
        title: full,
        date: ev.date,
        time,
        venue,
        city: ev.city,
        price: null,
        link: ev.link,
        image: ev.image,
      });
      stored++;
    }
    if (found.length > MAX_DETAILS)
      console.warn(
        `[duoticket] ${found.length - MAX_DETAILS} evento(s) além do teto de ${MAX_DETAILS}`,
      );
  } catch (err) {
    console.warn(`[duoticket] falhou: ${err}`);
  }
  console.log(`[duoticket] ${stored} eventos`);
  return stored;
}
