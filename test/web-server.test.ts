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
const get = (path: string, method = "GET", headers: HeadersInit = {}) =>
  handle(new Request(`http://x.test${path}`, { method, headers }));

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

// A agenda é montada uma vez por snapshot: dentro do TTL, o arquivo é o mesmo
// (inclusive o DTSTAMP), em vez de refeito a cada download.
test("/agenda.ics dentro do TTL devolve o mesmo arquivo", async () => {
  const handler = createHandler(dir, (day) => {
    const ev = { id: "ev-1", title: "Show", date: day, time: "20:00" };
    return { today: day, events: [ev] } as unknown as Catalog;
  });
  const ics = async () =>
    (await handler(new Request("http://x.test/agenda.ics"))).text();
  const primeira = await ics();
  await Bun.sleep(1100);
  expect(await ics()).toBe(primeira);
});

test("só leitura: POST é 405", () => {
  expect(get("/api/catalog", "POST").status).toBe(405);
});

// Catálogo e assets são texto repetitivo: ~74% menores em gzip, e o cliente
// só recebe a versão comprimida se pedir.
test("catálogo sai em gzip quando o cliente aceita, JSON puro caso contrário", async () => {
  const gz = get("/api/catalog", "GET", { "accept-encoding": "gzip" });
  expect(gz.headers.get("content-encoding")).toBe("gzip");
  expect(gz.headers.get("vary")).toBe("accept-encoding");
  const bytes = new Uint8Array(await gz.arrayBuffer());
  const cat = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bytes)));
  expect(Array.isArray(cat.events)).toBe(true);
  expect(get("/api/catalog").headers.get("content-encoding")).toBeNull();
});

// q=0 é recusa explícita (RFC 9110): não pode ganhar gzip só por citar a palavra.
test("gzip recusado com q=0 não é enviado", () => {
  const res = get("/api/catalog", "GET", {
    "accept-encoding": "gzip;q=0, identity",
  });
  expect(res.headers.get("content-encoding")).toBeNull();
});

test("asset estático também sai em gzip, com o content-type da extensão", async () => {
  const res = get("/js/main.js", "GET", { "accept-encoding": "gzip, br" });
  expect(res.headers.get("content-encoding")).toBe("gzip");
  // Módulo ES com MIME errado não executa no navegador: o tipo tem de vir junto.
  expect(res.headers.get("content-type")).toContain("javascript");
  const raw = Bun.gunzipSync(new Uint8Array(await res.arrayBuffer()));
  expect(new TextDecoder().decode(raw)).toBe("export {}");
});
