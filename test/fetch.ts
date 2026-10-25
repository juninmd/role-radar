import { isIP } from "node:net";

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Conexão fixada no IP validado (fetchPublic) chega com IP + Host: o handler
 * recebe o nome de volta, como antes. A URL real segue em quem chamou fetch.
 */
function logicalUrl(raw: string, init?: RequestInit): string {
  const u = new URL(raw);
  const host = new Headers(init?.headers).get("host");
  if (!host || !isIP(u.hostname.replace(/^\[|\]$/g, ""))) return raw;
  return `${u.protocol}//${host}${u.pathname}${u.search}`;
}

function replaceFetch(
  handler: Handler,
  toHandler: (raw: string, init?: RequestInit) => string,
): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input instanceof Request ? input.url : input);
    const url = toHandler(raw, init);
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

/**
 * Troca o fetch global por `handler` e registra as URLs chamadas. O preload
 * (test/setup.ts) restaura o original depois de cada teste.
 */
export function stubFetch(handler: Handler): string[] {
  return replaceFetch(handler, logicalUrl);
}

/** Igual a `stubFetch`, mas o handler recebe a URL crua (IP, quando fixada). */
export function stubFetchRaw(handler: Handler): string[] {
  return replaceFetch(handler, (raw) => raw);
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
