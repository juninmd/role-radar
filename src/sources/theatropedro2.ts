import { upsertEvent } from "../db.ts";
import { MAX_SOURCE_BODY, readCapped } from "./public-url.ts";

// Agenda própria do Theatro Pedro II (Ribeirão Preto). Complementa a Ingresso
// Nacional: aqui vêm horário e capa, e sessões vendidas por outras bilheterias
// (ex.: minhaentrada.com.br).
const SITE = "https://www.theatropedro2.com.br";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// data [hora] ... <img src="./imagem_texto/x"> ... <h4>título</h4> ... href="espetaculo.php?id=N..."
const ENTRY =
  /(\d{2})\/(\d{2})\/(\d{4})\s+(?:(\d{2}:\d{2}))?[\s\S]{0,400}?<img src="\.\/(imagem_texto\/[^"]+)"[\s\S]{0,300}?<h4[^>]*>([^<]+)<\/h4>[\s\S]{0,1500}?href="(espetaculo\.php\?id=\d+[^"]*)"/g;

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Agenda do Theatro Pedro II com horário e capa. */
export async function syncTheatroPedro2(today: string): Promise<number> {
  let stored = 0;
  try {
    const res = await fetch(`${SITE}/agenda.php`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await readCapped(res, MAX_SOURCE_BODY);

    for (const m of html.matchAll(ENTRY)) {
      const [, dd, mm, yyyy, time, img, rawTitle, href] = m;
      const date = `${yyyy}-${mm}-${dd}`;
      const title = decode(rawTitle ?? "");
      if (!title || date < today) continue;
      upsertEvent({
        title,
        date,
        time: time ?? null,
        venue: "Theatro Pedro II",
        city: "Ribeirão Preto",
        price: null,
        link: `${SITE}/${decode(href ?? "")}`,
        image: `${SITE}/${img}`,
      });
      stored++;
    }
    console.log(`[theatropedro2] ${stored} sessões`);
  } catch (err) {
    console.warn(`[theatropedro2] falhou: ${err}`);
  }
  return stored;
}
