import { norm, REGION_CITIES } from "../config/region.ts";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Centro aproximado (sede do município) de cada cidade de REGION_CITIES. */
export const CITY_COORDS: Record<string, LatLng> = {
  Franca: { lat: -20.5386, lng: -47.4008 },
  Aramina: { lat: -20.0903, lng: -47.7867 },
  Batatais: { lat: -20.8911, lng: -47.585 },
  Buritizal: { lat: -20.1911, lng: -47.7089 },
  Claraval: { lat: -20.3969, lng: -47.2769 },
  "Cristais Paulista": { lat: -20.4036, lng: -47.4211 },
  Guará: { lat: -20.4283, lng: -47.8242 },
  Igarapava: { lat: -20.0383, lng: -47.7469 },
  Ipuã: { lat: -20.4381, lng: -48.0122 },
  Itirapuã: { lat: -20.6411, lng: -47.2194 },
  Ituverava: { lat: -20.3394, lng: -47.7803 },
  Jeriquara: { lat: -20.3117, lng: -47.5911 },
  Miguelópolis: { lat: -20.1794, lng: -48.0319 },
  "Morro Agudo": { lat: -20.7314, lng: -48.0578 },
  Nuporanga: { lat: -20.7303, lng: -47.7314 },
  Orlândia: { lat: -20.7206, lng: -47.8867 },
  "Patrocínio Paulista": { lat: -20.6394, lng: -47.2819 },
  Pedregulho: { lat: -20.2567, lng: -47.4767 },
  Restinga: { lat: -20.6056, lng: -47.4833 },
  "Ribeirão Corrente": { lat: -20.4583, lng: -47.5906 },
  Rifaina: { lat: -20.0803, lng: -47.4211 },
  "Sales Oliveira": { lat: -20.7697, lng: -47.8378 },
  "São Joaquim da Barra": { lat: -20.5811, lng: -47.8547 },
  "São José da Bela Vista": { lat: -20.5936, lng: -47.6406 },
  "Ribeirão Preto": { lat: -21.1775, lng: -47.8103 },
  Barretos: { lat: -20.5572, lng: -48.5678 },
  Sertãozinho: { lat: -21.1378, lng: -47.9903 },
  Bebedouro: { lat: -20.9492, lng: -48.4792 },
};

// Mais longo primeiro: "Ribeirão Preto" não pode casar como "Ribeirão Corrente".
const BY_LENGTH = [...REGION_CITIES].sort((a, b) => b.length - a.length);

/**
 * Rótulo livre da fonte ("Cinemas de Ribeirão Preto", "Ribeirão e Franca")
 * → cidade da região. Sem casamento (ex.: "Cinemas") devolve null.
 */
export function resolveCity(label: string | null): string | null {
  if (!label) return null;
  const n = norm(label);
  return BY_LENGTH.find((c) => n.includes(norm(c))) ?? null;
}

/** Distância em km entre dois pontos (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Desloca o centro da cidade de forma determinística (0,3–1,2 km) pelo id:
 * vários rolês sem endereço geocodificado não viram um ponto só no mapa.
 */
export function jitter(center: LatLng, seed: string): LatLng {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const km = 0.3 + ((h >>> 9) % 900) / 1000;
  return {
    lat: center.lat + (km / 111) * Math.sin(angle),
    lng:
      center.lng +
      (km / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.cos(angle),
  };
}
