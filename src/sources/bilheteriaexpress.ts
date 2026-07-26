import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, type Parsed, parseDataBr } from "./comum.ts";

// Loja Magento com uma página de agenda por cidade. Hoje Franca e Ribeirão
// respondem 200 mas sem produto — a fonte fica pronta pra quando encherem.
// O slug de Ribeirão é literalmente "ribeir-o-preto" (o acento vira hífen).
const BASE = "https://www.bilheteriaexpress.com.br/agendas/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const CIDADES: [string, string][] = [
  ["franca", "Franca"],
  ["ribeir-o-preto", "Ribeirão Preto"],
];

/**
 * Extrai a agenda de uma cidade. Exportada para homologar com cidade cheia
 * (ex.: "sao-paulo"), já que as nossas ainda estão vazias.
 */
export async function scrapeBilheteriaExpress(
  slug: string,
  cidade: string,
  today: string,
): Promise<Parsed[]> {
  const html = await fetch(`${BASE}${slug}.html`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });

  const out: Parsed[] = [];
  // O bloco "product-shop" é quem embrulha a tarja de data E o <h2> do nome —
  // cortar pelo product-name deixaria a data no item anterior.
  for (const bloco of html.split('class="product-shop"').slice(1)) {
    const link = bloco.match(/href="([^"]+)"/)?.[1];
    const title = limpa(bloco.match(/title="([^"]+)"/)?.[1] ?? "");
    if (!link || !title) continue;
    // Tarja azul antes do nome: "04 até 30/07 | Qui. 21h00" — vale o dia final.
    const dataTxt = limpa(
      bloco
        .slice(0, bloco.indexOf("product-name"))
        .match(/>([^<]*\d{1,2}[^<]*)</g)
        ?.pop() ?? "",
    );
    const quando = parseDataBr(dataTxt, today);
    if (!quando || quando.date < today) continue;
    out.push({
      title,
      date: quando.date,
      time: quando.time,
      // O nome do local está embutido no slug do produto, não em campo próprio.
      venue: null,
      city: cidade,
      price: null,
      link,
      image:
        bloco.match(/src="(https?:\/\/[^"]+\.(?:jpg|png|webp))"/)?.[1] ?? null,
    });
  }
  return out;
}

/** Eventos da Bilheteria Express nas cidades da região. */
export async function syncBilheteriaExpress(today: string): Promise<number> {
  const counts = await pool(CIDADES, 2, async ([slug, cidade]) => {
    let n = 0;
    try {
      for (const ev of await scrapeBilheteriaExpress(slug, cidade, today)) {
        if (!inRegion(ev.city)) continue;
        upsertEvent(ev);
        n++;
      }
    } catch (err) {
      console.warn(`[bilheteriaexpress] falhou ${slug}: ${err}`);
    }
    return n;
  });
  const stored = counts.reduce((a, b) => a + b, 0);
  console.log(`[bilheteriaexpress] ${stored} eventos`);
  return stored;
}
