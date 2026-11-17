import { expect, test } from "bun:test";
import { chat } from "../src/ai.ts";
import { env } from "../src/config/env.ts";
import { json, stubFetch } from "./fetch.ts";

// Resposta 200 sem "choices" (bloqueio, cota) não pode virar TypeError: "resposta
// vazia" segue o caminho de parse, que conta a tentativa do lote.
test("resposta sem choices volta vazia, não lança TypeError", async () => {
  stubFetch(async () => json({ error: { message: "blocked" } }));
  expect(await chat("sistema", "usuario")).toBe("");
});
