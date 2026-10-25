import { expect, test } from "bun:test";
import { eventsOn } from "../src/db.ts";
import { syncSesc } from "../src/sources/sesc.ts";
import { json, stubFetch } from "./fetch.ts";

// A API manda "" quando não há próxima sessão. "" não é ausência para o ??:
// a primeira sessão continua válida e não pode ser descartada.
test("próxima sessão vazia cai na primeira sessão", async () => {
  stubFetch(async () =>
    json({
      atividade: [
        {
          titulo: "Peça Sem Próxima",
          dataProxSessao: "",
          dataPrimeiraSessao: "2026-11-07T20:00:00",
        },
      ],
    }),
  );
  await syncSesc("2026-10-11");
  expect(eventsOn("2026-11-07").map((e) => e.title)).toContain(
    "Peça Sem Próxima",
  );
});
