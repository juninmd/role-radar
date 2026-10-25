import { expect, test } from "bun:test";
import { fetchOgImage } from "../src/sources/ogimage.ts";
import { stubFetch } from "./fetch.ts";

// A página do evento vem de terceiros: og:image não pode seguir redirect
// para a rede interna do host nem ler corpo sem limite.
test("redirect para rede interna não é seguido", async () => {
  const metadata = "http://169.254.169.254/latest/meta-data";
  // Simula o fetch nativo: com redirect "follow" ele segue o Location sozinho.
  const hits: string[] = [];
  stubFetch(async function net(url, init): Promise<Response> {
    hits.push(url);
    const res =
      url === "https://evento.test/show"
        ? new Response("", { status: 302, headers: { location: metadata } })
        : new Response("segredo-interno");
    const next = res.headers.get("location");
    if (init?.redirect === "follow" && next) return net(next, init);
    return res;
  });
  expect(await fetchOgImage("https://evento.test/show")).toBeNull();
  expect(hits).toEqual(["https://evento.test/show"]);
});

test("lê og:image de página pública", async () => {
  stubFetch(
    async () =>
      new Response(
        '<meta property="og:image" content="https://cdn.test/capa.jpg">',
      ),
  );
  expect(await fetchOgImage("https://evento.test/show")).toBe(
    "https://cdn.test/capa.jpg",
  );
});

test("corpo grande é lido só até o limite", async () => {
  const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      // 2 MB no total; sem limite, tudo isso entra na memória do CronJob.
      if (pulled >= 32) return controller.close();
      pulled++;
      controller.enqueue(chunk);
    },
  });
  stubFetch(async () => new Response(body));
  expect(await fetchOgImage("https://evento.test/show")).toBeNull();
  expect(pulled).toBeLessThan(8);
});
