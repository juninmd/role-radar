import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Catalog } from "../src/web/catalog.ts";
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

// Montar o catálogo custa ~17 ms por request; dentro da janela de TTL ele é reaproveitado.
test("catálogo e health reaproveitam uma só montagem dentro do TTL", async () => {
  let builds = 0;
  const handler = createHandler(dir, (day) => {
    builds++;
    return { today: day, events: [] } as unknown as Catalog;
  });
  const req = (path: string) => handler(new Request(`http://x.test${path}`));
  expect((await req("/api/catalog").json()).today).toBeString();
  await req("/api/catalog");
  expect(await req("/health").json()).toEqual({ ok: true, events: 0 });
  expect(builds).toBe(1);
});

test("/agenda.ics devolve a agenda como iCalendar para download", async () => {
  const handler = createHandler(dir, (day) => {
    const ev = { id: "ev-1", title: "Show", date: day, time: "20:00" };
    return { today: day, events: [ev] } as unknown as Catalog;
  });
  const res = await handler(new Request("http://x.test/agenda.ics"));
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/calendar");
  expect(await res.text()).toContain("BEGIN:VEVENT");
});

test("só leitura: POST é 405", () => {
  expect(get("/api/catalog", "POST").status).toBe(405);
});
