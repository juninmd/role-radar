import { inRegion } from "../config/region.ts";
import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// O site é AngularJS e a listagem vem de eventos.php — mas o endpoint só
// responde JSON com os cabeçalhos que o $http do Angular manda. Com
// `accept: application/json` sozinho ele devolve 406; sem x-requested-with,
// devolve o esqueleto HTML da SPA. Era por isso que a plataforma parecia vazia.
const API = "https://www.ingressonacional.com.br/api/paginas/eventos.php";
const SITE = "https://www.ingressonacional.com.br";
const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  accept: "application/json, text/plain, */*",
  "x-requested-with": "XMLHttpRequest",
  referer: `${SITE}/`,
};

interface EventoIN {
  Nome?: string;
  Local?: string;
  Cidade?: string;
  IDEvento?: string;
  urlEvento?: string;
  /** "20260730" — já ordenável, é o campo mais limpo do payload. */
  DataOrdem?: string;
  Cancelado?: string | null;
  Adiado?: string | null;
}

/** Eventos da Ingresso Nacional na região (Theatro Pedro II e afins). */
export async function syncIngressoNacional(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(API, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as {
      sucesso?: { eventos?: EventoIN[] };
    };
    const all = json.sucesso?.eventos ?? [];

    for (const ev of all) {
      if (!ev.Nome || !ev.DataOrdem || !inRegion(ev.Cidade)) continue;
      if (ev.Cancelado || ev.Adiado) continue;
      const d = ev.DataOrdem;
      if (!/^\d{8}$/.test(d)) continue;
      const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      if (date < today) continue;
      upsertEvent({
        // O nome já vem com a data grudada ("... | 30/07"); a chave canônica
        // remove isso, mas o título exibido fica mais limpo sem.
        title: ev.Nome.replace(/\s*\|\s*\d{1,2}\/\d{1,2}\s*$/, "").trim(),
        date,
        time: null,
        venue: ev.Local?.trim() || null,
        city: ev.Cidade ?? null,
        price: null,
        link:
          ev.IDEvento && ev.urlEvento
            ? `${SITE}/evento/${ev.IDEvento}/${ev.urlEvento}`
            : SITE,
        // O payload traz só o nome do arquivo e não achei a base pública das
        // imagens; o digest cobre com og:image da página do evento.
        image: null,
      });
      stored++;
    }
    console.log(
      `[ingressonacional] ${stored} eventos de ${all.length} no catálogo`,
    );
  } catch (err) {
    console.warn(`[ingressonacional] falhou: ${err}`);
  }
  return stored;
}
