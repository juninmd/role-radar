// Franca-SP e microregião imediata — usado para filtrar eventos das fontes
// e para podar o banco (cidades fora daqui não interessam ao agente).
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
