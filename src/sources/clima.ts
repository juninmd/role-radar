import { CITY_COORDS, resolveCity } from "../web/places.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Open-Meteo: previsão diária sem chave e sem cadastro, 16 dias à frente.
const API = "https://api.open-meteo.com/v1/forecast";
const DIAS = 16;

export interface Previsao {
  min: number;
  max: number;
  /** Probabilidade máxima de chuva no dia (%). */
  chuva: number | null;
  /** Código WMO do tempo predominante. */
  code: number;
}

interface Resposta {
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

/** Dia → previsão, a partir da resposta diária da Open-Meteo. */
export function parsePrevisao(json: Resposta): Map<string, Previsao> {
  const d = json.daily ?? {};
  const out = new Map<string, Previsao>();
  for (const [i, dia] of (d.time ?? []).entries()) {
    const max = d.temperature_2m_max?.[i];
    const min = d.temperature_2m_min?.[i];
    if (typeof max !== "number" || typeof min !== "number") continue;
    out.set(dia, {
      min,
      max,
      chuva: d.precipitation_probability_max?.[i] ?? null,
      code: d.weather_code?.[i] ?? 0,
    });
  }
  return out;
}

/**
 * Previsão por cidade (nome canônico de REGION_CITIES). Uma chamada por
 * cidade; cidade sem coordenada ou API fora do ar fica sem previsão — o card
 * sai igual, só sem a linha do tempo.
 */
export async function previsoes(
  cidades: (string | null)[],
): Promise<Map<string, Map<string, Previsao>>> {
  const out = new Map<string, Map<string, Previsao>>();
  const unicas = new Set(
    cidades.map((c) => resolveCity(c)).filter((c): c is string => !!c),
  );
  for (const cidade of unicas) {
    const p = CITY_COORDS[cidade];
    if (!p) continue;
    try {
      const q = new URLSearchParams({
        latitude: String(p.lat),
        longitude: String(p.lng),
        daily:
          "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
        timezone: "America/Sao_Paulo",
        forecast_days: String(DIAS),
      });
      const res = await fetch(`${API}?${q}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.set(
        cidade,
        parsePrevisao(JSON.parse(await readCapped(res, MAX_SOURCE_BODY))),
      );
    } catch (err) {
      console.warn(`[clima] ${cidade} sem previsão: ${err}`);
    }
  }
  return out;
}

// Códigos WMO agrupados no que importa para sair de casa.
const ceu = (code: number) =>
  code >= 95
    ? "⛈️"
    : code >= 80
      ? "🌦️"
      : code >= 51
        ? "🌧️"
        : code >= 45
          ? "🌫️"
          : code === 3
            ? "☁️"
            : code >= 1
              ? "🌤️"
              : "☀️";

/** "🌦️ 18–29°C · 60% de chuva"; chance de chuva abaixo de 20% não é citada. */
export function linhaClima(p: Previsao): string {
  const temp = `${Math.round(p.min)}–${Math.round(p.max)}°C`;
  const chuva =
    p.chuva !== null && p.chuva >= 20 ? ` · ${p.chuva}% de chuva` : "";
  return `${ceu(p.code)} ${temp}${chuva}`;
}

/** Previsão do dia do evento na cidade dele, já formatada, ou null. */
export function climaDoEvento(
  mapa: Map<string, Map<string, Previsao>>,
  ev: { city: string | null; date: string },
  today: string,
): string | null {
  // Festival que começou ontem: vale o tempo de hoje.
  const dia = ev.date < today ? today : ev.date;
  const cidade = resolveCity(ev.city);
  const p = cidade ? mapa.get(cidade)?.get(dia) : undefined;
  return p ? linhaClima(p) : null;
}
