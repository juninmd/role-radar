import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { limpa, parseDataBr } from "./comum.ts";
import { MAX_SOURCE_BODY } from "./public-url.ts";

// CorridasBR: calendário de corridas de rua do estado inteiro numa página.
// Ticketsports/Even3 são SPA e não mostram as provas de Franca; aqui elas estão
// (Franca, Pedregulho, Ituverava, Barretos, Orlândia, Ribeirão…).
const SITE = "https://www.corridasbr.com.br/sp";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Página de detalhe por rodada: só para achar o local da largada.
const MAX_DETAIL = 30;

export interface Corrida {
  id: string;
  name: string;
  city: string;
  date: string;
  distances: string | null;
}

/** Linhas do calendário: "15.11 | Franca | Corre e Curti Corre Delax | 6/3km". */
export function parseCalendario(html: string, today: string): Corrida[] {
  const out: Corrida[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const id = row.match(/mostracorrida\.asp\?escolha=(\d+)/)?.[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      limpa(c[1]),
    );
    if (!id || cells.length < 3) continue;
    // A data vem "dd.mm", sem ano: o próximo em que ainda é futura.
    const quando = parseDataBr(cells[0].replace(".", "/"), today);
    if (!quando) continue;
    out.push({
      id,
      date: quando.date,
      city: cells[1],
      name: cells[2],
      distances: cells[3] || null,
    });
  }
  return out;
}

/** Local da largada no detalhe ("Largada: Rua Eliseu Alves Teixeira"). */
export const largada = (html: string) =>
  limpa(html.match(/Largada:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "") ||
  null;

// O site serve ISO-8859-1; ler como UTF-8 estragaria "Ribeirão" e "São".
async function getLatin1(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_SOURCE_BODY)
    throw new Error("resposta grande demais");
  return new TextDecoder("latin1").decode(buf);
}

/** Corridas de rua em Franca e região. */
export async function syncCorridasBr(today: string): Promise<number> {
  let stored = 0;
  try {
    const todas = parseCalendario(
      await getLatin1(`${SITE}/calendario.asp`),
      today,
    );
    const regiao = todas.filter((c) => c.date >= today && inRegion(c.city));
    const locais = await pool(regiao.slice(0, MAX_DETAIL), 4, (c) =>
      getLatin1(`${SITE}/mostracorrida.asp?escolha=${c.id}`)
        .then(largada)
        .catch(() => null),
    );
    for (const [i, c] of regiao.entries()) {
      upsertEvent({
        title: c.name,
        date: c.date,
        time: null,
        venue: locais[i] ?? null,
        city: c.city,
        price: null,
        link: `${SITE}/mostracorrida.asp?escolha=${c.id}`,
        image: null,
        description: c.distances
          ? `Corrida de rua — percursos de ${c.distances}`
          : "Corrida de rua",
      });
      stored++;
    }
    console.log(
      `[corridasbr] ${stored} corridas na região de ${todas.length} no estado`,
    );
  } catch (err) {
    console.warn(`[corridasbr] falhou: ${err}`);
  }
  return stored;
}
