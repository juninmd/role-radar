import { topic } from "./config/topic.ts";
import {
  type Event,
  eventsBetween,
  eventsOn,
  markEventsPosted,
  pruneEventsBefore,
} from "./db.ts";
import { extractEvents } from "./extract.ts";
import { syncIngresso } from "./sources/ingresso.ts";
import { fetchOgImage } from "./sources/ogimage.ts";
import { syncSympla } from "./sources/sympla.ts";
import { sendTelegram, sendTelegramPhoto } from "./telegram.ts";

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
  const where = [ev.venue, ev.city].filter(Boolean).join(", ");
  if (where) lines.push(`📍 ${where}`);
  lines.push(`📆 ${humanDay(ev.date)}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.price) lines.push(`💰 ${ev.price}`);
  if (ev.link) lines.push(`🔗 ${ev.link}`);
  return lines.join("\n");
}

/** Extract events from pending items, post today's events + 7-day agenda. */
export async function digest(): Promise<void> {
  const today = isoDay(new Date());
  await Promise.allSettled([
    extractEvents(today),
    syncSympla(today),
    syncIngresso(today),
  ]);
  pruneEventsBefore(today);

  // Eventos de HOJE — um post por evento, com foto quando houver.
  const todays = eventsOn(today).filter((ev) => !ev.posted_today);
  for (const ev of todays) {
    const image = ev.image ?? (ev.link ? await fetchOgImage(ev.link) : null);
    const body = `⚡ *É HOJE!*\n\n${eventLines(ev)}`;
    if (image) await sendTelegramPhoto(body, image);
    else await sendTelegram(body);
  }
  markEventsPosted(todays.map((ev) => ev.id));
  if (todays.length) console.log(`[digest] ${todays.length} evento(s) de hoje`);

  // Agenda dos próximos 7 dias — um post agrupado por dia.
  const week = eventsBetween(addDays(today, 1), addDays(today, 7));
  if (week.length) {
    const byDay = new Map<string, Event[]>();
    for (const ev of week) {
      byDay.set(ev.date, [...(byDay.get(ev.date) ?? []), ev]);
    }
    const blocks = [...byDay.entries()].map(([date, evs]) => {
      const rows = evs.map((ev) => {
        const bits = [
          ev.time,
          [ev.venue, ev.city].filter(Boolean).join(", "),
          ev.price,
        ]
          .filter(Boolean)
          .join(" · ");
        const title = ev.link ? `[${ev.title}](${ev.link})` : `*${ev.title}*`;
        return `• ${title}${bits ? `\n  ${bits}` : ""}`;
      });
      return `📆 *${humanDay(date)}*\n${rows.join("\n")}`;
    });
    await sendTelegram(
      `${topic.emoji} *Agenda — próximos 7 dias*\n\n${blocks.join("\n\n")}`,
    );
    console.log(`[digest] agenda com ${week.length} evento(s)`);
  }

  if (!todays.length && !week.length)
    console.log("[digest] nenhum evento com data no período");
}
