import { createHash } from "node:crypto";
import { chat } from "./ai.ts";
import { env } from "./config/env.ts";
import { markDigested, pendingItems, upsertEvent } from "./db.ts";

const EXTRACT_PROMPT = `Você extrai eventos de entretenimento de notícias de Franca-SP e região.

Responda APENAS com um array JSON válido (sem markdown, sem comentários). Cada evento:
{"title": "nome curto e limpo do evento (sem frase de manchete)", "date": "YYYY-MM-DD", "time": "HH:MM" ou null, "venue": "local" ou null, "city": "cidade", "price": "R$ 60" | "grátis" | null, "item": <número do item de origem>}

Regras:
- SÓ inclua eventos cuja data do EVENTO esteja escrita no título ou resumo (ex.: "dia 24", "nesta sexta (18)", "24 de julho").
- A data de publicação da notícia NÃO é a data do evento — nunca a use. Texto sem data do evento → NÃO inclua.
- SÓ eventos em Franca-SP ou cidades vizinhas diretas (Restinga, Itirapuã, Ribeirão Corrente, Claraval, etc.). Estreias de cinema/série nacionais valem (city: "Cinemas" ou "Streaming") se tiverem data.
- Vale qualquer tipo de rolê com data: shows, teatro, stand-up, festivais, feiras/exposições, jogos de basquete (Sesi Franca) e futebol da região, passeios e eventos gratuitos.
- price só se o texto mencionar valor ou gratuidade.
- Eventos passados em relação à data de hoje → NÃO inclua.
- NUNCA invente eventos: cada evento precisa vir de um item da lista e "item" deve ser o número dele.
- Se não houver nenhum evento válido, responda [].`;

export interface Extracted {
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  price: string | null;
  item: number;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

function parseJson(raw: string): Extracted[] {
  const text = raw
    .replace(/^```(?:json)?/m, "")
    .replace(/```\s*$/m, "")
    .trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end < 0) throw new Error("sem array JSON na resposta");
  // A IA às vezes emite \u inválido (ex.: "\uls") — neutraliza p/ não quebrar o parse.
  const json = text
    .slice(start, end + 1)
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "u");
  return JSON.parse(json) as Extracted[];
}

/** Extract dated events from pending items via AI. Returns count stored. */
export async function extractEvents(today: string): Promise<number> {
  const items = pendingItems(env.digestMaxItems);
  if (!items.length) {
    console.log("[extract] nada novo para extrair");
    return 0;
  }

  const list = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary ?? ""}\n   publicado: ${it.published ?? "?"}`,
    )
    .join("\n\n");

  let events: Extracted[] = [];
  try {
    const raw = await chat(
      EXTRACT_PROMPT,
      `Hoje é ${today}.\n\nItens:\n\n${list}\n\nExtraia os eventos em JSON.`,
    );
    if (process.env.DEBUG_EXTRACT) console.log(`[extract:raw]\n${raw}`);
    events = parseJson(raw);
  } catch (err) {
    console.error(
      `[extract] IA/parse falhou (${err}) — itens seguem pendentes`,
    );
    return 0;
  }

  let stored = 0;
  for (const ev of events) {
    if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? "")) continue;
    if (ev.date < today) continue;
    // Anti-alucinação: todo evento precisa apontar p/ um item real.
    const src = items[ev.item - 1];
    if (!src) continue;
    upsertEvent({
      id: hash(`${ev.title.toLowerCase().trim()}|${ev.date}`),
      title: ev.title.trim(),
      date: ev.date,
      time: ev.time ?? null,
      venue: ev.venue ?? null,
      city: ev.city ?? null,
      price: ev.price ?? null,
      link: src?.link ?? null,
      image: src?.image ?? null,
    });
    stored++;
  }

  markDigested(items.map((it) => it.id));
  console.log(`[extract] ${stored} eventos com data de ${items.length} itens`);
  return stored;
}
