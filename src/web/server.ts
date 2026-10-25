import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { buildCatalog, type Catalog } from "./catalog.ts";

const TZ = "America/Sao_Paulo";
const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");
// O dado só muda com ingest/digest (outro processo); 60 s de defasagem é aceitável.
const CATALOG_TTL_MS = 60_000;

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  // Capas de evento vêm de dezenas de bilheterias; tiles do mapa, da CARTO.
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "content-security-policy": CSP,
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

/**
 * Mapa fixo "/js/app.js" → arquivo, montado uma vez no boot. A URL nunca
 * vira caminho de disco, então `..`/encoding não escapa de public/.
 */
function listPublic(dir: string, base = dir): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      for (const [k, v] of listPublic(full, base)) files.set(k, v);
    } else files.set(`/${relative(base, full).split(sep).join("/")}`, full);
  }
  return files;
}

export function createHandler(
  publicDir = PUBLIC_DIR,
  build: (day: string) => Catalog = buildCatalog,
) {
  const files = listPublic(publicDir);
  const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  let cache: {
    day: string;
    at: number;
    catalog: Catalog;
    body: string;
  } | null = null;
  const current = () => {
    const day = today();
    if (cache?.day === day && Date.now() - cache.at < CATALOG_TTL_MS)
      return cache;
    const catalog = build(day);
    cache = { day, at: Date.now(), catalog, body: JSON.stringify(catalog) };
    return cache;
  };

  return (req: Request): Response => {
    const { pathname } = new URL(req.url);
    if (req.method !== "GET" && req.method !== "HEAD")
      return new Response("método não permitido", { status: 405 });

    if (pathname === "/health") {
      return Response.json({
        ok: true,
        events: current().catalog.events.length,
      });
    }
    if (pathname === "/api/catalog") {
      return new Response(current().body, {
        headers: {
          ...SECURITY_HEADERS,
          "content-type": "application/json;charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }
    const file = files.get(pathname === "/" ? "/index.html" : pathname);
    if (!file) return new Response("não encontrado", { status: 404 });
    return new Response(Bun.file(file), {
      // no-cache: módulos ES de versões diferentes misturados quebram o app após deploy.
      headers: { ...SECURITY_HEADERS, "cache-control": "no-cache" },
    });
  };
}

export function serve(port: number) {
  const server = Bun.serve({ port, fetch: createHandler() });
  console.log(`[web] dashboard em http://localhost:${server.port}`);
  return server;
}
