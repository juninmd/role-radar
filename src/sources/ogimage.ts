import { fetchPublic, readCapped } from "./public-url.ts";

const MAX_HTML = 200_000;

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
