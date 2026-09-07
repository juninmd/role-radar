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
      url: "https://g1.globo.com/rss/g1/sp/ribeirao-preto-franca/",
    },
    {
      name: "Jornal da Franca",
      url: "https://www.jornaldafranca.com.br/feed/",
    },
    {
      // Cobre a cena de shows da região (achado ao rastrear a Feijoada do Pinheiro).
      name: "A Tribuna Regional (entretenimento)",
      url: "https://atribunaregional.com.br/feed/",
    },
    {
      name: "Grandes festivais Franca",
      url: gnews(
        '"Franca Rodeo Music" OR "Expoagro Franca" OR rodeio OR "Feijoada do Pinheiro" Franca SP ingressos',
      ),
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
    {
      name: "Bares e baladas Franca",
      url: gnews(
        'bar OR balada OR pub OR "casa noturna" "Franca" SP "ao vivo"',
      ),
    },
    // Casas levantadas a partir do histórico de eventos da cidade.
    {
      name: "Casas de evento Franca",
      url: gnews(
        '"Morada du Capiau" OR "Villa Eventos" OR "Arena Branco" OR "Espaço Cedro" OR "Parque de Exposições Fernando Costa" Franca',
      ),
    },
    {
      name: "Clubes e teatros Franca",
      url: gnews(
        '"Clube AEC Castelinho" OR "Clube de Campo da Franca" OR "Teatro Municipal José Cyrino Goulart" OR "Teatro Judas Iscariotes" OR "Green Hall" Franca',
      ),
    },
    {
      name: "Bares com show Franca",
      url: gnews(
        '"Barracão Skate Club" OR "The Roots" OR "Jardim dos Sonhos" OR "Espaço Creoulla" OR "Quintal do Rosa" OR "Agrobar" OR Santorini Franca',
      ),
    },
    {
      name: "Festas e festivais Franca",
      url: gnews(
        '"Festbar" OR "Expoagro" OR "Carnaval" OR "Festival" Franca SP',
      ),
    },
    {
      name: "Gastronomia/food truck Franca",
      url: gnews(
        'gastronomia OR "food truck" OR "festival gastronômico" OR "feira gastronômica" "Franca" SP',
      ),
    },
    {
      name: "Sertanejo/pagode/rock Franca",
      url: gnews(
        'sertanejo OR pagode OR samba OR rock show "Franca" SP ingressos',
      ),
    },
    {
      name: "Franca Basquete (jogos)",
      url: gnews(
        '"Sesi Franca" basquete jogo OR ingressos OR "Pedro Morilla" OR Pedrocão',
      ),
    },
    {
      name: "Corridas e esporte Franca",
      url: gnews(
        'corrida OR maratona OR "circuito" OR pedal "Franca" SP inscrições',
      ),
    },
    // Casas mapeadas no OpenStreetMap de Franca que não apareciam em nenhuma
    // bilheteria — o levantamento saiu do Overpass (amenity=bar/pub/events_venue).
    {
      name: "Casas de evento (mapa) Franca",
      url: gnews(
        '"Clube da Velha Guarda" OR "Lolla Eventos" OR "Cry for Me" OR "Espaço Olympia" OR "Spazio" OR "Viola Mix" OR "Arena Premium" Franca SP',
      ),
    },
    {
      name: "Bares do mapa Franca",
      url: gnews(
        '"Armazém 43" OR "The Spot" OR "Pub Zé Brasil" OR "Bar do Coqueiro" OR "Kaká Espeto" OR "Moinho\'s" OR "Padrão 12" Franca SP',
      ),
    },
    {
      // Teatro popular e o circuito de praças/parques (Corredor Cultural).
      name: "Teatro popular e praças Franca",
      url: gnews(
        '"Teatro Popular" OR "Corredor Cultural" OR "Bosque Allan Kardec" OR "Parque Francal" OR "Praça dos Angicos" Franca SP',
      ),
    },
    {
      // Futebol da cidade: a extração já pegou jogos de base pelo jornal local.
      name: "Futebol de Franca (Francana/Veterana)",
      url: gnews(
        'Francana OR Veterana OR "Nho Chico" OR "Lanchão" jogo OR partida Franca SP',
      ),
    },
    {
      name: "Franca Shopping (temporadas)",
      url: gnews(
        '"Franca Shopping" circo OR exposição OR parque OR evento OR "Le Cirque"',
      ),
    },
    {
      name: "Divulgação em redes (Franca)",
      url: gnews(
        'site:instagram.com OR site:facebook.com "Franca" SP evento OR show',
      ),
    },
  ],
};
