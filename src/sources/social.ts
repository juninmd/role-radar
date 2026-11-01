// Redes sociais com acesso público e sem login. Instagram, Facebook e X exigem
// sessão (reverificado em 2026-10-31); o que funciona hoje é Bluesky (RSS),
// YouTube (RSS) e canais públicos do Telegram (t.me/s). Como a região quase
// não usa essas redes, nenhum perfil vem de fábrica: o operador lista os seus
// em EXTRA_FEEDS e o texto dos posts passa pela mesma extração por IA.
//
// EXTRA_FEEDS="Casa X=bsky:casax.bsky.social;Sesc=yt:UCxxxxxxxx;Bar=tg:agendabar"
// Qualquer URL http(s) de RSS/Atom também vale (inclusive de um RSS-Bridge
// próprio apontando para Instagram/Facebook/X).

export interface ExtraFeed {
  name: string;
  url: string;
}

const HANDLE = /^[a-z0-9][a-z0-9.-]{0,252}$/i;
const YT_ID = /^UC[\w-]{20,24}$/;
const TG_CHANNEL = /^[a-z][\w]{3,31}$/i;
export const TELEGRAM_PREFIX = "https://t.me/s/";

/** "bsky:x.bsky.social" → URL do RSS; devolve null se o alvo for inválido. */
function resolveTarget(target: string): string | null {
  const [kind, ...rest] = target.split(":");
  const value = rest.join(":").trim();
  if (kind === "bsky" && HANDLE.test(value))
    return `https://bsky.app/profile/${value}/rss`;
  if (kind === "yt" && YT_ID.test(value))
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${value}`;
  if (kind === "tg" && TG_CHANNEL.test(value))
    return `${TELEGRAM_PREFIX}${value}`;
  if (kind === "http" || kind === "https") {
    try {
      const u = new URL(target);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Lê o valor de EXTRA_FEEDS; entrada inválida é ignorada com aviso, não derruba a rodada. */
export function parseExtraFeeds(raw: string): ExtraFeed[] {
  const out: ExtraFeed[] = [];
  for (const entry of raw.split(/[;\n]/)) {
    const spec = entry.trim();
    if (!spec) continue;
    // "nome=alvo"; sem nome, o próprio alvo serve (cuidado: URL tem "=" na query).
    const m = spec.match(/^([^=:/]+)=(.+)$/);
    const target = (m ? m[2] : spec).trim();
    const url = resolveTarget(target);
    if (!url) {
      console.warn(`[social] EXTRA_FEEDS ignorado (inválido): ${spec}`);
      continue;
    }
    out.push({ name: m ? m[1].trim() : target, url });
  }
  return out;
}

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const texto = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] !== "#") return ENTIDADES[e.toLowerCase()] ?? m;
      const cp =
        e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1);
      return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

export interface SocialItem {
  title: string;
  link: string;
  contentSnippet: string;
  isoDate: string | null;
  // Campos do rss-parser que o ingest lê; o Telegram não os tem.
  content?: string;
  pubDate?: string;
}

/** Posts de `t.me/s/<canal>` (HTML server-side): texto, link do post e data. */
export function parseTelegramChannel(html: string): SocialItem[] {
  const out: SocialItem[] = [];
  const blocos =
    /<div class="tgme_widget_message_wrap[\s\S]*?(?=<div class="tgme_widget_message_wrap|$)/g;
  for (const m of html.matchAll(blocos)) {
    const bloco = m[0];
    const link = bloco.match(
      /class="tgme_widget_message_date"[^>]*href="(https:\/\/t\.me\/[^"]+)"/,
    )?.[1];
    const corpo = bloco.match(
      /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    )?.[1];
    if (!link || !corpo) continue;
    const t = texto(corpo);
    if (!t) continue;
    out.push({
      title: [...t.split("\n")[0]].slice(0, 140).join(""),
      link,
      contentSnippet: t,
      isoDate: bloco.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null,
    });
  }
  return out;
}
