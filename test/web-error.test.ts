import { expect, test } from "bun:test";
import { serve } from "../src/web/server.ts";

// Erro não tratado não pode sair para o cliente com mensagem, caminho ou stack.
test("erro não tratado responde 500 genérico, sem mensagem nem caminho", async () => {
  const server = serve(0, () => {
    throw new Error("segredo em D:/dados/store.db");
  });
  try {
    const res = await fetch(`http://localhost:${server.port}/api/catalog`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain("segredo");
    expect(body).not.toContain("store.db");
  } finally {
    server.stop(true);
  }
});
