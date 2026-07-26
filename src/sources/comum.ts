/** Evento já extraído de uma fonte, antes do filtro de região e do upsert. */
export interface Parsed {
  title: string;
  date: string;
  time: string | null;
  venue: string | null;
  city: string | null;
  price: string | null;
  link: string;
  image: string | null;
}

const MESES: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};

/** Tira tags e entidades, colapsa espaço. */
export const limpa = (s: string) =>
  s
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Data em português na forma que as bilheterias usam, com ou sem ano:
 * "14 de Ago às 19:00", "21 de agosto", "04 até 30/07 | Qui. 21h00", "12/09/2026".
 * Sem ano, assume o próximo em que a data ainda é futura.
 */
export function parseDataBr(
  raw: string,
  today: string,
): { date: string; time: string | null } | null {
  const texto = raw.trim();
  const hora =
    texto
      .match(/(\d{1,2})[h:](\d{2})/)
      ?.slice(1, 3)
      .join(":") ?? null;

  // dd/mm/aaaa
  const completa = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (completa)
    return {
      date: `${completa[3]}-${completa[2].padStart(2, "0")}-${completa[1].padStart(2, "0")}`,
      time: hora,
    };

  // "14 de Ago", "21 de agosto" e também "01 AGO" (cards sem a preposição).
  const porExtenso = texto.match(
    /(\d{1,2})\s*(?:de\s*)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i,
  );
  // dd/mm sem ano — pega o ÚLTIMO (em "04 até 30/07" o que vale é o fim)
  const curtas = [...texto.matchAll(/(\d{1,2})\/(\d{1,2})(?!\/|\d)/g)];
  const alvo = porExtenso
    ? {
        dia: porExtenso[1],
        mes: MESES[porExtenso[2].toLowerCase().slice(0, 3)],
      }
    : curtas.length
      ? {
          dia: curtas[curtas.length - 1][1],
          mes: curtas[curtas.length - 1][2],
        }
      : null;
  if (!alvo?.mes) return null;

  const ano = Number(today.slice(0, 4));
  const dia = alvo.dia.padStart(2, "0");
  const mes = alvo.mes.padStart(2, "0");
  const cand = `${ano}-${mes}-${dia}`;
  return {
    date: cand >= today ? cand : `${ano + 1}-${mes}-${dia}`,
    time: hora,
  };
}
