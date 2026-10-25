import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// A página do Multiplan Hall (dentro do RibeirãoShopping) é um "hub" fixo que
// nunca expira — lista os próximos shows confirmados numa lista simples, sem
// precisar navegar o catálogo de eventos do shopping (que é ~100 registros
// desde 2024, quase tudo promoção de loja e campanha de doação, não show).
const URL =
  "https://www.ribeiraoshopping.com.br/eventos/cqal732ewg-multiplan-hall-ribeiraoshopping/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// "<li><strong>Artista</strong> — <em>Nome do show</em> — <strong>DD/MM/AAAA</strong></li>"
const LINHA =
  /<li><strong>([^<]+)<\/strong>\s*—\s*<em>([^<]+)<\/em>\s*—\s*<strong>(\d{2})\/(\d{2})\/(\d{4})<\/strong><\/li>/g;

/** Shows confirmados do Multiplan Hall (RibeirãoShopping). */
export async function syncMultiplanHall(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await readCapped(res, MAX_SOURCE_BODY);

    for (const [, artista, show, dia, mes, ano] of html.matchAll(LINHA)) {
      const date = `${ano}-${mes}-${dia}`;
      if (date < today) continue;
      upsertEvent({
        title: `${artista.trim()} — ${show.trim()}`,
        date,
        time: null,
        venue: "Multiplan Hall, RibeirãoShopping",
        city: "Ribeirão Preto",
        price: null,
        link: URL,
        image: null,
      });
      stored++;
    }
  } catch (err) {
    console.warn(`[multiplanhall] falhou: ${err}`);
  }
  console.log(`[multiplanhall] ${stored} eventos`);
  return stored;
}
