import { pool } from "../pool.ts";
import { fetchPublic, readCapped } from "./public-url.ts";

const MAX_HTML = 200_000;
// Sites de terceiros: poucas conexões por vez, não uma por evento.
const BATCH_CONCURRENCY = 4;

/** Capa de cada evento: a imagem já salva, ou a og:image da página. */
export async function fetchOgImages(
  events: { id: string; image: string | null; link: string | null }[],
  limit = BATCH_CONCURRENCY,
): Promise<Map<string, string | null>> {
  const pairs = await pool(
    events,
    limit,
    async (ev) =>
      [
        ev.id,
        ev.image ?? (ev.link ? await fetchOgImage(ev.link) : null),
      ] as const,
  );
  return new Map(pairs);
}

/** Fetch a page and pull its og:image, or null. Never throws. */
export async function fetchOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetchPublic(url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await readCapped(res, MAX_HTML);
    const m =
      html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      );
    const img = m?.[1] ?? null;
    return img?.startsWith("http") ? img : null;
  } catch {
    return null;
  }
}
