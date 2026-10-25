import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// A OTicket é de Franca (Rua Batatais, 260) e vende para casas que não estão
// em nenhuma outra bilheteria: Club Show Franca, Paggio Gastro Bar, Unifran.
// O site é Next client-side, mas a API de busca é aberta. O parâmetro `city`
// só casa exato e sem acento — pedir a lista inteira (~100 eventos, uma
// requisição) e filtrar aqui cobre Franca, Orlândia e Ribeirão de uma vez.
const API = "https://api.oticket.com.br/search?city=&producer=";
const SITE = "https://www.oticket.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface OTicketEvent {
  name?: string;
  slug?: string;
  /** ISO com Z, mas representa o horário local do evento. */
  date?: string;
  place?: string;
  city?: string;
  image_url?: string;
}

/** Eventos da OTicket na região. */
export async function syncOticket(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(API, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as {
      result?: OTicketEvent[];
    };
    const all = json.result ?? [];

    for (const ev of all) {
      // Item nulo na lista não pode derrubar a rodada: os seguintes ainda contam.
      if (!ev?.name || !ev.date || !inRegion(ev.city)) continue;
      // A API marca meia-noite UTC quando o horário não foi informado; nesse
      // caso não há hora útil pra mostrar.
      const date = ev.date.slice(0, 10);
      const hhmm = ev.date.slice(11, 16);
      if (date < today) continue;
      // A plataforma deixa evento de teste do próprio operador no catálogo.
      if (/^evento teste/i.test(ev.name.trim())) continue;
      upsertEvent({
        title: ev.name.trim(),
        date,
        time: hhmm === "00:00" ? null : hhmm,
        // "A divulgar" é o placeholder deles pra local indefinido.
        venue:
          ev.place && !/^a divulgar$/i.test(ev.place.trim())
            ? ev.place.trim()
            : null,
        city: ev.city ?? null,
        price: null,
        link: ev.slug ? `${SITE}/event/${ev.slug}` : `${SITE}/events`,
        image: ev.image_url ?? null,
      });
      stored++;
    }
    console.log(`[oticket] ${stored} eventos de ${all.length} no catálogo`);
  } catch (err) {
    console.warn(`[oticket] falhou: ${err}`);
  }
  return stored;
}
