import { cityRank, norm, REGION_CITIES } from "./config/region.ts";
import { topic } from "./config/topic.ts";
import {
  type Event,
  eventsBetween,
  eventsOn,
  markEventsPosted,
  pruneDisallowedCities,
  pruneEventsBefore,
  pruneOnlineEvents,
} from "./db.ts";
import { extractEvents } from "./extract.ts";
import { syncBasquete } from "./sources/basquete.ts";
import { syncBilheteriaDigital } from "./sources/bilheteriadigital.ts";
import { syncBilheteriaExpress } from "./sources/bilheteriaexpress.ts";
import { syncBlueticket } from "./sources/blueticket.ts";
import { nowPlaying } from "./sources/cinema.ts";
import { syncDuoticket } from "./sources/duoticket.ts";
import { syncEventoon } from "./sources/eventoon.ts";
import { syncFrancaShopping } from "./sources/francashopping.ts";
import { syncIngresso } from "./sources/ingresso.ts";
import { syncIngressoDigital } from "./sources/ingressodigital.ts";
import { syncMegabilheteria } from "./sources/megabilheteria.ts";
import { fetchOgImage } from "./sources/ogimage.ts";
import { syncOticket } from "./sources/oticket.ts";
import { syncSesc } from "./sources/sesc.ts";
import { getDailySpot } from "./sources/spots.ts";
import { syncSympla } from "./sources/sympla.ts";
import { syncTicket360 } from "./sources/ticket360.ts";
import { syncTicketFacil } from "./sources/ticketfacil.ts";
import { syncTurismo } from "./sources/turismo.ts";
import { syncUhuu } from "./sources/uhuu.ts";
import {
  sendTelegram,
  sendTelegramAlbum,
  sendTelegramPhoto,
} from "./telegram.ts";

const TZ = "America/Sao_Paulo";

const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const humanDay = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });

/**
 * No Markdown legado do Telegram um `_` solto abre itálico e nunca fecha, e a
 * mensagem inteira volta como 400 — foi o que derrubou a foto dos eventos da
 * Prefeitura, cujo link tem "detalhe_evento". Texto vindo de fonte externa
 * precisa passar por aqui; URL vai sempre dentro de [rótulo](url).
 */
const mdSafe = (s: string) => s.replace(/([_*[\]`])/g, "\\$1");

function eventLines(ev: Event): string {
  const lines = [`🎟️ *${mdSafe(ev.title)}*`];
  const cidade = ev.city ? `, ${mdSafe(ev.city)}` : "";
  let where = [ev.venue, ev.city]
    .filter((s): s is string => Boolean(s))
    .map(mdSafe)
    .join(", ");
  if (ev.venue) {
    const query = encodeURIComponent(`${ev.venue}, ${ev.city ?? "Franca"}, SP`);
    where = `[${mdSafe(ev.venue)}](https://www.google.com/maps/search/?api=1&query=${query})${cidade}`;
  }
  if (where) lines.push(`📍 ${where}`);
  lines.push(`📆 ${humanDay(ev.date)}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.price) lines.push(`💰 ${mdSafe(ev.price)}`);
  if (ev.trailer) lines.push(`▶️ [Ver trailer](${ev.trailer})`);
  if (ev.link) lines.push(`🔗 [Ingressos e detalhes](${ev.link})`);
  return lines.join("\n");
}

/** Extract events from pending items, post today's events + 7-day agenda + sightseeing spots. */
export async function digest(): Promise<void> {
  const today = isoDay(new Date());
  await Promise.allSettled([
    extractEvents(today),
    syncSympla(today),
    syncIngresso(today),
    syncSesc(today),
    syncTurismo(today),
    syncDuoticket(today),
    syncEventoon(today),
    syncBasquete(today),
    syncFrancaShopping(today),
    syncMegabilheteria(today),
    syncOticket(today),
    syncBlueticket(today),
    syncIngressoDigital(today),
    syncUhuu(today),
    syncBilheteriaExpress(today),
    syncBilheteriaDigital(today),
    syncTicket360(today),
    syncTicketFacil(today),
  ]);
  pruneEventsBefore(today);
  // Foco exclusivo em Franca e microregião imediata.
  pruneDisallowedCities(REGION_CITIES.map(norm));
  pruneOnlineEvents();

  // Eventos de HOJE — um post por evento, com foto quando houver. Franca sai
  // primeiro; Ribeirão Preto, por último.
  const todays = eventsOn(today)
    .filter((ev) => !ev.posted_today)
    .sort((a, b) => cityRank(a.city) - cityRank(b.city));
  // og:image de todos de uma vez; o envio é que precisa ser serial (Telegram).
  const images = await Promise.all(
    todays.map(
      (ev) =>
        ev.image ?? (ev.link ? fetchOgImage(ev.link).catch(() => null) : null),
    ),
  );
  for (const [i, ev] of todays.entries()) {
    const image = images[i];
    const body = `⚡ *É HOJE!*\n\n${eventLines(ev)}`;
    if (image) await sendTelegramPhoto(body, image);
    else await sendTelegram(body);
  }
  markEventsPosted(todays.map((ev) => ev.id));
  if (todays.length) console.log(`[digest] ${todays.length} evento(s) de hoje`);

  // Filmes em cartaz HOJE — um post por cidade.
  const cinema = await nowPlaying();
  for (const day of cinema) {
    const header = `🎬 *Em cartaz hoje — ${day.cinema}*`;
    const posters = day.movies
      .map((m) => m.poster)
      .filter((p): p is string => Boolean(p));
    // Legenda de álbum é cortada em ~1000 chars: os pôsteres levam só o título
    // e a ficha completa (estreia, trailer) vai na mensagem seguinte.
    await sendTelegramAlbum(header, posters);

    const lines = day.movies.map((m) => {
      const tag = [m.genre, m.rating, m.duration].filter(Boolean).join(" · ");
      const bits = [
        m.premiere
          ? `${m.premiere > today ? "🗓️ estreia" : "🗓️ estreou"} ${humanDay(m.premiere)}`
          : null,
        m.trailer ? `▶️ [trailer](${m.trailer})` : null,
        `🎟️ [ingressos](${m.link})`,
      ].filter(Boolean);
      return `• *${mdSafe(m.title)}*${tag ? ` — ${tag}` : ""}\n  ${bits.join(" · ")}`;
    });
    await sendTelegram(`${header}\n\n${lines.join("\n\n")}`);
  }

  // Dica de Passeio Permanente em Franca - SP (Surpresa diária com imagem e localização)
  const spot = getDailySpot(today);
  const spotBody = `✨ *Dica de Passeio em Franca!* ✨\n\n*${spot.name}*\n${spot.description}\n\n📍 [${spot.venue}](${spot.mapsUrl})`;
  if (spot.image) {
    await sendTelegramPhoto(spotBody, spot.image);
  } else {
    await sendTelegram(spotBody);
  }

  // Agenda dos próximos 7 dias — um post agrupado por dia.
  const week = eventsBetween(addDays(today, 1), addDays(today, 7));
  if (week.length) {
    const byDay = new Map<string, Event[]>();
    for (const ev of week) {
      byDay.set(ev.date, [...(byDay.get(ev.date) ?? []), ev]);
    }
    const blocks = [...byDay.entries()].map(([date, evs]) => {
      const rows = [...evs]
        .sort((a, b) => cityRank(a.city) - cityRank(b.city))
        .map((ev) => {
          // Fora de Franca, a cidade precisa aparecer — senão parece rolê local.
          const where =
            cityRank(ev.city) === 0
              ? ev.venue
              : [ev.venue, ev.city].filter(Boolean).join(", ");
          const bits = [ev.time, where, ev.price]
            .filter(Boolean)
            .map((s) => mdSafe(String(s)))
            .join(" · ");
          const title = ev.link
            ? `[${mdSafe(ev.title)}](${ev.link})`
            : `*${mdSafe(ev.title)}*`;
          return `• ${title}${bits ? `\n  ${bits}` : ""}`;
        });
      return `📆 *${humanDay(date)}*\n${rows.join("\n")}`;
    });
    await sendTelegram(
      `${topic.emoji} *Agenda — próximos 7 dias em Franca e região*\n\n${blocks.join("\n\n")}`,
    );
    console.log(`[digest] agenda com ${week.length} evento(s)`);
  }

  if (!todays.length && !week.length)
    console.log("[digest] nenhum evento com data no período");
}
