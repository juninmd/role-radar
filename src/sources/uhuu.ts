import { inRegion, SEARCH_CITIES } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import type { Parsed } from "./comum.ts";

// A busca da Uhuu é nacional e difusa (pedir "franca" devolve evento de Natal),
// então o filtro real é a cidade que vem no card. Cada card carrega um bloco
// gtag com os dados já estruturados — data, hora, local, cidade e preço — o que
// é bem mais confiável que raspar o HTML visível.
const BUSCA = "https://uhuu.com/busca?termo=";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const TERMOS = SEARCH_CITIES;

const campo = (bloco: string, chave: string) =>
  bloco.match(new RegExp(`${chave}:\\s*'([^']*)'`))?.[1]?.trim() ?? null;

/** Extrai os eventos de uma busca da Uhuu. Exportada para homologar por cidade. */
export async function scrapeUhuu(
  termo: string,
  today: string,
): Promise<Parsed[]> {
  const html = await fetch(BUSCA + encodeURIComponent(termo), {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  const out: Parsed[] = [];
  for (const card of html.split('class="item card-evento"').slice(1)) {
    const gtag = card.match(/items:\s*\[\{([\s\S]*?)\}\]/)?.[1];
    if (!gtag) continue;
    const nome = campo(gtag, "item_name");
    const dataBr = campo(gtag, "event_date");
    if (!nome || !dataBr) continue;
    const [dia, mes, ano] = dataBr.split("/");
    if (!ano) continue;
    const date = `${ano}-${mes}-${dia}`;
    if (date < today) continue;
    const preco = campo(gtag, "price");
    out.push({
      title: nome,
      date,
      time: campo(gtag, "event_hour"),
      venue: campo(gtag, "local_nome"),
      city: campo(gtag, "local_cidade"),
      price: preco ? `R$ ${preco}` : null,
      link:
        card.match(/href="(https:\/\/uhuu\.com\/evento\/[^"]+)"/)?.[1] ??
        "https://uhuu.com",
      image: card.match(/data-src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
    });
  }
  return out;
}

/** Eventos da Uhuu na região. */
export async function syncUhuu(today: string): Promise<number> {
  let stored = 0;
  const vistos = new Set<string>();
  const counts = await pool(TERMOS, 2, async (termo) => {
    let n = 0;
    try {
      for (const ev of await scrapeUhuu(termo, today)) {
        if (!inRegion(ev.city)) continue;
        const chave = `${ev.title}|${ev.date}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        upsertEvent(ev);
        n++;
      }
    } catch (err) {
      console.warn(`[uhuu] falhou ${termo}: ${err}`);
    }
    return n;
  });
  stored = counts.reduce((a, b) => a + b, 0);
  console.log(`[uhuu] ${stored} eventos`);
  return stored;
}
