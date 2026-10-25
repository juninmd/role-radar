import { expect, test } from "bun:test";
import type { Event } from "../src/db.ts";
import { eventLines } from "../src/digest.ts";

const evento = (description: string): Event =>
  ({
    id: "ev-1",
    title: "Show",
    date: "2026-11-07",
    time: "20:00",
    venue: null,
    city: "Franca",
    price: null,
    link: null,
    image: null,
    description,
    trailer: null,
    end_date: null,
  }) as Event;

// O corte da descrição é por unidade UTF-16: um emoji que cai na divisa de 280
// sairia com metade do par, e a mensagem inteira viraria texto inválido.
test("descrição longa não termina com surrogate solto", () => {
  const texto = `${"a".repeat(279)}🎉 resto da descrição`;
  const linhas = eventLines(evento(texto));
  const soSurrogate =
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  expect(soSurrogate.test(linhas)).toBe(false);
  expect(linhas).toContain("...");
});

test("descrição curta sai inteira e sem reticências", () => {
  const linhas = eventLines(evento("Tá bom 🎉"));
  expect(linhas).toContain("Tá bom 🎉");
  expect(linhas).not.toContain("...");
});
