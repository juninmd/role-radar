import { isIP } from "node:net";

// O CronJob roda com hostNetwork (saída IPv6): link vindo de fora não pode
// apontar para o loopback do host, a rede do cluster ou a rede privada.
const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT / pods
];
// NAT64 (64:ff9b::) e 6to4 (2002::) embutem um IPv4 qualquer, inclusive 127.x.
// "::" cobre loopback (::1), não especificado e IPv4-compatível (::/96): nenhum é público.
const PRIVATE_V6 = /^(::|f[cd]|fe[89ab]|64:ff9b:|2002:)/i;
const INTERNAL_NAME = /(^|\.)(localhost|local|internal|cluster\.local|svc)$/i;

/** true só para http(s) em host público — nome de DNS ou IP fora das faixas privadas. */
export function isPublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  // "localhost." (FQDN com ponto final) resolve igual a "localhost".
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host.includes(".") && !isIP(host)) return false;
  if (INTERNAL_NAME.test(host)) return false;
  const v = isIP(host);
  if (v === 4) return !PRIVATE_V4.some((r) => r.test(host));
  if (v === 6) return !PRIVATE_V6.test(host);
  return true;
}

/** fetch que revalida cada salto de redirect com isPublicUrl (máx. 5). */
export async function fetchPublic(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    if (!isPublicUrl(current)) throw new Error(`URL não pública: ${current}`);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const next = res.headers.get("location");
    // redirect "manual" pedido pelo chamador: devolve o 3xx para ele decidir.
    if (init.redirect === "manual") return res;
    if (res.status < 300 || res.status >= 400 || !next) return res;
    current = new URL(next, current).toString();
  }
  throw new Error("redirects demais");
}

/** Lê no máximo `max` bytes do corpo: página de terceiro não entra inteira na memória. */
export async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}
