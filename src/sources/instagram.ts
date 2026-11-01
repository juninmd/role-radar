import { env } from "../config/env.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";
import type { ExtraFeed, SocialItem } from "./social.ts";

// Instagram só se lê por API oficial: a Graph API (business_discovery) devolve
// os posts de OUTRAS contas profissionais (Business/Criador) usando o token de
// uma conta profissional sua. Raspar o site logado viola os termos e derruba a
// conta; senha nunca entra aqui. Sem IG_USER_ID + IG_ACCESS_TOKEN + IG_ACCOUNTS
// a fonte fica desligada. Formato da resposta NÃO validado ao vivo (sem token).
export const IG_PREFIX = "ig:";
const GRAPH = "https://graph.facebook.com/v21.0";
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const POSTS = 12;

/** Contas configuradas viram "feeds" `ig:<usuario>`; entrada inválida é ignorada com aviso. */
export function instagramFeeds(): ExtraFeed[] {
  if (!env.igUserId || !env.igToken) return [];
  const out: ExtraFeed[] = [];
  for (const raw of env.igAccounts.split(/[,;\s]+/)) {
    const user = raw.replace(/^@/, "").trim();
    if (!user) continue;
    if (!USERNAME.test(user)) {
      console.warn(`[instagram] IG_ACCOUNTS ignorado (inválido): ${raw}`);
      continue;
    }
    out.push({ name: `Instagram @${user}`, url: `${IG_PREFIX}${user}` });
  }
  return out;
}

interface Media {
  caption?: string;
  timestamp?: string;
  permalink?: string;
}

/** Posts recentes de uma conta profissional; o erro nunca carrega o token. */
export async function fetchInstagram(
  url: string,
): Promise<{ items: SocialItem[] }> {
  const user = url.slice(IG_PREFIX.length);
  if (!USERNAME.test(user)) throw new Error("usuário inválido");
  const fields = `business_discovery.username(${user}){media.limit(${POSTS}){caption,timestamp,permalink}}`;
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(env.igUserId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(env.igToken)}`,
    { signal: AbortSignal.timeout(env.feedTimeoutMs) },
  );
  const body = await readCapped(res, MAX_SOURCE_BODY);
  let data: {
    business_discovery?: { media?: { data?: Media[] } };
    error?: { message?: string };
  };
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`HTTP ${res.status} (resposta não é JSON)`);
  }
  if (!res.ok || data.error)
    throw new Error(`HTTP ${res.status}: ${data.error?.message ?? "erro"}`);

  const items: SocialItem[] = [];
  for (const m of data.business_discovery?.media?.data ?? []) {
    const caption = m.caption?.trim();
    if (!m.permalink || !caption) continue;
    items.push({
      title: [...caption.split("\n")[0]].slice(0, 140).join(""),
      link: m.permalink,
      contentSnippet: caption,
      isoDate: m.timestamp ?? null,
    });
  }
  return { items };
}
