import { env } from "../config/env.ts";
import { db, type Item } from "../db.ts";
import { pool } from "../pool.ts";
import { fetchPublic } from "./public-url.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const MAX_BODY = 2000;
// Parágrafo menor que isto é menu, legenda ou botão — não corpo de matéria.
const MIN_PARAGRAPH = 60;

const get = (url: string, init: RequestInit = {}) =>
  fetchPublic(url, {
    ...init,
    headers: { "user-agent": UA, ...init.headers },
    signal: AbortSignal.timeout(12000),
  });

/** Google respondeu 429 ("sorry"): insistir só prolonga o bloqueio do IP. */
export class GoogleBlocked extends Error {}

const isGoogleNews = (link: string) =>
  new URL(link).hostname === "news.google.com";

/**
 * O Google dá 429 ao IPv4 do cluster e 200 ao IPv6 do host (CronJob com
 * hostNetwork). O fetch do Bun sorteia a família mesmo com ipv6first, então
 * com GOOGLE_IPV6=1 conecta direto no AAAA; sem rota IPv6, cai no normal.
 */
async function googleGet(url: string, init: RequestInit = {}) {
  if (env.googleIpv6) {
    const u = new URL(url);
    try {
      const [aaaa] = await Bun.dns.lookup(u.hostname, { family: 6 });
      if (!aaaa) throw new Error("sem AAAA");
      return await get(url.replace(u.host, `[${aaaa.address}]`), {
        ...init,
        headers: { ...init.headers, host: u.hostname },
        tls: { serverName: u.hostname },
      } as RequestInit);
    } catch (err) {
      // Sem rota IPv6 (pod sem hostNetwork): segue pelo normal, mas avisa —
      // senão o 429 do IPv4 volta sem ninguém ver o porquê.
      if (!v6Warned) console.warn(`[article] Google via IPv6 falhou: ${err}`);
      v6Warned = true;
    }
  }
  return get(url, init);
}
let v6Warned = false;

/**
 * O RSS do Google News só entrega um redirect opaco (news.google.com/rss/
 * articles/CBMi...). A URL real sai do endpoint batchexecute, assinado com
 * data-n-a-sg/ts da página do artigo. Qualquer outro link volta igual.
 */
export async function resolveLink(link: string): Promise<string> {
  if (!isGoogleNews(link)) return link;
  const id = new URL(link).pathname.split("/").pop() ?? "";
  // Já com os parâmetros do redirect: nenhum salto volta pelo hostname.
  const res0 = await googleGet(
    `https://news.google.com/articles/${id}?hl=en-US&gl=US&ceid=US:en`,
    { redirect: "manual" },
  );
  // O bloqueio chega como 429 ou como 302 para google.com/sorry.
  if (res0.status === 429 || res0.headers.get("location")?.includes("/sorry/"))
    throw new GoogleBlocked(`Google News bloqueou (HTTP ${res0.status})`);
  const page = await res0.text();
  const sg = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
  if (!sg || !ts) throw new Error("assinatura do Google News ausente");
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  const res = await googleGet(
    "https://news.google.com/_/DotsSplashUi/data/batchexecute",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: `f.req=${encodeURIComponent(JSON.stringify([[["Fbv4je", inner]]]))}`,
    },
  );
  const line =
    (await res.text()).split("\n").find((l) => l.includes("garturlres")) ?? "";
  const real = JSON.parse(JSON.parse(line)[0][2])[1];
  if (typeof real !== "string" || !/^https?:\/\//.test(real))
    throw new Error("Google News não devolveu URL");
  return real;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** articleBody do JSON-LD (NewsArticle), onde o portal publica o texto limpo. */
function ldArticleBody(raw: string): string | null {
  try {
    const walk = (n: unknown): string | null => {
      if (!n || typeof n !== "object") return null;
      if (Array.isArray(n)) return n.map(walk).find(Boolean) ?? null;
      const o = n as Record<string, unknown>;
      if (typeof o.articleBody === "string" && o.articleBody.trim())
        return o.articleBody;
      return walk(o["@graph"]);
    };
    return walk(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Texto da matéria sem menu/rodapé: JSON-LD articleBody se houver; senão os
 * parágrafos de <article> (ou de toda a página, se o portal não usa a tag),
 * só os longos o bastante para serem corpo.
 */
export async function articleText(html: string): Promise<string> {
  const ld: string[] = [];
  const inArticle: string[] = [];
  const anywhere: string[] = [];
  let og = "";
  let buf = "";
  let depth = 0;
  await new HTMLRewriter()
    .on('script[type="application/ld+json"]', {
      text(t) {
        buf += t.text;
        if (t.lastInTextNode) {
          ld.push(buf);
          buf = "";
        }
      },
    })
    .on('meta[property="og:description"]', {
      element(e) {
        og = e.getAttribute("content") ?? "";
      },
    })
    .on("article", {
      element(e) {
        depth++;
        e.onEndTag(() => {
          depth--;
        });
      },
    })
    .on("p", {
      element() {
        anywhere.push("");
        if (depth) inArticle.push("");
      },
      text(t) {
        anywhere[anywhere.length - 1] += t.text;
        if (depth) inArticle[inArticle.length - 1] += t.text;
      },
    })
    .transform(new Response(html))
    .text();

  const body = ld.map(ldArticleBody).find(Boolean);
  const paras = (inArticle.length ? inArticle : anywhere)
    .map(squash)
    .filter((p) => p.length >= MIN_PARAGRAPH);
  const text = squash(body ?? paras.join(" ")) || squash(og);
  return text.slice(0, MAX_BODY);
}

const saveArticle = db.prepare<unknown, [string, string, string]>(
  "UPDATE items SET link = ?, body = ? WHERE id = ?",
);

/**
 * Busca a matéria real dos itens candidatos (no máximo `max` por rodada) e
 * grava link resolvido + corpo. Falha num item não derruba os outros: ele só
 * segue com título/resumo, como antes. `unread` = ids que nem foram tentados
 * (além do teto `max` ou Google bloqueado) — vale tentar na próxima rodada.
 */
export async function enrichItems(
  items: Item[],
  max = env.articleMax,
): Promise<{ read: number; unread: Set<string> }> {
  const pending = items.filter((it) => !it.body);
  const todo = pending.slice(0, max);
  const skipped = new Set(pending.slice(max).map((it) => it.id));
  let blocked = false;
  const done = await pool(todo, 3, async (it) => {
    // Após o 1º 429 o resto do Google fica só com título; os outros portais seguem.
    if (blocked && isGoogleNews(it.link)) {
      skipped.add(it.id);
      return 0;
    }
    try {
      const url = await resolveLink(it.link);
      const res = await get(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await articleText(await res.text());
      if (!body) return 0;
      saveArticle.run(url, body, it.id);
      it.link = url;
      it.body = body;
      return 1;
    } catch (err) {
      if (err instanceof GoogleBlocked) {
        if (!blocked)
          console.warn(`[article] ${err.message} — pulando o resto`);
        blocked = true;
        skipped.add(it.id);
        return 0;
      }
      console.warn(`[article] ${it.title.slice(0, 60)}: ${err}`);
      return 0;
    }
  });
  const n = done.reduce<number>((a, b) => a + b, 0);
  if (todo.length)
    console.log(`[article] ${n}/${todo.length} matéria(s) lida(s)`);
  return { read: n, unread: skipped };
}
