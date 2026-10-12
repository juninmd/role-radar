import { beforeEach, expect, test } from "bun:test";
import { db, eventsOn } from "../src/db.ts";
import { syncGuicheWeb } from "../src/sources/guicheweb.ts";
import { json, stubFetch } from "./fetch.ts";

const TODAY = "2026-10-11";

const gwMockSertaozinho = {
  qtd_eventos: 2,
  item_eventos: [
    {
      id_evento: "123",
      nome: "Tardezinha Sertãozinho",
      img: "tardezinha.jpg",
      cidade: "SERTAOZINHO/SP",
      data: "17/10/2026",
      local: "Bosque",
      url_amigavel: "https://www.guicheweb.com.br/tardezinha_123",
    },
    {
      id_evento: "124",
      nome: "Show Passado",
      img: "passado.jpg",
      cidade: "SERTAOZINHO/SP",
      data: "01/10/2026",
      local: "Arena",
      url_amigavel: "https://www.guicheweb.com.br/show-passado_124",
    },
  ],
};

beforeEach(() => db.exec("DELETE FROM events;"));

test("syncGuicheWeb importa eventos futuros e formata cidade e imagem", async () => {
  stubFetch(async (url, init) => {
    if (url.includes("api.php") && init?.method === "POST") {
      const body = init.body as FormData;
      if (
        body.get("pesquisa") === "Sertãozinho" ||
        body.get("pesquisa") === "Sertaozinho"
      ) {
        return json(gwMockSertaozinho);
      }
      return json({ qtd_eventos: 0, item_eventos: [] });
    }
    return new Response("Not found", { status: 404 });
  });

  const count = await syncGuicheWeb(TODAY);
  expect(count).toBe(1);

  const evs = eventsOn("2026-10-17");
  expect(evs.length).toBe(1);
  expect(evs[0].title).toBe("Tardezinha Sertãozinho");
  expect(evs[0].city).toBe("Sertãozinho");
  expect(evs[0].venue).toBe("Bosque");
  expect(evs[0].link).toBe("https://www.guicheweb.com.br/tardezinha_123");
  expect(evs[0].image).toBe(
    "https://www.guicheweb.com.br/imagens/eventos/tardezinha.jpg",
  );
});
