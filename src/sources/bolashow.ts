import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// BolaShow (@andrebolashow) é um guia de shows de Campinas/interior que publica
// no Bluesky — a única rede social da região com feed público sem login
// (Instagram, Facebook e X exigem sessão). O handle responde 302 para o DID.
const FEED = "https://bsky.app/profile/andrebolashow.bsky.social/rss";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export interface BolaShowEvento {
  title: string;
  date: string;
  end_date: string | null;
  venue: string | null;
  city: string;
  // Sem link: o upsert mantém o primeiro link gravado, e o post do Bluesky não
  // pode ocupar o lugar do link de ingresso de outra fonte.
  link: null;
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Texto do <description> do RSS, com quebras de linha (&#xA;) preservadas. */
const decodifica = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const cp =
        e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });

/** "Artista" em CAIXA ALTA vira "Artista" — o resto do app usa título normal. */
const capitaliza = (s: string) =>
  s === s.toUpperCase()
    ? s
        .toLowerCase()
        .replace(/(^|[\s+/(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    : s;

const iso = (d: string, m: string, a: string) =>
  `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

/**
 * "20/11/2026", "28 e 29/11/2026", "30/11 a 02/12/2026", "28, 29 e 30/11/2026"
 * → primeiro e último dia. Só a última data traz o ano; mês e ano dos dias
 * anteriores vêm do token seguinte.
 */
function datas(linha: string): { date: string; end: string | null } | null {
  const toks = [...linha.matchAll(/(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?/g)];
  const ult = toks.at(-1);
  if (!ult?.[2] || !ult[3]) return null;
  let mes = ult[2];
  const dias = toks
    .reverse()
    .map((t) => {
      mes = t[2] ?? mes;
      return { dia: t[1], mes };
    })
    .reverse();
  if (dias.some((d) => +d.dia < 1 || +d.dia > 31 || +d.mes < 1 || +d.mes > 12))
    return null;
  const fim = iso(ult[1], ult[2], ult[3]);
  let ini = iso(dias[0].dia, dias[0].mes, ult[3]);
  // "30/12 a 02/01/2027": o início é do ano anterior ao do fim.
  if (ini > fim) ini = iso(dias[0].dia, dias[0].mes, String(+ult[3] - 1));
  return { date: ini, end: fim > ini ? fim : null };
}

const cidade = (s: string) => s.replace(/\s*[-/]\s*SP$/i, "").trim();

/**
 * Dois formatos de post:
 *  - show único: "ARTISTA\n\n🗓️ DD/MM/AAAA\n📌 Local - Cidade"
 *  - resumo do dia: "HOJE TEM SHOW NO INTERIOR\n📅 DD/MM/AAAA\n• ARTISTA | Cidade"
 * Só devolve o que está na região e ainda não passou; Sesc fica de fora porque
 * já vem pela API oficial (sesc.ts).
 */
export function parseBolaShow(
  descricao: string,
  today: string,
): BolaShowEvento[] {
  const linhas = descricao
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const out: BolaShowEvento[] = [];

  const diaria = linhas.find((l) => l.startsWith("📅"));
  if (diaria) {
    const d = datas(diaria);
    if (!d || d.date < today) return out;
    for (const l of linhas) {
      const m = l.match(/^[•*-]\s*(.+?)\s*\|\s*(.+)$/);
      if (!m || !inRegion(cidade(m[2]))) continue;
      out.push({
        title: capitaliza(m[1].trim()),
        date: d.date,
        end_date: null,
        venue: null,
        city: cidade(m[2]),
        link: null,
      });
    }
    return out;
  }

  const iData = linhas.findIndex((l) => l.startsWith("🗓"));
  const local = linhas.find((l) => l.startsWith("📌"));
  if (iData < 1 || !local) return out;
  const d = datas(linhas[iData]);
  if (!d || (d.end ?? d.date) < today) return out;
  const m = local.replace(/^📌\s*/, "").match(/^(.*)\s-\s([^-]+)$/);
  if (!m || !inRegion(cidade(m[2])) || /\bsesc\b/i.test(m[1])) return out;
  out.push({
    title: capitaliza(linhas.slice(0, iData).join(" + ")),
    date: d.date,
    end_date: d.end,
    venue: m[1].trim() || null,
    city: cidade(m[2]),
    link: null,
  });
  return out;
}

/** Shows de Franca e região anunciados pelo BolaShow no Bluesky. */
export async function syncBolaShow(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(FEED, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await readCapped(res, MAX_SOURCE_BODY);
    if (!xml.includes("<rss")) throw new Error("resposta não é RSS");

    for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1];
      if (!desc) continue;
      // Um post malformado não pode perder os seguintes.
      try {
        for (const ev of parseBolaShow(decodifica(desc), today)) {
          upsertEvent({ ...ev, time: null, price: null, image: null });
          stored++;
        }
      } catch (err) {
        console.warn(`[bolashow] post ignorado: ${err}`);
      }
    }
  } catch (err) {
    console.warn(`[bolashow] falhou: ${err}`);
  }
  console.log(`[bolashow] ${stored} eventos`);
  return stored;
}
