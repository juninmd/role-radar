import { lookup } from "node:dns/promises";
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

// Teto de leitura das respostas de fonte; a maior página medida tem ~1,1 MB.
export const MAX_SOURCE_BODY = 5_000_000;

export type HostResolver = (host: string) => Promise<string[]>;

const lookupAll: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

let resolveHost: HostResolver = lookupAll;

/** Só teste: o preload troca o DNS por um stub, para nenhum teste sair na rede. */
export function setHostResolver(fn: HostResolver): void {
  resolveHost = fn;
}

/** true se o IP literal não cai em faixa privada; nome de DNS passa aqui sem checagem. */
export function isPublicIp(host: string): boolean {
  const v = isIP(host);
  if (v === 4) return !PRIVATE_V4.some((r) => r.test(host));
  if (v === 6) return !PRIVATE_V6.test(host);
  return true;
}

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
  return isPublicIp(host);
}

/**
 * Nome que resolve para qualquer IP privado é bloqueado antes de conectar:
 * sem isso, um domínio público apontado para 10.x passa pela checagem de string.
 */
async function assertResolvesPublic(url: string): Promise<void> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return;
  const ips = await resolveHost(host);
  if (!ips.length || ips.some((ip) => !isPublicIp(ip)))
    throw new Error(`URL não pública: ${url}`);
}

/** fetch que revalida cada salto de redirect (nome e IP resolvido) (máx. 5). */
export async function fetchPublic(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    if (!isPublicUrl(current)) throw new Error(`URL não pública: ${current}`);
    await assertResolvesPublic(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    const next = res.headers.get("location");
    // redirect "manual" pedido pelo chamador: devolve o 3xx para ele decidir.
    if (init.redirect === "manual") return res;
    if (res.status < 300 || res.status >= 400 || !next) return res;
    current = new URL(next, current).toString();
  }
  throw new Error("redirects demais");
}

/** Lê no máximo `max` bytes do corpo: resposta de terceiro não entra inteira na memória. */
export async function readBytesCapped(
  res: Response,
  max: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body) return new Uint8Array();
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
  return new Uint8Array(Buffer.concat(chunks).subarray(0, max));
}

export async function readCapped(res: Response, max: number): Promise<string> {
  return new TextDecoder().decode(await readBytesCapped(res, max));
}
