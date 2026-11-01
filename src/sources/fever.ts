import { upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Fever (feverup.com) tem página de Ribeirão Preto com concertos à luz de vela
// (Teatro Minaz, USP) que nenhuma bilheteria brasileira lista. A lista só traz
// o link `/m/{id}`; data, local e preço estão no JSON-LD `Event` da página do
// evento. Outras cidades da região dão 404 na Fever.
const BASE = "https://feverup.com";
const LISTAS = ["candlelight", "music-events"].map(
  (c) => `${BASE}/en/ribeirao-preto/${c}`,
);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// Cada página de evento pesa ~1 MB: o teto evita uma rodada de dezenas de MB.
const MAX_EVENTOS = 14;
const CONCORRENCIA = 3;

interface LdEvent {
  "@type"?: string;
  name?: string;
  startDate?: string;
  image?: string;
  url?: string;
  location?: { name?: string; address?: { addressLocality?: string } };
  offers?: { price?: number } | { price?: number }[];
}

const get = async (url: string) => {
  const res = await fetch(url, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return readCapped(res, MAX_SOURCE_BODY);
};

/** Primeiro JSON-LD `Event` da página (a Fever também publica Product/FAQPage). */
export function eventoLd(html: string): LdEvent | null {
  for (const [, bruto] of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const dados = JSON.parse(bruto) as LdEvent | LdEvent[];
      const ev = [dados].flat().find((d) => d?.["@type"] === "Event");
      if (ev) return ev;
    } catch {
      // bloco que não é JSON (ou com entidade HTML) não é o que buscamos
    }
  }
  return null;
}

const reais = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/** Concertos e shows da Fever em Ribeirão Preto. */
export async function syncFever(today: string): Promise<number> {
  let stored = 0;
  try {
    // Uma lista fora do ar não derruba a outra; só falha se todas falharem.
    const listas = await Promise.allSettled(LISTAS.map(get));
    const falhas = listas.filter((r) => r.status === "rejected");
    if (falhas.length === listas.length) throw falhas[0].reason;
    for (const f of falhas) console.warn(`[fever] lista falhou: ${f.reason}`);
    const porLista = listas.flatMap((r) =>
      r.status === "fulfilled"
        ? [[...r.value.matchAll(/feverup\.com\/m\/(\d+)\//g)].map((m) => m[1])]
        : [],
    );
    // Intercala as listas: o teto não pode deixar uma delas sem vaga.
    const intercalado = Array.from(
      { length: Math.max(...porLista.map((l) => l.length)) },
      (_, i) => porLista.map((l) => l[i]),
    )
      .flat()
      .filter((id): id is string => Boolean(id));
    const ids = [...new Set(intercalado)].slice(0, MAX_EVENTOS);

    await pool(ids, CONCORRENCIA, async (id) => {
      try {
        const ev = eventoLd(await get(`${BASE}/m/${id}/en`));
        const date = ev?.startDate?.slice(0, 10);
        if (!ev?.name || !date || date < today) return;
        // Data e hora só valem no fuso de Brasília; outro offset mudaria o dia.
        if (!ev.startDate?.endsWith("-03:00")) return;
        // schema.org aceita um objeto só em vez de lista.
        const precos = [ev.offers ?? []]
          .flat()
          .map((o) => o.price)
          .filter((p): p is number => typeof p === "number" && p > 0);
        upsertEvent({
          title: ev.name.trim(),
          date,
          // startDate vem com o fuso local (-03:00): o relógio já é o de Ribeirão.
          time: ev.startDate?.slice(11, 16) ?? null,
          venue: ev.location?.name ?? null,
          city: ev.location?.address?.addressLocality ?? "Ribeirão Preto",
          price: precos.length ? reais(Math.min(...precos)) : null,
          link: ev.url ?? `${BASE}/m/${id}/en`,
          image: ev.image ?? null,
        });
        stored++;
      } catch (err) {
        console.warn(`[fever] evento ${id} falhou: ${err}`);
      }
    });
  } catch (err) {
    console.warn(`[fever] falhou: ${err}`);
  }
  console.log(`[fever] ${stored} eventos`);
  return stored;
}
