import { cityRank, norm, REGION_CITIES } from "./config/region.ts";
import { topic } from "./config/topic.ts";
import {
  blockSent,
  type Event,
  eventsBetween,
  eventsOn,
  markBlockSent,
  markEventsPosted,
  pruneDigestRunsBefore,
  pruneDisallowedCities,
  pruneEventsBefore,
  pruneOnlineEvents,
} from "./db.ts";
import { extractEvents } from "./extract.ts";
import { syncArticket } from "./sources/articket.ts";
import { syncBasquete } from "./sources/basquete.ts";
import { syncBilheteriaDigital } from "./sources/bilheteriadigital.ts";
import { syncBilheteriaExpress } from "./sources/bilheteriaexpress.ts";
import { syncBlueticket } from "./sources/blueticket.ts";
import { nowPlaying } from "./sources/cinema.ts";
import { syncDuoticket } from "./sources/duoticket.ts";
import { syncEventoon } from "./sources/eventoon.ts";
import { syncFrancaShopping } from "./sources/francashopping.ts";
import { syncGuicheWeb } from "./sources/guicheweb.ts";
import { syncIngresso } from "./sources/ingresso.ts";
import { syncIngressoDigital } from "./sources/ingressodigital.ts";
import { syncIngressoNacional } from "./sources/ingressonacional.ts";
import { syncMegabilheteria } from "./sources/megabilheteria.ts";
import { syncMinhaEntrada } from "./sources/minhaentrada.ts";
import { syncMultiplanHall } from "./sources/multiplanhall.ts";
import { fetchOgImage } from "./sources/ogimage.ts";
import { syncOticket } from "./sources/oticket.ts";
import { syncQ2Ingressos } from "./sources/q2ingressos.ts";
import { syncSesc } from "./sources/sesc.ts";
import { getDailySpot } from "./sources/spots.ts";
import { syncSympla } from "./sources/sympla.ts";
import { syncTheatroPedro2 } from "./sources/theatropedro2.ts";
import { syncTicket360 } from "./sources/ticket360.ts";
import { syncTicketFacil } from "./sources/ticketfacil.ts";
import { syncTurismo } from "./sources/turismo.ts";
import { syncUhuu } from "./sources/uhuu.ts";
import { syncZigTickets } from "./sources/zigtickets.ts";
import {
  sendTelegram,
  sendTelegramAlbum,
  sendTelegramPhoto,
} from "./telegram.ts";
import { spotPlaces } from "./web/catalog.ts";
import { geocodePlaces } from "./web/geocode.ts";
import { saveSnapshot } from "./web/store.ts";

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
  const dias = ev.end_date
    ? `${humanDay(ev.date)} a ${humanDay(ev.end_date)}`
    : humanDay(ev.date);
  lines.push(`📆 ${dias}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.price) lines.push(`💰 ${mdSafe(ev.price)}`);
  if (ev.trailer) lines.push(`▶️ [Ver trailer](${ev.trailer})`);
  if (ev.link) lines.push(`🔗 [Ingressos e detalhes](${ev.link})`);
  return lines.join("\n");
}

/** Envia um bloco no máximo uma vez por dia; só registra se `send` entregar. */
async function oncePerDay(
  today: string,
  block: string,
  send: () => Promise<boolean>,
): Promise<void> {
  if (blockSent(today, block)) return;
  if (await send()) markBlockSent(today, block);
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
    syncIngressoNacional(today),
    syncMultiplanHall(today),
    syncTheatroPedro2(today),
    syncMinhaEntrada(today),
    syncQ2Ingressos(today),
    syncGuicheWeb(today),
    syncZigTickets(today),
    syncArticket(today),
  ]);
  pruneEventsBefore(today);
  pruneDigestRunsBefore(today);
  // Foco exclusivo em Franca e microregião imediata.
  pruneDisallowedCities(REGION_CITIES.map(norm));
  pruneOnlineEvents();

  // O digest sai em dois blocos: tudo de Franca primeiro, depois as outras
  // cidades. Misturar fazia rolê de Ribeirão parecer coisa daqui.
  const todays = eventsOn(today).filter((ev) => !ev.posted_today);
  const todaysFranca = todays.filter((ev) => cityRank(ev.city) === 0);
  const todaysFora = todays.filter((ev) => cityRank(ev.city) !== 0);

  // og:image de todos de uma vez; o envio é que precisa ser serial (Telegram).
  const capa = new Map(
    await Promise.all(
      todays.map(
        async (ev) =>
          [
            ev.id,
            ev.image ??
              (ev.link ? await fetchOgImage(ev.link).catch(() => null) : null),
          ] as const,
      ),
    ),
  );

  // Só o que o Telegram confirmou vira "postado", e na hora: o resto tenta de
  // novo numa próxima rodada do dia.
  let posted = 0;
  const postaDia = async (lista: Event[], selo: string) => {
    for (const ev of lista) {
      const body = `${selo}\n\n${eventLines(ev)}`;
      const image = capa.get(ev.id);
      const ok = image
        ? await sendTelegramPhoto(body, image)
        : await sendTelegram(body);
      if (!ok) continue;
      markEventsPosted([ev.id]);
      posted++;
    }
  };

  await postaDia(todaysFranca, "⚡ *É HOJE EM FRANCA!*");
  if (todaysFranca.length)
    console.log(`[digest] ${todaysFranca.length} evento(s) de hoje em Franca`);

  // Filmes em cartaz HOJE — um post por cidade.
  const cinema = await nowPlaying();
  // Dashboard web lê daqui — não bate na Ingresso.com a cada visita.
  if (cinema.length) saveSnapshot("cinema", cinema);
  for (const day of cinema) {
    const header = `🎬 *Em cartaz hoje — ${day.cinema}*`;
    const posters = day.movies
      .map((m) => m.poster)
      .filter((p): p is string => Boolean(p));
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
    await oncePerDay(today, `cinema:${day.cinema}`, async () => {
      // Legenda de álbum é cortada em ~1000 chars: os pôsteres levam só o
      // título e a ficha completa (estreia, trailer) vai na mensagem seguinte.
      const album = await sendTelegramAlbum(header, posters);
      const ficha = await sendTelegram(`${header}\n\n${lines.join("\n\n")}`);
      return album && ficha;
    });
  }

  // Dica de Passeio Permanente em Franca - SP (Surpresa diária com imagem e localização)
  const spot = getDailySpot(today);
  const spotBody = `✨ *Dica de Passeio em Franca!* ✨\n\n*${spot.name}*\n${spot.description}\n\n📍 [${spot.venue}](${spot.mapsUrl})`;
  await oncePerDay(today, "spot", () =>
    spot.image
      ? sendTelegramPhoto(spotBody, spot.image)
      : sendTelegram(spotBody),
  );

  // Agenda dos próximos 7 dias — um post agrupado por dia, também separada.
  const week = eventsBetween(addDays(today, 1), addDays(today, 7));
  const agenda = async (
    lista: Event[],
    titulo: string,
    comCidade: boolean,
  ): Promise<boolean> => {
    if (!lista.length) return true;
    const byDay = new Map<string, Event[]>();
    for (const ev of lista) {
      // Festival já em andamento aparece no 1º dia da agenda, não no passado.
      const inicio = addDays(today, 1);
      const dia = ev.date < inicio ? inicio : ev.date;
      byDay.set(dia, [...(byDay.get(dia) ?? []), ev]);
    }
    const blocks = [...byDay.entries()].map(([date, evs]) => {
      const rows = evs.map((ev) => {
        const where = comCidade
          ? [ev.venue, ev.city].filter(Boolean).join(", ")
          : ev.venue;
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
    return sendTelegram(`${titulo}\n\n${blocks.join("\n\n")}`);
  };

  const weekFranca = week.filter((ev) => cityRank(ev.city) === 0);
  const weekFora = week.filter((ev) => cityRank(ev.city) !== 0);
  await oncePerDay(today, "agenda:franca", () =>
    agenda(
      weekFranca,
      `${topic.emoji} *Agenda — próximos 7 dias em Franca*`,
      false,
    ),
  );

  // ---- daqui pra baixo, só o que NÃO é de Franca ----
  if (todaysFora.length || weekFora.length) {
    const cabecalho = () =>
      sendTelegram(
        "🗺️ *Fora de Franca — região e Ribeirão Preto*\n\nO que rola nas cidades vizinhas se você topar pegar a estrada.",
      );
    // Evento de fora reenviado sem o cabeçalho pareceria rolê de Franca.
    if (todaysFora.length) {
      if (await cabecalho()) markBlockSent(today, "fora:cabecalho");
    } else await oncePerDay(today, "fora:cabecalho", cabecalho);
    await postaDia(todaysFora, "⚡ *É HOJE (fora de Franca)*");
    await oncePerDay(today, "agenda:fora", () =>
      agenda(
        weekFora,
        `${topic.emoji} *Agenda — próximos 7 dias na região*`,
        true,
      ),
    );
  }

  // Por último: são ~1s por local (limite do Nominatim) e o Telegram não espera.
  const places = eventsBetween(today, "9999-12-31")
    .filter((ev) => ev.venue)
    .map((ev) => ({ venue: ev.venue as string, city: ev.city }));
  const cinemas = cinema.map((d) => ({ venue: d.cinema, city: d.city }));
  await geocodePlaces([...places, ...cinemas, ...spotPlaces()]);

  if (posted < todays.length)
    console.warn(
      `[digest] ${todays.length - posted} evento(s) de hoje não entregue(s) — ficam para a próxima rodada`,
    );
  console.log(
    `[digest] hoje: ${todaysFranca.length} em Franca + ${todaysFora.length} fora | semana: ${weekFranca.length} + ${weekFora.length}`,
  );
}
