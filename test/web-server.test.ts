import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler } from "../src/web/server.ts";

const dir = mkdtempSync(join(tmpdir(), "rr-public-"));
mkdirSync(join(dir, "js"));
writeFileSync(join(dir, "index.html"), "<h1>ok</h1>");
writeFileSync(join(dir, "js", "main.js"), "export {}");
const handle = createHandler(dir);
const get = (path: string, method = "GET") =>
  handle(new Request(`http://x.test${path}`, { method }));

test("serve index e assets com CSP", async () => {
  const res = get("/");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("<h1>ok</h1>");
  expect(res.headers.get("content-security-policy")).toContain(
    "default-src 'self'",
  );
  expect(get("/js/main.js").status).toBe(200);
});

test("caminho fora da lista (traversal, encoding) é 404, nunca lê disco", () => {
  for (const p of [
    "/../package.json",
    "/%2e%2e/package.json",
    "/js/../../.env",
    "/.env",
  ])
    expect(get(p).status).toBe(404);
});

test("catálogo e health respondem JSON", async () => {
  const cat = await get("/api/catalog").json();
  expect(Array.isArray(cat.events)).toBe(true);
  expect(cat.origin.lat).toBeLessThan(0);
  expect((await get("/health").json()).ok).toBe(true);
});

test("só leitura: POST é 405", () => {
  expect(get("/api/catalog", "POST").status).toBe(405);
});
