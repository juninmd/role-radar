import { expect, test } from "bun:test";

// PORT declarada e vazia (ex.: helm/k8s sem valor) não pode virar porta 0, que
// faz o SO escolher uma porta aleatória e quebra health check e docs.
test("PORT vazia usa a porta padrão, não a porta 0", async () => {
  process.env.PORT = "";
  try {
    const caminho: string = "../src/config/env.ts?port-vazia";
    const { env } = await import(caminho);
    expect(env.port).toBe(3000);
  } finally {
    delete process.env.PORT;
  }
});
