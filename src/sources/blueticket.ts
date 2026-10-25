import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// A Blueticket cobre Ribeirão Preto (que entra como complemento do radar).
// O parâmetro `city` da API é ignorado — pedir ?city=Franca devolve exatamente
// a mesma lista que ?city=Ribeirão Preto — então busca-se o catálogo inteiro
// (~300 eventos, uma requisição) e filtra-se por cityName.
const API = "https://api2.blueticket.com.br/events/?origin=capa&pdv=100";
const SITE = "https://www.blueticket.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface BlueEvent {
  name?: string;
  venue?: string;
  cityName?: string;
  /** "2026-09-18 08:00:00", horário local. */
  date?: string;
  slug?: string;
  /** Apesar do nome, é a URL da IMAGEM do evento — não a página dele. */
  url?: string;
}

/** Eventos da Blueticket na região. */
export async function syncBlueticket(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(API, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // A API às vezes responde 200 com corpo `null` — daí o encadeamento opcional.
    const json = JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as
      | BlueEvent[]
      | { data?: BlueEvent[] }
      | null;
    const all = Array.isArray(json) ? json : (json?.data ?? []);

    for (const ev of all) {
      if (!ev.name || !ev.date || !inRegion(ev.cityName)) continue;
      const date = ev.date.slice(0, 10);
      const hhmm = ev.date.slice(11, 16);
      if (date < today) continue;
      upsertEvent({
        title: ev.name.trim(),
        date,
        time: hhmm && hhmm !== "00:00" ? hhmm : null,
        venue: ev.venue?.trim() || null,
        city: ev.cityName ?? null,
        price: null,
        // O site é SPA e devolve o mesmo shell em qualquer rota, então não dá
        // pra confirmar por HTTP; /evento/{slug} é a rota que o front usa.
        link: ev.slug ? `${SITE}/evento/${ev.slug}` : SITE,
        image: ev.url ?? null,
      });
      stored++;
    }
    console.log(`[blueticket] ${stored} eventos de ${all.length} no catálogo`);
  } catch (err) {
    console.warn(`[blueticket] falhou: ${err}`);
  }
  return stored;
}
