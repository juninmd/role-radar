// Config específica deste agente. Edite feeds/prompt à vontade.
const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

export const topic = {
  name: "role-radar",
  title: "Rolê Radar — Franca & Ribeirão Preto",
  emoji: "🎟️",
  subject:
    "entretenimento em Franca-SP e Ribeirão Preto: shows, cinema, séries, teatro e atrações",
  systemPrompt: `Você é um curador de agenda cultural focado em Franca-SP e Ribeirão Preto-SP (e região).

Regras do digest:
- Responda SEMPRE em português do Brasil.
- Formato: lista enxuta em Markdown, um item por evento/notícia.
- Para cada item: título curto em *negrito*, 1 frase com data/local quando houver, e o link.
- Se o texto mencionar preço de ingresso ou "gratuito", inclua (ex.: "R$ 60" ou "grátis").
- Priorize eventos FUTUROS em Franca e Ribeirão Preto: shows, festivais, cinema, teatro, stand-up, exposições e atrações.
- Estreias nacionais de filmes/séries entram só se relevantes (cinema local exibe).
- Descarte itens irrelevantes, repetidos, de outras cidades ou puramente promocionais.
- Comece com uma linha de destaque do rolê da semana. Seja direto, sem enrolação.`,
  feeds: [
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
      name: "O que fazer em Franca",
      url: gnews("o que fazer em Franca SP fim de semana"),
    },
    {
      name: "Passeios/turismo Franca",
      url: gnews('passeios OR turismo OR lazer OR feira "Franca" SP'),
    },
    {
      name: "Shows/Eventos Ribeirão",
      url: gnews('shows OR eventos OR festival "Ribeirão Preto"'),
    },
    {
      name: "Agenda cultural região",
      url: gnews('agenda cultural "Ribeirão Preto" OR "Franca"'),
    },
    {
      name: "Teatro/Stand-up região",
      url: gnews(
        'teatro OR "stand up" OR espetáculo "Ribeirão Preto" OR "Franca"',
      ),
    },
    {
      name: "Ingressos/atrações região",
      url: gnews('ingressos OR Sympla "Ribeirão Preto" OR "Franca" SP'),
    },
    {
      name: "Cinema estreias BR",
      url: gnews("estreias cinema da semana Brasil"),
    },
    {
      name: "Séries/streaming BR",
      url: gnews("estreias séries streaming Netflix OR Prime OR Max"),
    },
    { name: "Papelpop (pop/estreias)", url: "https://www.papelpop.com/feed/" },
    {
      name: "ACidade ON Ribeirão",
      url: "https://www.acidadeon.com/ribeiraopreto/rss/",
    },
    {
      name: "Tribuna de Ribeirão",
      url: "https://www.tribunaribeirao.com.br/feed/",
    },
    {
      name: "Jornal da Franca",
      url: "https://www.jornaldafranca.com.br/feed/",
    },
    {
      name: "Franca e região (eventos)",
      url: gnews('"Franca e região" eventos OR shows'),
    },
    {
      name: "Cidades vizinhas",
      url: gnews(
        'eventos OR shows Itirapuã OR "Ribeirão Corrente" OR Restinga SP',
      ),
    },
    {
      name: "Sesc Ribeirão",
      url: gnews('"Sesc Ribeirão Preto" programação OR show OR espetáculo'),
    },
    {
      name: "Sesi Franca/região",
      url: gnews(
        '"Sesi Franca" OR "Sesi Ribeirão" programação OR show OR teatro',
      ),
    },
    {
      name: "Casas de show Ribeirão",
      url: gnews(
        '"Theatro Pedro II" OR "Arena Eurobike" OR "Ribeirão Shopping" show',
      ),
    },
    {
      name: "Casas de show Ribeirão 2",
      url: gnews(
        '"Pupo Nogueira" OR "Concha Acústica" OR "Vila do Golfe" OR "Country Club" Ribeirão show OR evento',
      ),
    },
    {
      name: "Castelinho/Museu Franca",
      url: gnews(
        '"Castelinho" OR "Museu Histórico" OR "Concha Acústica" Franca evento OR show',
      ),
    },
  ],
};
