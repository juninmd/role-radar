import { expect, test } from "bun:test";
import { semSobreposicao } from "../src/job-guard.ts";

// Rodada lenta não pode começar outra por cima: duas ingestões gravavam o mesmo lote.
test("disparo com a rodada anterior ainda em curso é pulado", async () => {
  let chamadas = 0;
  const liberar: (() => void)[] = [];
  const job = semSobreposicao(
    () =>
      new Promise<void>((ok) => {
        chamadas++;
        liberar.push(ok);
      }),
  );
  const primeira = job();
  await job();
  expect(chamadas).toBe(1);
  liberar[0]();
  await primeira;
  const segunda = job();
  expect(chamadas).toBe(2);
  liberar[1]();
  await segunda;
});
