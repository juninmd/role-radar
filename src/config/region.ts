// Franca-SP, a microregião imediata e Ribeirão Preto — usado para filtrar
// eventos das fontes e para podar o banco. Franca tem prioridade na exibição
// (ver cityRank); as outras entram como complemento.
export const REGION_CITIES = [
  "Franca",
  "Batatais",
  "Claraval",
  "Cristais Paulista",
  "Itirapuã",
  "Ituverava",
  "Jeriquara",
  "Orlândia",
  "Patrocínio Paulista",
  "Pedregulho",
  "Restinga",
  "Ribeirão Corrente",
  "São José da Bela Vista",
  "Ribeirão Preto",
];

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
