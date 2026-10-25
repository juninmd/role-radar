import { cityRank, norm, REGION_CITIES } from "./config/region.ts";
import { topic } from "./config/topic.ts";
import {
  blockSent,
  type Event,
  eventsBetween,
  eventsOn,
  markBlockSent,
  markEventsLaunched,
  markEventsPosted,
  pruneDigestRunsBefore,
  pruneDisallowedCities,
  pruneEventsBefore,
  pruneOnlineEvents,
  unannouncedFutureEvents,
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
import { fetchOgImages } from "./sources/ogimage.ts";
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
  type TelegramButton,
} from "./telegram.ts";
import { safeUrl, spotPlaces } from "./web/catalog.ts";
import { geocodePlaces } from "./web/geocode.ts";
import { saveSnapshot } from "./web/store.ts";

const TZ = "America/Sao_Paulo";

const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const humanDay = (iso: string) =>
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
export const mdSafe = (s: string) => s.replace(/([_*[\]`])/g, "\\$1");

/** Dentro de `(url)` só `(`, `)` e espaço fecham o link antes da hora; URL que não é http(s) não entra. */
const mdUrl = (u: string | null): string | null =>
  safeUrl(u)?.replace(
    /[()\s]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  ) ?? null;

/** Linha de estreia, trailer e ingressos de um filme; links de API externa passam por mdUrl. */
/** Tag do cartaz ("Ação_Ficção · 14 · 2h"): escapada, senão o Telegram recusa a mensagem. */
export const movieTag = (m: {
  genre?: string | null;
  rating?: string | null;
  duration?: string | null;
}) =>
  [m.genre, m.rating, m.duration]
    .filter(Boolean)
    .map((s) => mdSafe(String(s)))
    .join(" · ");

/** Título com link: URL que não passa em mdUrl vira só o título, sem link quebrado. */
export const agendaTitle = (ev: { title: string; link?: string | null }) => {
  const url = mdUrl(ev.link ?? null);
  return url ? `[${mdSafe(ev.title)}](${url})` : `*${mdSafe(ev.title)}*`;
};

export function movieBits(
  m: { premiere: string | null; trailer: string | null; link: string },
  today: string,
): string {
  const trailer = mdUrl(m.trailer);
  const link = mdUrl(m.link);
  return [
    m.premiere
      ? `${m.premiere > today ? "🗓️ estreia" : "🗓️ estreou"} ${humanDay(m.premiere)}`
      : null,
    trailer ? `▶️ [trailer](${trailer})` : null,
    link ? `🎟️ [ingressos](${link})` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function eventButtons(ev: Event): TelegramButton[][] {
  const row: TelegramButton[] = [];
  if (ev.link && /^https?:\/\//i.test(ev.link)) {
    row.push({ text: "🎟️ Ingressos e Detalhes", url: ev.link });
  }
  if (ev.venue) {
    const query = encodeURIComponent(`${ev.venue}, ${ev.city ?? "Franca"}, SP`);
    row.push({
      text: "📍 Como Chegar",
      url: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
  }
  const rows: TelegramButton[][] = [];
  if (row.length) rows.push(row);
  if (ev.trailer && /^https?:\/\//i.test(ev.trailer)) {
    rows.push([{ text: "▶️ Ver Trailer", url: ev.trailer }]);
  }
  return rows;
}

export function eventLines(ev: Event): string {
  const lines = [`🎟️ *${mdSafe(ev.title)}*`];
  const cidade = ev.city ? `, ${mdSafe(ev.city)}` : "";
  const where = ev.venue
    ? `${mdSafe(ev.venue)}${cidade}`
    : ev.city
      ? mdSafe(ev.city)
      : "";
  if (where) lines.push(`📍 ${where}`);
  const dias = ev.end_date
    ? `${humanDay(ev.date)} a ${humanDay(ev.end_date)}`
    : humanDay(ev.date);
  lines.push(`📆 ${dias}${ev.time ? ` às ${ev.time}` : ""}`);
  if (ev.price) lines.push(`💰 ${mdSafe(ev.price)}`);

  if (ev.description) {
    // Corte por ponto de código: slice() partia emoji e deixava surrogate solto.
    const chars = Array.from(ev.description.trim());
    const descClean = mdSafe(chars.slice(0, 280).join(""));
    lines.push(`\n> 💡 ${descClean}${chars.length > 280 ? "..." : ""}`);
  }

  // Se não houver botões interativos (ex.: link inválido ou inexistente), mantém link no texto
  const hasInteractiveButtons =
    Boolean(ev.link && /^https?:\/\//i.test(ev.link)) ||
    Boolean(ev.venue) ||
    Boolean(ev.trailer && /^https?:\/\//i.test(ev.trailer));

  if (!hasInteractiveButtons) {
    if (ev.trailer) lines.push(`▶️ [Ver trailer](${ev.trailer})`);
    if (ev.link) lines.push(`🔗 [Ingressos e detalhes](${ev.link})`);
  }
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

  // Eventos futuros recém-lançados: avisados imediatamente para não perder shows e lotes.
  const novos = unannouncedFutureEvents(today, 20);
  const novosFranca = novos.filter((ev) => cityRank(ev.city) === 0);
  const novosFora = novos.filter((ev) => cityRank(ev.city) !== 0);

  // og:image em lote limitado; o envio é que precisa ser serial (Telegram).
  const capa = await fetchOgImages([...todays, ...novos]);

  // Só o que o Telegram confirmou vira "postado", e na hora: o resto tenta de
  // novo numa próxima rodada do dia.
  let posted = 0;
  const postaDia = async (lista: Event[], selo: string) => {
    for (const ev of lista) {
      const body = `${selo}\n\n${eventLines(ev)}`;
      const image = capa.get(ev.id);
      const buttons = eventButtons(ev);
      const ok = image
        ? await sendTelegramPhoto(body, image, buttons)
        : await sendTelegram(body, buttons);
      if (!ok) continue;
      markEventsPosted([ev.id]);
      posted++;
    }
  };

  const postaLancamento = async (lista: Event[], selo: string) => {
    for (const ev of lista) {
      const body = `${selo}\n\n${eventLines(ev)}`;
      const image = capa.get(ev.id);
      const buttons = eventButtons(ev);
      const ok = image
        ? await sendTelegramPhoto(body, image, buttons)
        : await sendTelegram(body, buttons);
      if (!ok) continue;
      markEventsLaunched([ev.id]);
    }
  };

  await postaDia(todaysFranca, "⚡ *É HOJE EM FRANCA!*");
  if (todaysFranca.length)
    console.log(`[digest] ${todaysFranca.length} evento(s) de hoje em Franca`);

  await postaLancamento(novosFranca, "🚀 *NOVO ROLÊ EM FRANCA!*");
  if (novosFranca.length)
    console.log(
      `[digest] ${novosFranca.length} novo(s) evento(s) anunciado(s) em Franca`,
    );

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
      const tag = movieTag(m);
      return `• *${mdSafe(m.title)}*${tag ? ` — ${tag}` : ""}\n  ${movieBits(m, today)}`;
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
  const spotBody = `✨ *Dica de Passeio em Franca!* ✨\n\n*${spot.name}*\n${spot.description}`;
  const spotButtons: TelegramButton[][] = [
    [{ text: `📍 Ver ${spot.venue} no Maps`, url: spot.mapsUrl }],
  ];
  await oncePerDay(today, "spot", () =>
    spot.image
      ? sendTelegramPhoto(spotBody, spot.image, spotButtons)
      : sendTelegram(spotBody, spotButtons),
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
        const title = agendaTitle(ev);
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
  if (todaysFora.length || weekFora.length || novosFora.length) {
    const cabecalho = () =>
      sendTelegram(
        "🗺️ *Fora de Franca — região e Ribeirão Preto*\n\nO que rola nas cidades vizinhas se você topar pegar a estrada.",
      );
    // Evento de fora reenviado sem o cabeçalho pareceria rolê de Franca.
    // Cabeçalho que não saiu deixa os eventos pendentes para a próxima rodada.
    let cabecalhoOk = true;
    if (todaysFora.length || novosFora.length) {
      cabecalhoOk = await cabecalho();
      if (cabecalhoOk) markBlockSent(today, "fora:cabecalho");
    } else await oncePerDay(today, "fora:cabecalho", cabecalho);
    if (cabecalhoOk) {
      await postaDia(todaysFora, "⚡ *É HOJE (fora de Franca)*");
      await postaLancamento(novosFora, "🚀 *NOVO ROLÊ NA REGIÃO!*");
      if (novosFora.length)
        console.log(
          `[digest] ${novosFora.length} novo(s) evento(s) anunciado(s) na região`,
        );
    }
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
    `[digest] hoje: ${todaysFranca.length} em Franca + ${todaysFora.length} fora | novos: ${novosFranca.length} + ${novosFora.length} | semana: ${weekFranca.length} + ${weekFora.length}`,
  );
}
