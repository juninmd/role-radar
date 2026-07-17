// Config específica deste agente. Edite feeds/prompt à vontade.
const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

export const topic = {
  name: "role-radar",
  title: "Rolê Radar — Franca-SP",
  emoji: "🎟️",
  subject:
    "entretenimento em Franca-SP: shows, cinema, teatro, passeios e atrações de lazer",
  systemPrompt: `Você é um curador de agenda cultural focado exclusivamente em Franca-SP (e microregião imediata).

Regras do digest:
- Responda SEMPRE em português do Brasil.
- Formato: lista enxuta em Markdown, um item por evento/notícia.
- Para cada item: título curto em *negrito*, 1 frase com data/local quando houver, e o link.
- Se o texto mencionar preço de ingresso ou "gratuito", inclua (ex.: "R$ 60" ou "grátis").
- Priorize eventos FUTUROS em Franca-SP: shows, festivais, teatro, stand-up, exposições, feiras e passeios.
- Estreias nacionais de filmes/séries entram se relevantes para exibição em cinemas locais (como Moviecom Franca).
- Descarte itens irrelevantes, repetidos, de outras cidades (como Ribeirão Preto, a menos que seja um grande evento regional com ônibus saindo de Franca) ou puramente promocionais.
- Comece com uma linha de destaque do rolê da semana. Seja direto, sem enrolação.`,
  feeds: [
    {
      name: "G1 Ribeirão e Franca",
      url: "https://g1.globo.com/dynamo/sp/ribeirao-preto-franca/rss2.xml",
    },
    {
      name: "Jornal da Franca",
      url: "https://www.jornaldafranca.com.br/feed/",
    },
    {
      name: "Shows/Eventos Franca",
      url: gnews('shows OR eventos OR festival "Franca" SP agenda'),
    },
    {
      name: "Locais de show Franca",
      url: gnews(
        '"Teatro Municipal de Franca" OR "Franca Shopping" OR "Pequeno Teatro" show OR espetáculo',
      ),
    },
    {
      name: "Passeios/turismo Franca",
      url: gnews('passeios OR turismo OR lazer OR feira "Franca" SP'),
    },
    {
      name: "Agenda cultural Franca",
      url: gnews('agenda cultural "Franca"'),
    },
    {
      name: "Teatro/Stand-up Franca",
      url: gnews('teatro OR "stand up" OR espetáculo "Franca" SP'),
    },
    {
      name: "Ingressos/atrações Franca",
      url: gnews('ingressos OR Sympla "Franca" SP'),
    },
    {
      name: "Franca e região (eventos)",
      url: gnews('"Franca e região" eventos OR shows'),
    },
    {
      name: "Sesi Franca",
      url: gnews('"Sesi Franca" programação OR show OR teatro'),
    },
    {
      name: "Castelinho/Museu Franca",
      url: gnews(
        '"Castelinho" OR "Museu Histórico" OR "Concha Acústica" Franca evento OR show',
      ),
    },
    {
      name: "Sampi Franca Notícias",
      url: gnews('site:sampi.net.br "Franca" "evento" OR "show" OR "agenda"'),
    },
  ],
};
