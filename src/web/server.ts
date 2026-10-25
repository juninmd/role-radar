import { readdirSync, readFileSync, statSync } from "node:fs";
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
  // A tela nunca usa câmera, microfone nem localização.
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

// Aceita gzip se algum item da lista for "gzip" sem q=0 (recusa explícita).
const wantsGzip = (req: Request) =>
  (req.headers.get("accept-encoding") ?? "").split(",").some((item) => {
    const [coding, ...params] = item.trim().split(";");
    return (
      coding?.toLowerCase() === "gzip" &&
      !params.some((p) => /^\s*q\s*=\s*0(\.0*)?\s*$/.test(p))
    );
  });

/** Manda a variante gzip só quando o cliente pede; a comprimida já vem pronta. */
function send(
  req: Request,
  raw: Uint8Array<ArrayBuffer>,
  gz: Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
): Response {
  const h = { ...headers, vary: "accept-encoding" };
  if (!wantsGzip(req)) return new Response(raw, { headers: h });
  return new Response(gz, { headers: { ...h, "content-encoding": "gzip" } });
}

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
    raw: Uint8Array<ArrayBuffer>;
    gz: Uint8Array<ArrayBuffer>;
  } | null = null;
  const current = () => {
    const day = today();
    if (cache?.day === day && Date.now() - cache.at < CATALOG_TTL_MS)
      return cache;
    const catalog = build(day);
    const raw = new TextEncoder().encode(JSON.stringify(catalog));
    const gz = new Uint8Array(Bun.gzipSync(raw));
    cache = { day, at: Date.now(), catalog, raw, gz };
    return cache;
  };

  // Asset relido quando o mtime muda: dev vê edição sem reiniciar o servidor.
  const assets = new Map<
    string,
    {
      mtime: number;
      type: string;
      raw: Uint8Array<ArrayBuffer>;
      gz: Uint8Array<ArrayBuffer>;
    }
  >();
  const asset = (path: string) => {
    const mtime = statSync(path).mtimeMs;
    const hit = assets.get(path);
    if (hit?.mtime === mtime) return hit;
    const raw = new Uint8Array(readFileSync(path));
    const entry = {
      mtime,
      type: Bun.file(path).type,
      raw,
      gz: new Uint8Array(Bun.gzipSync(raw)),
    };
    assets.set(path, entry);
    return entry;
  };

  const route = (req: Request): Response => {
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
      const { raw, gz } = current();
      return send(req, raw, gz, {
        ...SECURITY_HEADERS,
        "content-type": "application/json;charset=utf-8",
        "cache-control": "public, max-age=300",
      });
    }
    const file = files.get(pathname === "/" ? "/index.html" : pathname);
    if (!file) return new Response("não encontrado", { status: 404 });
    const { type, raw, gz } = asset(file);
    // no-cache: módulos ES de versões diferentes misturados quebram o app após deploy.
    return send(req, raw, gz, {
      ...SECURITY_HEADERS,
      "content-type": type,
      "cache-control": "no-cache",
    });
  };

  // Toda resposta sai com os cabeçalhos de segurança, inclusive health e 404.
  return (req: Request): Response => {
    const res = route(req);
    for (const [nome, valor] of Object.entries(SECURITY_HEADERS))
      if (!res.headers.has(nome)) res.headers.set(nome, valor);
    return res;
  };
}

export function serve(port: number) {
  const server = Bun.serve({ port, fetch: createHandler() });
  console.log(`[web] dashboard em http://localhost:${server.port}`);
  return server;
}
