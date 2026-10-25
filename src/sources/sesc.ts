import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// group_id de cada unidade SESC (via /wp/v1/unidades-atividades).
const UNITS = [
  { id: 1005, city: "Franca" },
  { id: 35, city: "Ribeirão Preto" },
];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

interface Atividade {
  titulo?: string;
  complemento?: string;
  link?: string;
  imagem?: string;
  dataProxSessao?: string;
  dataPrimeiraSessao?: string;
  gratuito?: string;
  unidade?: { name?: string }[];
}

/** SESC Franca via API pública de atividades (JSON, com imagem/data). */
export async function syncSesc(today: string): Promise<number> {
  let stored = 0;
  for (const unit of UNITS) {
    try {
      const res = await fetch(
        `https://www.sescsp.org.br/wp-json/wp/v1/atividades/filter?local=${unit.id}&per_page=40`,
        { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as {
        atividade?: Atividade[];
      };
      for (const a of data.atividade ?? []) {
        // "" conta como ausente: a API manda vazio quando não há próxima sessão.
        const raw = a.dataProxSessao || a.dataPrimeiraSessao;
        const date = raw?.slice(0, 10);
        const time = raw?.slice(11, 16) || null;
        if (!a.titulo || !date || date < today) continue;
        const title = a.complemento
          ? `${a.titulo.trim()} (${a.complemento.trim()})`
          : a.titulo.trim();
        upsertEvent({
          title,
          date,
          time,
          venue: `Sesc ${unit.city}`,
          city: unit.city,
          price: a.gratuito ? "grátis" : null,
          // Só caminho absoluto: "@host" colado mudaria o domínio do link.
          link: a.link?.startsWith("/")
            ? `https://www.sescsp.org.br${a.link}`
            : null,
          image: a.imagem ?? null,
        });
        stored++;
      }
    } catch (err) {
      console.warn(`[sesc] unidade ${unit.city} falhou: ${err}`);
    }
  }
  console.log(`[sesc] ${stored} eventos`);
  return stored;
}
