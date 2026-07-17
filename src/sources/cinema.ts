const CITIES = [
  { id: 27, label: "Ribeirão Preto", cinema: "Cinemas de Ribeirão Preto" },
  { id: 192, label: "Franca", cinema: "Moviecom Franca" },
];

interface Movie {
  title?: string;
  contentRating?: string;
  genres?: string[];
  siteURL?: string;
  urlKey?: string;
  isPlaying?: boolean;
}

export interface CinemaDay {
  city: string;
  cinema: string;
  movies: {
    title: string;
    rating: string | null;
    genre: string | null;
    link: string;
  }[];
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
