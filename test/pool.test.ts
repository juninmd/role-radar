import { expect, test } from "bun:test";
import { pool } from "../src/pool.ts";

// Quando um item falha, quem chama não pode voltar com trabalho ainda rodando.
test("pool só rejeita depois que todos os itens terminaram", async () => {
  const feitos: number[] = [];
  let feitosNaRejeicao = -1;
  await pool([1, 2, 3, 4, 5], 2, async (x) => {
    await new Promise((r) => setTimeout(r, 20 * x));
    feitos.push(x);
    if (x === 1) throw new Error("boom");
    return x;
  }).catch(() => {
    feitosNaRejeicao = feitos.length;
  });
  expect(feitosNaRejeicao).toBe(5);
});

test("pool devolve os resultados na ordem da lista quando nada falha", async () => {
  expect(await pool([3, 1, 2], 2, async (x) => x * 10)).toEqual([30, 10, 20]);
});
