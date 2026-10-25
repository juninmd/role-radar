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
