import { chat } from "./ai.ts";
import { env } from "./config/env.ts";
import { type Item, markDigested, pendingItems, upsertEvent } from "./db.ts";
import { pool } from "./pool.ts";
import { enrichItems } from "./sources/article.ts";

const EXTRACT_PROMPT = `Você extrai eventos de entretenimento de notícias de Franca-SP e região.

Responda APENAS com um array JSON válido (sem markdown, sem comentários). Cada evento:
{"title": "nome curto e limpo do evento (sem frase de manchete)", "date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" ou null, "time": "HH:MM" ou null, "venue": "local" ou null, "city": "cidade", "price": "R$ 60" | "grátis" | null, "item": <número do item de origem>}

Regras:
- SÓ inclua eventos cuja data do EVENTO esteja escrita no título, resumo ou texto da matéria (ex.: "dia 24", "nesta sexta (18)", "24 de julho", "de 25 a 27 de setembro").
- A data de publicação NÃO é a data do evento. Mas expressão relativa ("neste fim de semana", "nesta sexta", "até este domingo, 27") se resolve a partir da data de publicação do item: publicado numa quinta, "neste fim de semana" = sexta a domingo seguintes.
- Texto sem nenhuma data do evento (nem relativa) → NÃO inclua.
- Evento de vários dias (festival, feira, exposição): "date" = primeiro dia, "end_date" = último dia. Um dia só → end_date null.
- Leia o texto da matéria: o nome do evento, o local, o horário e a gratuidade costumam estar lá, não na manchete.
- SÓ eventos em Franca-SP (prioridade), nas cidades vizinhas diretas (Restinga, Itirapuã, Ribeirão Corrente, Claraval, Batatais, Orlândia, etc.), em Ribeirão Preto ou em Barretos/Sertãozinho/Bebedouro (raio ~100km). Estreias de cinema/série nacionais valem (city: "Cinemas" ou "Streaming") se tiverem data.
- Vale qualquer tipo de rolê com data: shows, teatro, stand-up, festivais, feiras/exposições, jogos de basquete (Sesi Franca) e futebol da região, passeios e eventos gratuitos.
- Para JOGO, o título é só o confronto: "Francana x Ponte Preta" ou "Sesi Franca x Flamengo" — nunca a manchete ("Molecada em campo: times sub-13...").
- O título é o NOME do evento, curto, como estaria no cartaz. Se a manchete não permitir extrair um nome de evento curto, NÃO inclua o item.
- price só se o texto mencionar valor ou gratuidade.
- Eventos que já TERMINARAM em relação à data de hoje → NÃO inclua (festival em andamento vale).
- NUNCA invente eventos: cada evento precisa vir de um item da lista e "item" deve ser o número dele.
- Se não houver nenhum evento válido, responda [].`;

export interface Extracted {
  title: string;
  date: string;
  end_date?: string | null;
  time: string | null;
  venue: string | null;
  city: string | null;
  price: string | null;
  item: number;
}

// Lote enviado por chamada de IA: listas longas fazem o modelo pular itens.
// Com o texto das matérias, 20 itens passavam do AI_TIMEOUT_MS (homologação).
const BATCH = 10;
// Chamadas simultâneas ao provider — teto p/ não estourar rate limit do LiteLLM.
const CONCURRENCY = 4;
const RETRY_UNREAD_MS = 48 * 3600_000;

/**
 * A regra nº 1 do prompt é "só extraia se a data do EVENTO estiver no texto".
 * Item sem nenhum sinal de data nunca vira evento — então nem vai pra IA.
 * Descarta ~70% da fila de graça — é o que permite varrê-la inteira, não só 40.
 */
const DATE_HINT =
  /\b\d{1,2}\s*[/-]\s*\d{1,2}\b|\b\d{1,2}\s*de\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)|\bdia\s+\d{1,2}\b|\b(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b|\b(hoje|amanha|amanhã|fim de semana|feriado|neste|nesta|próxim|proxim)\b|\d{4}-\d{2}-\d{2}|\b\d{1,2}\s*h(oras|\d{2})?\b/i;

const hasDateHint = (it: Item) =>
  DATE_HINT.test(`${it.title} ${it.summary ?? ""} ${it.body ?? ""}`);

/**
 * Manchete de rolê sem data ("Festival coreano reúne 600 pratos em Franca"):
 * a data costuma estar no corpo, então vale abrir a matéria antes de descartar.
 */
const EVENT_HINT =
  /festival|festa|\bshow|feira|evento|espet[áa]culo|teatro|exposi[çc][ãa]o|atra[çc][õo]es|programa[çc][ãa]o|gratuit|ingresso|stand.?up|apresenta[çc][ãa]o|celebra/i;

const looksLikeEvent = (it: Item) =>
  EVENT_HINT.test(`${it.title} ${it.summary ?? ""}`);

// Verbo conjugado é o que separa manchete de nome de evento: "a Molecada
// ENTRA em campo" é notícia; "Festival Cada Um na Sua" é evento.
const VERBO_DE_MANCHETE =
  /\b(t[êe]m|tem|entra[mr]?|acontece[rm]?|ser[áã]o?|vai|v[ãa]o|abre[mr]?|fecha[mr]?|recebe[mr]?|confira|veja|saiba|anuncia|divulga|come[çc]a[mr]?|termina[mr]?|est[áã]o?|faz|fazem|busca[mr]?|leva[mr]?|traz(em)?|pode[mr]?)\b/i;

/**
 * A IA às vezes devolve a manchete inteira como "evento". Rejeita título com
 * cara de notícia — exceto confronto esportivo ("Francana x Ponte Preta"),
 * que é nome de evento legítimo mesmo com poucas palavras.
 */
function pareceNoticia(title: string): boolean {
  const t = title.trim();
  if (/\s+x\s+/i.test(t) && t.split(/\s+/).length <= 8) return false;
  return t.split(/\s+/).length > 10 || VERBO_DE_MANCHETE.test(t);
}

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

/**
 * Manda um lote pra IA e grava os eventos válidos. Devolve quantos gravou, ou
 * null se a IA/parse falhou — aí o lote fica na fila para a próxima rodada.
 */
async function runBatch(today: string, batch: Item[]): Promise<number | null> {
  const list = batch
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary ?? ""}\n   publicado: ${it.published ?? "?"}${it.body ? `\n   texto: ${it.body.slice(0, 900)}` : ""}`,
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
    // Falha isolada: este lote volta na próxima rodada, os outros seguem.
    console.error(`[extract] IA/parse falhou, lote fica pendente (${err})`);
    return null;
  }

  let stored = 0;
  let recusados = 0;
  for (const ev of events) {
    if (!ev.title || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date ?? "")) continue;
    // Festival em andamento vale: o que conta é o último dia. Fim antes do
    // início é lixo da IA: vira evento de um dia, não descarte.
    // Fim que não é data ("sábado") não pode entrar: em string, "sábado" > "2026…" é verdade.
    const fim = /^\d{4}-\d{2}-\d{2}$/.test(ev.end_date ?? "")
      ? ev.end_date
      : null;
    const end = fim && fim > ev.date ? fim : null;
    if ((end ?? ev.date) < today) continue;
    if (pareceNoticia(ev.title)) {
      recusados++;
      if (process.env.DEBUG_EXTRACT)
        console.log(`[extract] recusado (manchete): ${ev.title}`);
      continue;
    }
    // Anti-alucinação: todo evento precisa apontar p/ um item real do lote.
    const src = batch[ev.item - 1];
    if (!src) continue;
    upsertEvent({
      title: ev.title.trim(),
      date: ev.date,
      end_date: end,
      time: ev.time ?? null,
      venue: ev.venue ?? null,
      city: ev.city ?? null,
      price: ev.price ?? null,
      link: src.link,
      image: src.image,
    });
    stored++;
  }
  if (recusados)
    console.log(`[extract] ${recusados} manchete(s) recusada(s) como evento`);
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
  // Só abre matéria de quem parece rolê; o resto segue o filtro barato de data.
  const { unread } = await enrichItems(
    queue.filter((it) => hasDateHint(it) || looksLikeEvent(it)),
  );
  // Sem data só porque a matéria não foi lida (teto ou Google bloqueado): fica
  // na fila (até 48h) em vez de ser descartado — a data costuma estar no corpo.
  const retryAfter = new Date(Date.now() - RETRY_UNREAD_MS).toISOString();
  for (const it of queue) {
    if (hasDateHint(it)) candidates.push(it);
    else if (!unread.has(it.id) || it.fetched_at < retryAfter) skipped.push(it);
  }
  const batch = candidates.slice(0, env.digestMaxItems);
  if (candidates.length > batch.length)
    console.warn(
      `[extract] ${candidates.length - batch.length} candidato(s) além do teto de ${env.digestMaxItems} — ficam pendentes`,
    );

  const batches = chunk(batch, BATCH);
  const counts = await pool(batches, CONCURRENCY, (b) => runBatch(today, b));
  const stored = counts.reduce<number>((a, b) => a + (b ?? 0), 0);
  const done = batches.filter((_, i) => counts[i] !== null).flat();

  markDigested([...done, ...skipped].map((it) => it.id));
  console.log(
    `[extract] ${stored} eventos de ${batch.length} itens com data (${skipped.length} sem data descartados, ${queue.length} na fila)`,
  );
  return stored;
}
