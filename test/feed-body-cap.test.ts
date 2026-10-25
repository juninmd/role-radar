import { expect, test } from "bun:test";
import { ingest } from "../src/ingest.ts";
import { geocodePlaces } from "../src/web/geocode.ts";
import { stubFetch } from "./fetch.ts";

const CHUNKS = 128; // 8 MB em pedaços de 64 KB
const MAX_REQUESTS = 60; // cobre os feeds do tópico e corta qualquer laço

/** Responde com um corpo de 8 MB e devolve quantos pedaços foram lidos por resposta. */
function hugeBodies(): number[] {
  const pulls: number[] = [];
  const pad = new Uint8Array(64 * 1024).fill(0x20);
  stubFetch(async () => {
    if (pulls.length >= MAX_REQUESTS) return new Response("", { status: 404 });
    let sent = 0;
    const n = pulls.push(0) - 1;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (sent++ >= CHUNKS) return ctrl.close();
        pulls[n]++;
        ctrl.enqueue(pad);
      },
    });
    return new Response(body);
  });
  return pulls;
}

test("feed RSS gigante não é lido até o fim", async () => {
  const pulls = hugeBodies();
  await ingest();
  expect(pulls.length).toBeGreaterThan(0);
  for (const p of pulls) expect(p).toBeLessThan(CHUNKS);
});

test("resposta gigante do geocoder não é lida até o fim", async () => {
  const pulls = hugeBodies();
  await geocodePlaces(
    [{ venue: "Teatro Gigante", city: "Franca" }],
    1,
    async () => {},
  );
  expect(pulls.length).toBe(1);
  expect(pulls[0]).toBeLessThan(CHUNKS);
});
