import { applyFilters, weekendDays } from "../data.js";
import { state } from "../state.js";
import { addDays, fmtKm } from "../util.js";

export const Q = [
  [
    "company",
    "Com quem?",
    [
      ["sozinho", "🧍 Sozinho"],
      ["date", "💘 Date"],
      ["amigos", "🍻 Amigos"],
      ["familia", "👨‍👩‍👧 Família"],
    ],
  ],
  [
    "vibe",
    "Qual a vibe?",
    [
      ["agitar", "🔥 Agitar"],
      ["rir", "😂 Dar risada"],
      ["cultura", "🎭 Cultura"],
      ["relaxar", "😌 De boa"],
      ["comer", "🍔 Comer bem"],
      ["esporte", "🏀 Esporte"],
      ["surpresa", "🎁 Surpreenda"],
    ],
  ],
  [
    "when",
    "Quando?",
    [
      ["hoje", "Hoje"],
      ["amanha", "Amanhã"],
      ["fds", "Fim de semana"],
      ["qualquer", "Tanto faz"],
    ],
  ],
  [
    "budget",
    "Quanto quer gastar?",
    [
      ["0", "Nada"],
      ["50", "Até R$50"],
      ["100", "Até R$100"],
      ["qualquer", "Tanto faz"],
    ],
  ],
  [
    "reach",
    "Quão longe topa ir?",
    [
      ["5", "🚶 Perto (5 km)"],
      ["20", "🚗 Na cidade (20 km)"],
      ["120", "🛣️ Pego estrada"],
    ],
  ],
];

const VIBE = {
  agitar: { show: 3, festa: 3, esporte: 1.5 },
  rir: { comedia: 3.5, teatro: 1, festa: 1 },
  cultura: { teatro: 3, cultura: 3, cinema: 2, show: 1 },
  relaxar: { gastronomia: 2.5, cinema: 2, cultura: 2, outros: 1 },
  comer: { gastronomia: 3.5, festa: 0.5 },
  esporte: { esporte: 3.5 },
};
const COMPANY = {
  sozinho: { cinema: 1, cultura: 1, show: 1 },
  date: { teatro: 1.5, gastronomia: 1.5, cinema: 1.5, show: 1, comedia: 1 },
  amigos: { festa: 1.5, show: 1.5, comedia: 1.5, esporte: 1, gastronomia: 1 },
  familia: {
    infantil: 3,
    cultura: 1,
    gastronomia: 1,
    cinema: 1,
    esporte: 1,
    festa: -2,
  },
};
// Nome que aparece nos motivos (a chave interna não é texto para a pessoa).
const VIBE_NOME = {
  agitar: "agitar",
  rir: "dar risada",
  cultura: "cultura",
  relaxar: "relaxar",
  comer: "comer bem",
  esporte: "esporte",
  surpresa: "surpresa",
};

// Sorteio da vibe "surpresa" fica fixo por item na sessão: mudar outra resposta
// não reembaralha o ranking nem a % de match.
const surpriseDraw = new Map();
const surpriseNoise = (id) => {
  if (!surpriseDraw.has(id)) surpriseDraw.set(id, Math.random());
  return surpriseDraw.get(id);
};

/** Nota e motivos de um item para as respostas. null = fora (filtro duro). */
export function score(it, a, today) {
  const reasons = [];
  if (a.when !== "qualquer" && it.date) {
    const ok =
      a.when === "hoje"
        ? it.date === today
        : a.when === "amanha"
          ? it.date === addDays(today, 1)
          : weekendDays(today).includes(it.date);
    if (!ok) return null;
  }
  const reach = Number(a.reach);
  if (it.km !== null && it.km > reach) return null;
  let pts = 0;
  if (a.budget !== "qualquer") {
    if (it.priceMin !== null && it.priceMin > Number(a.budget)) return null;
    if (it.priceMin === null) pts -= 0.5;
    else reasons.push(it.priceMin === 0 ? "grátis" : "cabe no bolso");
  }
  const vibe =
    a.vibe === "surpresa"
      ? 1.5 + surpriseNoise(it.id)
      : (VIBE[a.vibe]?.[it.category] ?? 0);
  const comp = COMPANY[a.company]?.[it.category] ?? 0;
  pts += vibe + comp;
  if (vibe >= 2.5) reasons.push(`bem a vibe "${VIBE_NOME[a.vibe]}"`);
  if (comp >= 1.5)
    reasons.push(
      `bom pra ir ${a.company === "date" ? "num date" : a.company === "familia" ? "com a família" : `com ${a.company}`}`,
    );
  if (it.km === null) pts -= 1;
  else if (it.km < 3) {
    pts += 0.7;
    reasons.push(`a ${fmtKm(it.km)}`);
  }
  if (it.daysAhead === 0) {
    pts += 0.5;
    reasons.push("é hoje");
  }
  if (state.favs.has(it.id)) {
    pts += 1;
    reasons.push("tá nos favoritos");
  }
  if (it.daily) {
    pts += 0.5;
    reasons.push("dica do dia");
  }
  if (it.image) pts += 0.2;
  return {
    it,
    pts,
    match: Math.max(5, Math.min(99, Math.round(45 + pts * 9))),
    reasons,
  };
}

/**
 * Lugares fixos do plano B: os filtros de cidade, busca e preço valem, mas o
 * tipo é sempre "lugar", senão os kinds padrão (evento/filme) zeram tudo.
 */
export function spotsPool(lugares, f, today, favs) {
  return applyFilters(lugares, { ...f, kinds: ["lugar"] }, today, favs);
}

export function pickWeighted(list) {
  const w = list.map((r) => Math.max(0.1, r.pts) ** 2);
  let x = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    x -= w[i];
    if (x <= 0) return list[i];
  }
  return list[0];
}
