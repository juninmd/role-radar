import { expect, test } from "bun:test";
import { safeUrl } from "../src/web/catalog.ts";

// Feed que vem com espaço ao redor do link perdia o link inteiro em vez de só
// o espaço; o protocolo continua sendo a única coisa validada.
test("link com espaço nas bordas é aceito sem o espaço", () => {
  expect(safeUrl("  https://x.test/a  ")).toBe("https://x.test/a");
  expect(safeUrl("javascript:alert(1)")).toBeNull();
  expect(safeUrl("  javascript:alert(1)")).toBeNull();
  expect(safeUrl("   ")).toBeNull();
});
