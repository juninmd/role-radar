import { upsertEvent } from "../db.ts";

// Sesi Franca Basquete — só os jogos EM CASA (Pedrocão) interessam ao radar.
// Fora de temporada (NBB vai de outubro a junho) a tabela não traz jogos futuros.
const URL = "https://francabasquete.com.br/calendario/partidas";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** Jogos do Sesi Franca em casa, com data/hora, adversário e campeonato. */
export async function syncBasquete(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(URL, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Os escudos só trazem title/alt em parte das linhas; monta src -> time.
    const names = new Map<string, string>();
    for (const m of html.matchAll(
      /<img src="([^"]*storage\/times\/[^"]+)"[^>]*title="([^"]+)"/g,
    ))
      names.set(m[1], m[2]);

    for (const row of html.match(/<tr>[\s\S]*?<\/tr>/g) ?? []) {
      const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (m) => m[1],
      );
      if (tds.length < 6) continue;
      const when = text(tds[0]).match(
        /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/,
      );
      if (!when) continue;
      const date = `${when[3]}-${when[2]}-${when[1]}`;
      if (date < today) continue;
      // class="casa" na coluna Local marca mando de quadra do Franca.
      if (!/class="casa"/.test(tds[4])) continue;

      const teams = [...row.matchAll(/src="([^"]*storage\/times\/[^"]+)"/g)]
        .map((m) => names.get(m[1]))
        .filter((n): n is string => Boolean(n));
      const versus = teams.length >= 2 ? `${teams[0]} x ${teams[1]}` : null;
      const league = text(tds[5]);
      const title = `🏀 ${versus ?? "Sesi Franca"}${league ? ` — ${league}` : ""}`;

      upsertEvent({
        title,
        date,
        time: when[4] ?? null,
        venue: text(tds[4]) || "Pedrocão",
        city: "Franca",
        price: null,
        link: URL,
        image: null,
      });
      stored++;
    }
  } catch (err) {
    console.warn(`[basquete] falhou: ${err}`);
  }
  console.log(`[basquete] ${stored} jogos em casa`);
  return stored;
}
