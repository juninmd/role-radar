import { expect, test } from "bun:test";
import { fetchPublic, setHostResolver } from "../src/sources/public-url.ts";

// Checar o DNS e depois deixar o fetch resolver de novo abre janela para DNS
// rebinding: a 2ª consulta pode devolver 10.x. A conexão tem que ir ao IP
// que foi validado, com Host e SNI do nome original.
test("conexão vai ao IP validado, não a um novo lookup do nome", async () => {
  setHostResolver(async () => ["93.184.216.34"]);
  let raw = "";
  let host = null as string | null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    raw = String(input);
    host = new Headers(init?.headers).get("host");
    return new Response("ok");
  }) as typeof fetch;
  await fetchPublic("https://evento.test/a", {});
  expect(raw).toBe("https://93.184.216.34/a");
  expect(host).toBe("evento.test");
});

// Host com dois registros A: se o primeiro não conecta, o segundo tem que ser
// tentado, como o fetch faria sem a fixação. Resposta HTTP não gera nova tentativa.
test("sem conexão no primeiro IP validado, tenta o próximo", async () => {
  setHostResolver(async () => ["93.184.216.34", "93.184.216.35"]);
  const tried: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const raw = String(input);
    tried.push(raw);
    if (raw.includes("216.34")) throw new TypeError("ECONNREFUSED");
    return new Response("ok");
  }) as typeof fetch;
  const res = await fetchPublic("https://evento.test/a", {});
  expect(await res.text()).toBe("ok");
  expect(tried).toEqual(["https://93.184.216.34/a", "https://93.184.216.35/a"]);
});
