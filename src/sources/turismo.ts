import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Agenda oficial da Prefeitura de Franca (turismo). Página única, sem paginação.
const BASE = "https://turismo.franca.sp.gov.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Agenda oficial da Prefeitura de Franca (feiras, expos, teatro, oficinas). */
export async function syncTurismo(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(`${BASE}/eventos`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await readCapped(res, MAX_SOURCE_BODY);
    const cards =
      html.match(
        /<article class="card-lista card-evento">[\s\S]*?<\/article>/g,
      ) ?? [];
    for (const card of cards) {
      const title = decode(
        card.match(/class="card-link">([\s\S]*?)<\/a>/)?.[1] ?? "",
      );
      const start = card.match(
        /<time datetime="(\d{4}-\d{2}-\d{2})"[^>]*aria-label="Início"/,
      )?.[1];
      if (!title || !start) continue;
      const rawEnd = card.match(
        /<time datetime="(\d{4}-\d{2}-\d{2})"[^>]*aria-label="Término"/,
      )?.[1];
      // A agenda tem cadastros com término anterior ao início; nesses, ignora o fim.
      const end = rawEnd && rawEnd >= start ? rawEnd : null;
      // Evento de vários dias já em andamento aparece com a data de hoje.
      const date = end && start < today && end >= today ? today : start;
      if (date < today) continue;

      const slug = card.match(/\/detalhe_evento\?slug=([^"]+)"/)?.[1];
      const venue = decode(
        card.match(/aria-label="Local do evento">([^<]*)</)?.[1] ?? "",
      );
      const img = card.match(/<img src="(\/uploads\/[^"]+)"/)?.[1];
      upsertEvent({
        title,
        date,
        time: null,
        venue: venue || null,
        city: "Franca",
        price: null,
        link: slug ? `${BASE}/detalhe_evento?slug=${slug}` : `${BASE}/eventos`,
        image: img ? `${BASE}${img}` : null,
      });
      stored++;
    }
  } catch (err) {
    console.warn(`[turismo] falhou: ${err}`);
  }
  console.log(`[turismo] ${stored} eventos`);
  return stored;
}
