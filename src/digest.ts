import { norm, REGION_CITIES } from "./config/region.ts";
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
import { nowPlaying } from "./sources/cinema.ts";
import { syncDuoticket } from "./sources/duoticket.ts";
import { syncEventoon } from "./sources/eventoon.ts";
import { syncFrancaShopping } from "./sources/francashopping.ts";
import { syncIngresso } from "./sources/ingresso.ts";
import { fetchOgImage } from "./sources/ogimage.ts";
import { syncSesc } from "./sources/sesc.ts";
import { getDailySpot } from "./sources/spots.ts";
import { syncSympla } from "./sources/sympla.ts";
import { syncTurismo } from "./sources/turismo.ts";
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

function eventLines(ev: Event): string {
  const lines = [`🎟️ *${ev.title}*`];
  let where = [ev.venue, ev.city].filter(Boolean).join(", ");
  if (ev.venue) {
    const query = encodeURIComponent(`${ev.venue}, Franca, SP`);
    where = `[${ev.venue}](https://www.google.com/maps/search/?api=1&query=${query})${ev.city ? `, ${ev.city}` : ""}`;
  }
  if (where) lines.push(`📍 ${where}`);
  lines.push(`📆 ${humanDay(ev.date)}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.price) lines.push(`💰 ${ev.price}`);
  if (ev.trailer) lines.push(`▶️ [Ver trailer](${ev.trailer})`);
  if (ev.link) lines.push(`🔗 ${ev.link}`);
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
  ]);
  pruneEventsBefore(today);
  // Foco exclusivo em Franca e microregião imediata.
  pruneDisallowedCities(REGION_CITIES.map(norm));
  pruneOnlineEvents();

  // Eventos de HOJE — um post por evento, com foto quando houver.
  const todays = eventsOn(today).filter((ev) => !ev.posted_today);
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
      return `• *${m.title}*${tag ? ` — ${tag}` : ""}\n  ${bits.join(" · ")}`;
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
      const rows = evs.map((ev) => {
        const bits = [ev.time, ev.venue, ev.price].filter(Boolean).join(" · ");
        const title = ev.link ? `[${ev.title}](${ev.link})` : `*${ev.title}*`;
        return `• ${title}${bits ? `\n  ${bits}` : ""}`;
      });
      return `📆 *${humanDay(date)}*\n${rows.join("\n")}`;
    });
    await sendTelegram(
      `${topic.emoji} *Agenda — próximos 7 dias em Franca-SP*\n\n${blocks.join("\n\n")}`,
    );
    console.log(`[digest] agenda com ${week.length} evento(s)`);
  }

  if (!todays.length && !week.length)
    console.log("[digest] nenhum evento com data no período");
}
