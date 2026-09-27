type Handler = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Troca o fetch global por `handler` e registra as URLs chamadas. O preload
 * (test/setup.ts) restaura o original depois de cada teste.
 */
export function stubFetch(handler: Handler): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return calls;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
