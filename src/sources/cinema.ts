const CITIES = [{ id: 192, label: "Franca", cinema: "Moviecom Franca" }];

interface Movie {
  title?: string;
  contentRating?: string;
  genres?: string[];
  siteURL?: string;
  urlKey?: string;
  isPlaying?: boolean;
  duration?: string;
  images?: { url?: string; type?: string }[];
  trailers?: { type?: string; url?: string }[];
  premiereDate?: { localDate?: string };
}

export interface CinemaDay {
  city: string;
  cinema: string;
  movies: {
    title: string;
    rating: string | null;
    genre: string | null;
    link: string;
    poster: string | null;
    trailer: string | null;
    /** ISO "YYYY-MM-DD" da estreia nacional. */
    premiere: string | null;
    /** Já formatada, ex.: "2h52". */
    duration: string | null;
  }[];
}

function poster(m: Movie): string | null {
  const portrait = m.images?.find((i) => i.type === "PosterPortrait")?.url;
  return portrait ?? m.images?.[0]?.url ?? null;
}

/** "172" (minutos) → "2h52". */
function duration(raw?: string): string | null {
  const min = Number(raw);
  if (!min || Number.isNaN(min)) return null;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

/** Filmes em cartaz hoje por cidade (Ingresso.com nowplaying). */
export async function nowPlaying(): Promise<CinemaDay[]> {
  const out: CinemaDay[] = [];
  for (const c of CITIES) {
    try {
      const res = await fetch(
        `https://api-content.ingresso.com/v0/templates/nowplaying/${c.id}?partnership=home`,
        {
          headers: { "user-agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const movies = (await res.json()) as Movie[];
      const list = movies
        .filter((m) => m.title && m.isPlaying !== false)
        .map((m) => ({
          title: (m.title as string).trim(),
          rating: m.contentRating ?? null,
          genre: m.genres?.[0] ?? null,
          link: m.siteURL ?? `https://www.ingresso.com/filme/${m.urlKey ?? ""}`,
          poster: poster(m),
          // A API devolve vários trailers (teaser, dublado, legendado); o
          // primeiro é o principal.
          trailer:
            m.trailers?.find((t) => t.type === "YouTube" && t.url)?.url ?? null,
          premiere: m.premiereDate?.localDate?.slice(0, 10) ?? null,
          duration: duration(m.duration),
        }));
      if (list.length)
        out.push({ city: c.label, cinema: c.cinema, movies: list });
    } catch (err) {
      console.warn(`[cinema] ${c.label} falhou: ${err}`);
    }
  }
  console.log(
    `[cinema] ${out.reduce((n, d) => n + d.movies.length, 0)} filmes em cartaz`,
  );
  return out;
}
