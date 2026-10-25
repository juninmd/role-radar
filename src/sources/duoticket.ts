import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { readCapped } from "./public-url.ts";

// Duoticket é a bilheteria com maior presença em Franca (festas, sertanejo,
// pagode, corridas). A home lista "Próximos Eventos" de todas as cidades.
const BASE = "https://duoticket.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Home tem ~165 KB; o teto só corta resposta fora do normal.
const MAX_PAGE = 5_000_000;
// Teto de requisições de detalhe por execução (local/horário só existem lá).
// Com o pool o custo é ~10 rodadas, então cabe mais fundo na lista da home.
const MAX_DETAILS = 40;

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
  return readCapped(res, MAX_PAGE);
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
    const ogDesc = decode(
      html.match(/<meta property="og:description" content="([^"]+)"/)?.[1] ??
        "",
    );

    const descBlock =
      html.match(
        /<div class="content-detail-event[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      )?.[1] ??
      html.match(
        /<div class="post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
      )?.[1] ??
      ogDesc;
    const cleanDesc = descBlock
      ? decode(
          descBlock
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
      : null;

    let price: string | null = null;
    const tidnv = html.match(/<span hidden id="tidnv">([^<]+)<\/span>/)?.[1];
    if (tidnv) {
      try {
        const lotesHtml = await get(
          `${BASE}/blocks/evento_lotes?e=${encodeURIComponent(tidnv)}`,
        );
        const matches = [
          ...lotesHtml.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g),
        ];
        if (matches.length > 0) {
          const values = matches
            .map((m) =>
              Number.parseFloat(m[1].replace(/\./g, "").replace(",", ".")),
            )
            .filter((n) => !Number.isNaN(n) && n > 0);
          if (values.length > 0) {
            const min = Math.min(...values);
            price = `A partir de R$ ${min.toFixed(2).replace(".", ",")}`;
          }
        }
      } catch {
        // lotes indisponíveis
      }
    }

    if (!box) {
      return {
        title: title || null,
        description: cleanDesc ? cleanDesc.slice(0, 300) : null,
        price,
      };
    }
    const line = decode(box.split("<br>")[0] ?? "");
    const [venue, hours] = line.split("|").map((s) => s.trim());
    const hm = hours?.match(/(\d{1,2})h(\d{2})?/);
    return {
      title: title || null,
      venue: venue || null,
      time: hm ? `${hm[1].padStart(2, "0")}:${hm[2] ?? "00"}` : null,
      description: cleanDesc ? cleanDesc.slice(0, 300) : null,
      price,
    };
  } catch (err) {
    console.warn(`[duoticket] detalhe falhou: ${err}`);
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

    // Detalhes em pool: 25 páginas em série eram o trecho mais lento do digest.
    await pool(found.slice(0, MAX_DETAILS), 4, async (ev) => {
      const {
        title = null,
        venue = null,
        time = null,
        price = null,
        description = null,
      } = await detail(ev.link);
      // O título da listagem vem cortado; o da página do evento é o completo.
      const full = title ?? ev.title;
      upsertEvent({
        title: full,
        date: ev.date,
        time,
        venue,
        city: ev.city,
        price,
        description,
        link: ev.link,
        image: ev.image,
      });
      stored++;
    });
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
