import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { eventoLd, syncFever } from "../src/sources/fever.ts";
import { stubFetch } from "./fetch.ts";

const TODAY = "2026-10-31";

const ld = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;

const pagina = (ev: Record<string, unknown>) =>
  `<html>${ld({ "@type": "FAQPage" })}${ld({ "@type": "Product", name: "x" })}${ld({ "@type": "Event", ...ev })}</html>`;

const evento = (name: string, startDate: string, extra = {}) => ({
  name,
  startDate,
  url: "https://feverup.com/m/1/en",
  image: "https://img/x.jpg",
  location: {
    name: "Teatro Minaz",
    address: { addressLocality: "Ribeirão Preto" },
  },
  offers: [{ price: 90 }, { price: 59.5 }, { price: 0 }],
  ...extra,
});

beforeEach(() => db.exec("DELETE FROM events;"));

test("eventoLd ignora Product/FAQPage e bloco quebrado", () => {
  const html = `<script type="application/ld+json">{quebrado</script>${pagina(evento("A", "2026-12-04T21:00:00-03:00"))}`;
  expect(eventoLd(html)?.name).toBe("A");
  expect(eventoLd("<html></html>")).toBeNull();
});

test("syncFever lê a lista, abre cada evento e grava hora local e menor preço", async () => {
  const calls = stubFetch(async (url) => {
    if (url.includes("/en/ribeirao-preto/candlelight"))
      return new Response(
        `<a href="https://feverup.com/m/1/en"></a><a href="https://feverup.com/m/2/en"></a>`,
      );
    if (url.includes("/en/ribeirao-preto/music-events"))
      return new Response(`<a href="https://feverup.com/m/2/en"></a>`);
    if (url.endsWith("/m/1/en"))
      return new Response(
        pagina(evento("Candlelight: Queen", "2026-11-21T18:00:00-03:00")),
      );
    if (url.endsWith("/m/2/en"))
      return new Response(
        pagina(evento("Show Passado", "2026-10-01T18:00:00-03:00")),
      );
    return new Response("nope", { status: 404 });
  });

  expect(await syncFever(TODAY)).toBe(1);
  const [ev] = eventsOn("2026-11-21");
  expect(ev).toMatchObject({
    title: "Candlelight: Queen",
    time: "18:00",
    venue: "Teatro Minaz",
    city: "Ribeirão Preto",
    price: "R$ 59,50",
  });
  // id repetido nas duas listas é aberto uma vez só
  expect(calls.filter((u) => u.endsWith("/m/2/en"))).toHaveLength(1);
});

test("página de evento fora do ar não derruba os demais", async () => {
  stubFetch(async (url) => {
    if (url.includes("/en/ribeirao-preto/"))
      return new Response(
        `<a href="https://feverup.com/m/1/en"></a><a href="https://feverup.com/m/3/en"></a>`,
      );
    if (url.endsWith("/m/1/en")) return new Response("erro", { status: 500 });
    return new Response(
      pagina(evento("Candlelight: Zimmer", "2027-01-30T18:00:00-03:00")),
    );
  });
  expect(await syncFever(TODAY)).toBe(1);
});

test("uma lista fora do ar não perde a outra; offers como objeto único vale", async () => {
  stubFetch(async (url) => {
    if (url.includes("/candlelight"))
      return new Response("erro", { status: 503 });
    if (url.includes("/music-events"))
      return new Response(`<a href="https://feverup.com/m/9/en"></a>`);
    return new Response(
      pagina(
        evento("Show Único", "2026-11-21T20:00:00-03:00", {
          offers: { price: 80 },
        }),
      ),
    );
  });
  expect(await syncFever(TODAY)).toBe(1);
  expect(eventsOn("2026-11-21")[0].price).toBe("R$ 80,00");
});

test("fuso diferente de -03:00 é ignorado em vez de gravar o dia errado", async () => {
  stubFetch(async (url) =>
    url.includes("/en/ribeirao-preto/")
      ? new Response(`<a href="https://feverup.com/m/1/en"></a>`)
      : new Response(pagina(evento("UTC", "2026-11-21T01:00:00Z"))),
  );
  expect(await syncFever(TODAY)).toBe(0);
});

test("lista fora do ar não grava nada e não lança", async () => {
  stubFetch(async () => new Response("erro", { status: 503 }));
  expect(await syncFever(TODAY)).toBe(0);
});
