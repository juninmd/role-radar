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

// Dia que existe no calendário: rejeita 31/02 e 00/13.
const valido = (ano: number, mes: number, dia: number) => {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
};

// HTML trata nomes de entidade sem diferenciar caixa (&AMP; é &).
const NOMES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

// Surrogate isolado e código fora de Unicode não viram caractere.
function entidade(nome: string): string | null {
  if (nome[0] !== "#") return NOMES.get(nome.toLowerCase()) ?? null;
  const hex = nome[1] === "x" || nome[1] === "X";
  const cod = Number.parseInt(nome.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (
    !Number.isFinite(cod) ||
    cod > 0x10ffff ||
    (cod >= 0xd800 && cod <= 0xdfff)
  )
    return null;
  return String.fromCodePoint(cod);
}

/** Tira tags e entidades, colapsa espaço. */
export const limpa = (s: string) =>
  s
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
      (m, nome: string) => entidade(nome) ?? m,
    )
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
  if (completa) {
    const [dia, mes, ano] = [completa[1], completa[2], completa[3]].map(Number);
    if (!valido(ano, mes, dia)) return null;
    return {
      date: `${completa[3]}-${completa[2].padStart(2, "0")}-${completa[1].padStart(2, "0")}`,
      time: hora,
    };
  }

  // "14 de Ago", "21 de agosto" e também "01 AGO" (cards sem a preposição).
  // Mês inteiro e sem letra colada: "10 Maria" e "2 dezenas" não são datas.
  const porExtenso = texto.match(
    /(?<!\d)(\d{1,2})\s*(?:de\s*)?(jan(?:eiro)?|fev(?:ereiro)?|mar(?:ço|co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)(?![a-zà-ú])/i,
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
  const dia = Number(alvo.dia);
  const mes = Number(alvo.mes);
  const iso = (y: number) =>
    `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (valido(ano, mes, dia) && iso(ano) >= today)
    return { date: iso(ano), time: hora };
  // Sem ano certo (ex.: 29/02 fora de bissexto), não chuta: só o próximo ano válido.
  return valido(ano + 1, mes, dia) ? { date: iso(ano + 1), time: hora } : null;
}
