// @ts-nocheck: o frontend é JS sem tipos e tsc não resolve esses imports.
import { expect, test } from "bun:test";
import { horaDeAtualizacao } from "../public/js/util.js";

// O cabeçalho diz "atualizado às": a hora é a de Franca, não a do aparelho de
// quem abre a página. 17:30 UTC é 14:30 em São Paulo (UTC-3, sem horário de verão).
test("hora de atualização sai no fuso de São Paulo, qualquer que seja o aparelho", () => {
  expect(horaDeAtualizacao("2026-10-25T17:30:00Z")).toBe("14:30");
});
