import { expect, test } from "bun:test";
import { eventsOn } from "../src/db.ts";
import { syncSesc } from "../src/sources/sesc.ts";
import { json, stubFetch } from "./fetch.ts";

// Link vindo com "@" colado na base montava "https://www.sescsp.org.br@host/…",
// cuja autoridade é o host de terceiros. O link precisa continuar no SESC.
test("link relativo estranho do SESC não sai do domínio do SESC", async () => {
  stubFetch(async () =>
    json({
      atividade: [
        {
          titulo: "Peça Link Estranho",
          link: "@evil.test/phish",
          dataPrimeiraSessao: "2026-11-08T20:00:00",
        },
      ],
    }),
  );
  await syncSesc("2026-10-11");
  const ev = eventsOn("2026-11-08").find(
    (e) => e.title === "Peça Link Estranho",
  );
  expect(ev).toBeDefined();
  expect(ev?.link ?? "").not.toContain("evil.test");
});
