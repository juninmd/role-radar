import { inRegion } from "../config/region.ts";
import { enrichEvent, eventId, upsertEvent } from "../db.ts";
import { pool } from "../pool.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Q2 Ingressos: sede em Franca (Av. Ver. José Granzotte, 2345).
// O catálogo público de próximos eventos é disponibilizado pelo CDN oficial.
const API = "https://cdn.q2ingressos.com.br/assets/api/nextEvents.json";
const SITE = "https://q2ingressos.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
// O catálogo tem ~100 KB; o teto só corta resposta fora do normal.
const MAX_CATALOG = 5_000_000;
// Detalhe por slug no mesmo CDN: é o que a página do evento chama via XHR.
const DETAIL =
  "https://cdn.q2ingressos.com.br/assets/api/getEventTicketsBySlug";

interface Q2Detail {
  time?: string | null;
  sections?: { tickets?: { value?: number; available?: number }[] }[];
  eventDetailVideos?: string[] | null;
}

const brl = (n: number) =>
  `R$ ${n.toFixed(2).replace(".", ",").replace(",00", "")}`;

/**
 * Horário, faixa de preço, esgotado e vídeo — nada disso vem no catálogo, e a
 * Q2 é a bilheteria de Franca (Morada du Capiau, Villa, Agrobar). Falha do
 * detalhe não derruba o evento: ele entra com o que o catálogo deu.
 */
export function parseQ2Detail(d: Q2Detail): {
  time: string | null;
  price: string | null;
  status: string | null;
  trailer: string | null;
} {
  const tickets = (d.sections ?? []).flatMap((s) => s?.tickets ?? []);
  const pagos = tickets
    .map((t) => Number(t?.value))
    .filter((n) => Number.isFinite(n) && n > 0);
  const [min, max] = [Math.min(...pagos), Math.max(...pagos)];
  // Sem o campo "available" não se sabe o estoque: não é esgotado.
  const estoque = tickets.map((t) => Number(t?.available ?? Number.NaN));
  const video = d.eventDetailVideos?.find((v) => /^https:\/\//.test(v));
  return {
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time ?? "")
      ? (d.time as string)
      : null,
    price: pagos.length
      ? min === max
        ? brl(min)
        : `${brl(min)} a ${brl(max)}`
      : null,
    // Esgotado só com ingressos listados e nenhum disponível.
    status: tickets.length && estoque.every((n) => n <= 0) ? "esgotado" : null,
    // Embed do YouTube vira link assistível no botão de trailer.
    trailer: video
      ? video.replace(
          /youtube\.com\/embed\/([\w-]+).*/,
          "youtube.com/watch?v=$1",
        )
      : null,
  };
}

async function fetchDetail(slug: string): Promise<Q2Detail | null> {
  try {
    const res = await fetch(`${DETAIL}/${encodeURIComponent(slug)}.json`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return JSON.parse(await readCapped(res, MAX_SOURCE_BODY)) as Q2Detail;
  } catch {
    return null;
  }
}

interface Q2Event {
  Id?: number;
  Name?: string;
  StartDate?: string;
  EndDate?: string | null;
  ImageHomeEvent?: string | null;
  ImageEvent?: string | null;
  Place?: string | null;
  City?: string | null;
  Slug?: string | null;
  Artists?: string | null;
  Description?: string | null;
}

/** Eventos da Q2 Ingressos na região de Franca. */
export async function syncQ2Ingressos(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(API, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = JSON.parse(await readCapped(res, MAX_CATALOG)) as Q2Event[];

    const alvos = list.filter((ev) => {
      if (!ev?.Name || !ev.StartDate || !inRegion(ev.City)) return false;
      const end = ev.EndDate?.slice(0, 10) ?? "";
      return (
        (end > ev.StartDate.slice(0, 10) ? end : ev.StartDate.slice(0, 10)) >=
        today
      );
    });
    const detalhes = await pool(alvos, 4, (ev) =>
      ev.Slug ? fetchDetail(ev.Slug) : Promise.resolve(null),
    );

    for (const [i, ev] of alvos.entries()) {
      if (!ev.Name || !ev.StartDate) continue;
      const date = ev.StartDate.slice(0, 10);
      const end = ev.EndDate ? ev.EndDate.slice(0, 10) : null;
      const validEnd = end && end > date ? end : null;
      const extra = detalhes[i] ? parseQ2Detail(detalhes[i] as Q2Detail) : null;

      const link = ev.Slug ? `${SITE}/events/${ev.Slug}` : `${SITE}/events`;
      const descParts = [
        ev.Artists ? `Atrações: ${ev.Artists.trim()}` : null,
        ev.Description
          ? ev.Description.replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
          : null,
      ].filter(Boolean);
      const description =
        descParts.length > 0 ? descParts.join(" — ").slice(0, 300) : null;

      upsertEvent({
        title: ev.Name.trim(),
        date,
        end_date: validEnd,
        time: extra?.time ?? null,
        venue: ev.Place ? ev.Place.trim() : null,
        city: ev.City ?? null,
        price: extra?.price ?? null,
        description,
        link,
        image: ev.ImageHomeEvent ?? ev.ImageEvent ?? null,
        trailer: extra?.trailer ?? null,
      });
      // Esgotar é o que muda entre rodadas; detalhe que falhou não apaga o status.
      if (extra)
        enrichEvent(eventId(ev.Name.trim(), date), { status: extra.status });
      stored++;
    }
    console.log(
      `[q2ingressos] ${stored} eventos de ${list.length} no catálogo`,
    );
  } catch (err) {
    console.warn(`[q2ingressos] falhou: ${err}`);
  }
  return stored;
}
