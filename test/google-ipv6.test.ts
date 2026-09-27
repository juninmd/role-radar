import { afterEach, expect, spyOn, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { resolveLink } from "../src/sources/article.ts";
import { stubFetch } from "./fetch.ts";

// O Google dá 429 ao IPv4 do cluster; com GOOGLE_IPV6=1 a conexão vai
// direto no AAAA, com Host/SNI do hostname, e cai no normal sem rota IPv6.
const LINK = "https://news.google.com/rss/articles/CBMiV6";
const V6 = "2001:db8::1";
const REAL = "https://portal.test/materia";

const google = (url: string) => {
  if (url.includes("/articles/"))
    return new Response('<div data-n-a-sg="S" data-n-a-ts="1"></div>');
  const inner = JSON.stringify(["garturlres", REAL, 1]);
  return new Response(
    `)]}'\n\n${JSON.stringify([["wrb.fr", "Fbv4je", inner]])}`,
  );
};

afterEach(() => {
  env.googleIpv6 = false;
});

test("GOOGLE_IPV6=1 conecta no IPv6 com Host e SNI do Google", async () => {
  env.googleIpv6 = true;
  const lookup = spyOn(Bun.dns, "lookup").mockResolvedValue([
    { address: V6, family: 6, ttl: 0 },
  ]);
  const seen: { url: string; host?: string; sni?: string }[] = [];
  stubFetch(async (url, init) => {
    const i = init as RequestInit & { tls?: { serverName?: string } };
    seen.push({
      url,
      host: (i.headers as Record<string, string>)?.host,
      sni: i.tls?.serverName,
    });
    return google(url);
  });
  expect(await resolveLink(LINK)).toBe(REAL);
  lookup.mockRestore();
  expect(seen).toHaveLength(2);
  for (const s of seen) {
    expect(s.url.startsWith(`https://[${V6}]/`)).toBe(true);
    expect(s.host).toBe("news.google.com");
    expect(s.sni).toBe("news.google.com");
  }
  // Já pede com os parâmetros do redirect: nenhum salto volta pelo hostname.
  expect(seen[0].url).toContain("?hl=en-US&gl=US&ceid=US:en");
});

test("sem rota IPv6 cai no hostname normal", async () => {
  env.googleIpv6 = true;
  const lookup = spyOn(Bun.dns, "lookup").mockResolvedValue([
    { address: V6, family: 6, ttl: 0 },
  ]);
  stubFetch(async (url) => {
    if (url.includes(`[${V6}]`)) throw new TypeError("network unreachable");
    return google(url);
  });
  expect(await resolveLink(LINK)).toBe(REAL);
  lookup.mockRestore();
});

test("desligado (padrão) nem consulta o DNS", async () => {
  const lookup = spyOn(Bun.dns, "lookup");
  stubFetch(async (url) => google(url));
  expect(await resolveLink(LINK)).toBe(REAL);
  expect(lookup).not.toHaveBeenCalled();
  lookup.mockRestore();
});
