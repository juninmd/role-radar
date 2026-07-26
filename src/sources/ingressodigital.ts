import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";

// A Ingresso Digital traz teatro/musical/stand-up que não aparece nas outras
// (Abba Experience, Grease, Starlight Concert). A busca é server-side e a
// paginação morre na página 1, então basta uma requisição por termo.
const BASE =
  "https://www.ingressodigital.com/pesquisa.php?busca=S&pg=1&txt_busca=";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Só as duas cidades com catálogo real na plataforma; o filtro de região
// abaixo é quem decide o que entra.
const TERMOS = ["franca", "ribeirao+preto"];

const MESES: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * "14 de Ago às 19:00" → { date, time }. O site omite o ano: assume-se o
 * próximo em que a data ainda é futura.
 */
function parseDate(
  raw: string,
  today: string,
): { date: string; time: string | null } | null {
  const m = raw.match(/(\d{1,2})\s*de\s*([A-Za-zç]{3})[^\d]*(\d{2}:\d{2})?/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase().slice(0, 3)];
  if (!mes) return null;
  const dia = m[1].padStart(2, "0");
  const ano = Number(today.slice(0, 4));
  const cand = `${ano}-${mes}-${dia}`;
  return {
    date: cand >= today ? cand : `${ano + 1}-${mes}-${dia}`,
    time: m[3] ?? null,
  };
}

/** Eventos da Ingresso Digital na região. */
export async function syncIngressoDigital(today: string): Promise<number> {
  let stored = 0;
  const seen = new Set<string>();
  const counts = await pool(TERMOS, 2, async (termo) => {
    let n = 0;
    try {
      const res = await fetch(BASE + termo, {
        headers: { "user-agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      for (const card of html.split('class="card-evento').slice(1)) {
        const title = decode(
          card.match(/class="titulo-card">([\s\S]*?)<\/h3>/)?.[1] ?? "",
        );
        const quando = decode(
          card.match(/class="data-evento">([\s\S]*?)<\/p>/)?.[1] ?? "",
        );
        const city = decode(
          card.match(/locale-card\.png"\s*\/?>\s*([^<]+)</)?.[1] ?? "",
        ).replace(/,\s*[A-Z]{2}$/, "");
        const link =
          card.match(/href='([^']+)'/)?.[1] ??
          card.match(/href="([^"]+)"/)?.[1];
        if (!title || !quando || !inRegion(city)) continue;
        const when = parseDate(quando, today);
        if (!when) continue;
        // Os dois termos de busca devolvem cards repetidos.
        const key = `${title}|${when.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        upsertEvent({
          title,
          date: when.date,
          time: when.time,
          venue: null,
          city,
          price: null,
          link: link ?? "https://www.ingressodigital.com",
          image: card.match(/data-src="(https?:\/\/[^"]+)"/)?.[1] ?? null,
        });
        n++;
      }
    } catch (err) {
      console.warn(`[ingressodigital] falhou ${termo}: ${err}`);
    }
    return n;
  });
  stored = counts.reduce((a, b) => a + b, 0);
  console.log(`[ingressodigital] ${stored} eventos`);
  return stored;
}
