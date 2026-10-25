import { expect, test } from "bun:test";
import { runMigrations } from "../src/db.ts";

// Só coluna já existente é esperada. Qualquer outra falha (tabela errada, banco
// travado) tem que aparecer aqui, não sumir e quebrar consultas depois.
test("migração de coluna que já existe é ignorada", () => {
  expect(() =>
    runMigrations(["ALTER TABLE items ADD COLUMN image TEXT"]),
  ).not.toThrow();
});

test("migração que falha por outro motivo é propagada", () => {
  expect(() =>
    runMigrations(["ALTER TABLE tabela_que_nao_existe ADD COLUMN x TEXT"]),
  ).toThrow(/no such table/);
});
