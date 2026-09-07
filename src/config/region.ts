// Microregião de Franca (IBGE) + Claraval/MG, que faz divisa, + Ribeirão Preto.
// Esta lista é o filtro: fonte que devolve catálogo inteiro (OTicket, Blueticket,
// Mega Bilheteria, Ingresso Nacional, Ticket Fácil, Duoticket) passa por
// `inRegion` e portanto já cobre TODAS estas cidades sem custo nenhum.
// Franca tem prioridade na exibição — ver cityRank.
export const REGION_CITIES = [
  "Franca",
  "Aramina",
  "Batatais",
  "Buritizal",
  "Claraval",
  "Cristais Paulista",
  "Guará",
  "Igarapava",
  "Ipuã",
  "Itirapuã",
  "Ituverava",
  "Jeriquara",
  "Miguelópolis",
  "Morro Agudo",
  "Nuporanga",
  "Orlândia",
  "Patrocínio Paulista",
  "Pedregulho",
  "Restinga",
  "Ribeirão Corrente",
  "Rifaina",
  "Sales Oliveira",
  "São Joaquim da Barra",
  "São José da Bela Vista",
  "Ribeirão Preto",
  // Raio de ~100km, fora da microregião IBGE mas com eventos confirmados nos
  // catálogos que já baixamos inteiros (OTicket, Mega Bilheteria, Duoticket) —
  // custo zero, só ampliar o filtro (ver memória de pesquisa de fontes).
  "Barretos",
  "Sertãozinho",
  "Bebedouro",
];

/**
 * Cidades que valem uma BUSCA POR NOME. Fonte que só responde por cidade
 * (Sympla) ou por termo (Uhuu, Ingresso Digital, Bilheteria Digital) gasta uma
 * requisição por item desta lista — então aqui ficam só as que têm bilheteria
 * de verdade. As demais da região continuam entrando pelas fontes de catálogo.
 */
export const SEARCH_CITIES = [
  "Franca",
  "Ribeirão Preto",
  "Batatais",
  "Ituverava",
  "Orlândia",
  "São Joaquim da Barra",
  "Igarapava",
  "Morro Agudo",
];

/** "São Joaquim da Barra" → "sao-joaquim-da-barra-sp" (formato do Sympla). */
export const citySlug = (city: string) =>
  `${norm(city).replace(/\s+/g, "-")}-sp`;

/** Minúsculas sem acento — para comparar nomes de cidade vindos de fontes diversas. */
export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const ALLOWED = new Set(REGION_CITIES.map(norm));

export const inRegion = (city?: string | null) =>
  Boolean(city && ALLOWED.has(norm(city)));

/**
 * Ordem de exibição: Franca primeiro, depois a microregião, e Ribeirão Preto
 * por último — é complemento, não o foco do radar.
 */
export const cityRank = (city?: string | null): number => {
  const c = norm(city ?? "");
  if (c.includes("franca")) return 0;
  if (c.includes("ribeirao preto")) return 2;
  return 1;
};
