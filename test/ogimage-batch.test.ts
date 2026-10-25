import { expect, test } from "bun:test";
import { fetchOgImages } from "../src/sources/ogimage.ts";
import { stubFetch } from "./fetch.ts";

// Um dia com muitos eventos não pode abrir uma conexão por evento de uma vez:
// são sites de terceiros e o digest espera todos antes de postar.
test("og:image em lote respeita o limite de conexões simultâneas", async () => {
  let inFlight = 0;
  let peak = 0;
  stubFetch(async () => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return new Response(
      '<meta property="og:image" content="https://i.test/a.jpg">',
    );
  });
  const events = Array.from({ length: 30 }, (_, i) => ({
    id: `e${i}`,
    image: null,
    link: `https://evento.test/${i}`,
  }));
  const capas = await fetchOgImages(events, 4);
  expect(peak).toBeLessThanOrEqual(4);
  expect(capas.get("e0")).toBe("https://i.test/a.jpg");
});

test("evento que já tem imagem não gera busca", async () => {
  const calls = stubFetch(async () => new Response(""));
  const capas = await fetchOgImages(
    [
      {
        id: "x",
        image: "https://img.test/x.jpg",
        link: "https://evento.test/x",
      },
    ],
    4,
  );
  expect(calls).toHaveLength(0);
  expect(capas.get("x")).toBe("https://img.test/x.jpg");
});
