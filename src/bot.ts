import { env } from "./config/env.ts";
import { norm } from "./config/region.ts";
import { topic } from "./config/topic.ts";
import {
  type ChatPreferences,
  type Event,
  eventsBetween,
  eventsOn,
  getChatPreferences,
  setChatPreferences,
} from "./db.ts";
import {
  agendaTitle,
  eventButtons,
  eventLines,
  humanDay,
  mdSafe,
} from "./digest.ts";
import { categorize } from "./web/classify.ts";

const TZ = "America/Sao_Paulo";

const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export interface ParsedCommand {
  command: string;
  args: string[];
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.slice(1).split(/\s+/);
  const rawCmd = parts[0] || "";
  // /cmd@botname -> cmd
  const command = rawCmd.split("@")[0].toLowerCase();
  const args = parts.slice(1);
  return { command, args };
}

export function filterEventForChat(ev: Event, prefs: ChatPreferences): boolean {
  if (prefs.silenced_cities.length && ev.city) {
    const cityN = norm(ev.city);
    if (prefs.silenced_cities.some((c) => norm(c) === cityN)) return false;
  }
  if (prefs.filter_categories.length) {
    const cat = categorize(ev.title, ev.venue);
    if (!prefs.filter_categories.includes(cat)) return false;
  }
  return true;
}

export interface BotResponse {
  text: string;
  buttons?: { text: string; url: string }[][];
}

export function handleCommand(
  cmd: ParsedCommand,
  chatId: string,
  nowIso = isoDay(new Date()),
): BotResponse[] {
  const prefs = getChatPreferences(chatId);

  switch (cmd.command) {
    case "start":
    case "ajuda":
    case "help": {
      const msg = [
        "👋 *Comandos do Rolê Radar*",
        "",
        "/hoje — Lista os rolês confirmados de hoje",
        "/semana — Agenda dos próximos 7 dias",
        "/categoria show|teatro|cinema|comedia|infantil|esporte|festa|gastronomia|cultura|outros|todas — Filtra por categoria",
        "/silenciar <cidade> — Alterna o silenciamento de uma cidade",
        "",
        `📍 Cidades silenciadas: ${prefs.silenced_cities.length ? prefs.silenced_cities.join(", ") : "nenhuma"}`,
        `🎭 Categorias filtradas: ${prefs.filter_categories.length ? prefs.filter_categories.join(", ") : "todas"}`,
      ].join("\n");
      return [{ text: msg }];
    }

    case "hoje": {
      const allToday = eventsOn(nowIso);
      const filtered = allToday.filter((ev) => filterEventForChat(ev, prefs));
      if (!filtered.length) {
        return [
          {
            text: `🎈 *Nenhum evento encontrado para hoje* (${humanDay(nowIso)})${prefs.silenced_cities.length || prefs.filter_categories.length ? " com seus filtros ativos." : "."}`,
          },
        ];
      }
      return filtered.map((ev) => ({
        text: `⚡ *ROLÊ DE HOJE*\n\n${eventLines(ev, nowIso)}`,
        buttons: eventButtons(ev),
      }));
    }

    case "semana": {
      const from = addDays(nowIso, 1);
      const to = addDays(nowIso, 7);
      const allWeek = eventsBetween(from, to);
      const filtered = allWeek.filter((ev) => filterEventForChat(ev, prefs));
      if (!filtered.length) {
        return [
          {
            text: `📆 *Nenhum evento nos próximos 7 dias*${prefs.silenced_cities.length || prefs.filter_categories.length ? " com seus filtros ativos." : "."}`,
          },
        ];
      }
      const byDay = new Map<string, Event[]>();
      for (const ev of filtered) {
        const dia = ev.date < from ? from : ev.date;
        byDay.set(dia, [...(byDay.get(dia) ?? []), ev]);
      }
      const blocks = [...byDay.entries()].map(([date, evs]) => {
        const rows = evs.map((ev) => {
          const where = [ev.venue, ev.city].filter(Boolean).join(", ");
          const bits = [ev.time, where, ev.price]
            .filter(Boolean)
            .map((s) => mdSafe(String(s)))
            .join(" · ");
          const title = agendaTitle(ev);
          return `• ${title}${bits ? `\n  ${bits}` : ""}`;
        });
        return `📆 *${humanDay(date)}*\n${rows.join("\n")}`;
      });
      return [
        {
          text: `${topic.emoji} *Agenda — próximos 7 dias*\n\n${blocks.join("\n\n")}`,
        },
      ];
    }

    case "categoria": {
      const catArg = cmd.args[0]?.toLowerCase().trim();
      if (!catArg || catArg === "todas" || catArg === "limpar") {
        prefs.filter_categories = [];
        setChatPreferences(prefs);
        return [
          {
            text: "✅ Filtro de categorias limpo! Você receberá eventos de todas as categorias.",
          },
        ];
      }
      const validCats = [
        "cinema",
        "show",
        "teatro",
        "comedia",
        "infantil",
        "esporte",
        "festa",
        "gastronomia",
        "cultura",
        "outros",
      ];
      const requested = cmd.args
        .map((a) => a.toLowerCase().trim())
        .filter((a) => validCats.includes(a));
      if (!requested.length) {
        return [
          {
            text: `⚠️ Categoria inválida. Opções: ${validCats.join(", ")} ou 'todas'`,
          },
        ];
      }
      prefs.filter_categories = requested;
      setChatPreferences(prefs);
      return [
        {
          text: `✅ Filtro atualizado! Apenas eventos das categorias: *${requested.join(", ")}* serão exibidos.`,
        },
      ];
    }

    case "silenciar": {
      const cidade = cmd.args.join(" ").trim();
      if (!cidade) {
        return [
          {
            text: "⚠️ Informe a cidade a ser silenciada/reativada. Exemplo: `/silenciar Ribeirão Preto`",
          },
        ];
      }
      const cityN = norm(cidade);
      const idx = prefs.silenced_cities.findIndex((c) => norm(c) === cityN);
      if (idx >= 0) {
        const removida = prefs.silenced_cities.splice(idx, 1)[0];
        setChatPreferences(prefs);
        return [
          {
            text: `🔔 Cidade *${mdSafe(removida)}* reativada! Seus eventos voltarão a aparecer.`,
          },
        ];
      }
      prefs.silenced_cities.push(cidade);
      setChatPreferences(prefs);
      return [
        {
          text: `🔕 Cidade *${mdSafe(cidade)}* silenciada! Eventos de lá não serão exibidos.`,
        },
      ];
    }

    default:
      return [
        {
          text: "Comando não reconhecido. Digite /ajuda para ver os comandos disponíveis.",
        },
      ];
  }
}

/**
 * Executa uma rodada de polling getUpdates.
 * Retorna o maior update_id processado (+ 1) para o offset seguinte.
 */
export async function pollTelegramUpdates(offset = 0): Promise<number> {
  if (!env.telegramToken) return offset;
  let nextOffset = offset;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.telegramToken}/getUpdates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offset,
          timeout: 10,
          allowed_updates: ["message"],
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) return offset;
    const body = (await res.json()) as {
      ok: boolean;
      result?: Array<{
        update_id: number;
        message?: {
          chat?: { id: number | string };
          text?: string;
        };
      }>;
    };
    if (!body.ok || !Array.isArray(body.result)) return offset;

    for (const update of body.result) {
      nextOffset = Math.max(nextOffset, update.update_id + 1);
      const msg = update.message;
      if (!msg?.chat?.id || !msg.text) continue;
      const chatId = String(msg.chat.id);
      // Chat não listado em telegramChatIds é ignorado
      if (!env.telegramChatIds.includes(chatId)) {
        continue;
      }
      const cmd = parseCommand(msg.text);
      if (!cmd) continue;
      const responses = handleCommand(cmd, chatId);
      for (const r of responses) {
        await fetch(
          `https://api.telegram.org/bot${env.telegramToken}/sendMessage`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: r.text,
              parse_mode: "Markdown",
              disable_web_page_preview: true,
              ...(r.buttons?.length
                ? { reply_markup: { inline_keyboard: r.buttons } }
                : {}),
            }),
            signal: AbortSignal.timeout(10000),
          },
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn(`[telegram-bot] erro no polling getUpdates: ${err}`);
  }
  return nextOffset;
}

let botPollingActive = false;

/**
 * Inicia loop de long polling em segundo plano (usado no modo --loop).
 */
export async function startBotPolling(): Promise<void> {
  if (botPollingActive || !env.telegramToken) return;
  botPollingActive = true;
  let offset = 0;
  console.log("[telegram-bot] long polling iniciado");
  while (botPollingActive) {
    try {
      offset = await pollTelegramUpdates(offset);
    } catch {
      await Bun.sleep(5000);
    }
  }
}

export function stopBotPolling(): void {
  botPollingActive = false;
}
