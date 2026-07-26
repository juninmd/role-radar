import { chat } from "./ai.ts";
import { env } from "./config/env.ts";
import { type Item, markDigested, pendingItems, upsertEvent } from "./db.ts";
import { pool } from "./pool.ts";

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

// Lote enviado por chamada de IA: listas longas fazem o modelo pular itens.
const BATCH = 20;
// Chamadas simultâneas ao provider — teto p/ não estourar rate limit do LiteLLM.
const CONCURRENCY = 4;

/**
 * A regra nº 1 do prompt é "só extraia se a data do EVENTO estiver no texto".
 * Item sem nenhum sinal de data nunca vira evento — então nem vai pra IA.
 * Descarta ~70% da fila de graça — é o que permite varrê-la inteira, não só 40.
 */
const DATE_HINT =
  /\b\d{1,2}\s*[/-]\s*\d{1,2}\b|\b\d{1,2}\s*de\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)|\bdia\s+\d{1,2}\b|\b(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b|\b(hoje|amanha|amanhã|fim de semana|feriado|neste|nesta|próxim|proxim)\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}\s*h(oras|\d{2})?\b/i;

const hasDateHint = (it: Item) =>
  DATE_HINT.test(`${it.title} ${it.summary ?? ""}`);

const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

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

/** Manda um lote pra IA e grava os eventos válidos. Devolve quantos gravou. */
async function runBatch(today: string, batch: Item[]): Promise<number> {
  const list = batch
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
    // Falha isolada: só este lote se perde, os outros seguem.
    console.error(`[extract] IA/parse falhou (${err})`);
    return 0;
  }

  let stored = 0;
  for (const ev of events) {
    if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? "")) continue;
    if (ev.date < today) continue;
    // Anti-alucinação: todo evento precisa apontar p/ um item real do lote.
    const src = batch[ev.item - 1];
    if (!src) continue;
    upsertEvent({
      title: ev.title.trim(),
      date: ev.date,
      time: ev.time ?? null,
      venue: ev.venue ?? null,
      city: ev.city ?? null,
      price: ev.price ?? null,
      link: src.link,
      image: src.image,
    });
    stored++;
  }
  return stored;
}

/** Extract dated events from pending items via AI. Returns count stored. */
export async function extractEvents(today: string): Promise<number> {
  // Fila inteira (não só o teto de IA): o que não tem cara de data é
  // descartado de graça, senão a fila cresce pra sempre e itens antigos
  // nunca chegam a ser lidos.
  const queue = pendingItems(env.digestMaxItems * 10);
  if (!queue.length) {
    console.log("[extract] nada novo para extrair");
    return 0;
  }

  const candidates: Item[] = [];
  const skipped: Item[] = [];
  for (const it of queue) (hasDateHint(it) ? candidates : skipped).push(it);
  const batch = candidates.slice(0, env.digestMaxItems);
  if (candidates.length > batch.length)
    console.warn(
      `[extract] ${candidates.length - batch.length} candidato(s) além do teto de ${env.digestMaxItems} — ficam pendentes`,
    );

  const counts = await pool(chunk(batch, BATCH), CONCURRENCY, (b) =>
    runBatch(today, b),
  );
  const stored = counts.reduce((a, b) => a + b, 0);

  markDigested([...batch, ...skipped].map((it) => it.id));
  console.log(
    `[extract] ${stored} eventos de ${batch.length} itens com data (${skipped.length} sem data descartados, ${queue.length} na fila)`,
  );
  return stored;
}
