import { env } from "../config/env.ts";
import { norm } from "../config/region.ts";
import { readCapped } from "../sources/public-url.ts";
import { CITY_COORDS, distanceKm, type LatLng, resolveCity } from "./places.ts";
import { cacheCoord, cachedCoord } from "./store.ts";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Resposta do Nominatim é um array de 1 item; o teto só corta resposta anômala.
const MAX_HIT = 5_000_000;
// Política do Nominatim: no máximo 1 req/s e User-Agent identificando o app.
const UA = "role-radar/0.1 (+https://github.com/juninmd/role-radar)";
const GAP_MS = 1100;
// Resultado mais longe que isto do centro da cidade é homônimo de outro lugar.
const MAX_KM_FROM_CITY = 40;

export interface Place {
  venue: string;
  city: string | null;
}

/** Chave do cache — a mesma usada na leitura (catálogo) e na escrita. */
export const geoKey = (p: Place) =>
  norm(`${p.venue} | ${resolveCity(p.city) ?? ""}`);

/**
 * Tira o ruído que as bilheterias grudam no nome do local e que faz o
 * Nominatim errar: "(plateia livre)", " - 20h00", " - Ribeirão Preto".
 */
export const cleanVenue = (venue: string, city: string | null) => {
  let v = venue.replace(/\([^)]*\)/g, " ");
  v = v.replace(/\s+-\s+\d{1,2}h\d{0,2}\b.*$/i, "");
  if (city) v = v.replace(new RegExp(String.raw`\s+-\s+${city}.*$`, "i"), "");
  return v.replace(/\s+/g, " ").trim();
};

async function lookup(p: Place, center: LatLng): Promise<LatLng | null> {
  const city = resolveCity(p.city);
  const q = `${cleanVenue(p.venue, city)}, ${city}, SP, Brasil`;
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { "user-agent": UA, "accept-language": "pt-BR" },
    signal: AbortSignal.timeout(10000),
  });
  // Erro de rede/HTTP propaga: só "consultou e não achou" vira cache negativo.
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const [hit] = JSON.parse(await readCapped(res, MAX_HIT)) as {
    lat?: string;
    lon?: string;
  }[];
  if (!hit?.lat || !hit.lon) return null;
  const coord = { lat: Number(hit.lat), lng: Number(hit.lon) };
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) return null;
  return distanceKm(coord, center) <= MAX_KM_FROM_CITY ? coord : null;
}

/**
 * Geocodifica locais ainda fora do cache, no máximo `max` por rodada (roda
 * dentro do CronJob diário: o resto fica pra amanhã). Falha não derruba nada.
 */
export async function geocodePlaces(
  places: Place[],
  max = env.geocodeMax,
  sleep = (ms: number) => Bun.sleep(ms),
): Promise<number> {
  const seen = new Set<string>();
  const todo = places.filter((p) => {
    const key = geoKey(p);
    const city = resolveCity(p.city);
    // Nome que some na limpeza buscaria só a cidade, e o centro dela viraria pino exato.
    if (!city || !cleanVenue(p.venue, city) || seen.has(key)) return false;
    if (cachedCoord(key) !== undefined) return false;
    seen.add(key);
    return true;
  });
  let done = 0;
  let tries = 0;
  for (const p of todo.slice(0, max)) {
    const center = CITY_COORDS[resolveCity(p.city) as string];
    try {
      if (tries++) await sleep(GAP_MS);
      cacheCoord(geoKey(p), await lookup(p, center));
      done++;
    } catch (err) {
      console.warn(`[geo] ${p.venue} falhou: ${err}`);
    }
  }
  if (done) console.log(`[geo] ${done} local(is) geocodificado(s)`);
  return done;
}
