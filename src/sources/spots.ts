export interface SightSpot {
  name: string;
  description: string;
  venue: string;
  image: string;
  mapsUrl: string;
}

export const FRANCA_SPOTS: SightSpot[] = [
  {
    name: "Jardim Zoobotânico de Franca",
    description:
      "Um espaço verde incrível com mata nativa preservada, trilhas ecológicas para caminhada em contato com a natureza, além de um dos maiores meliponários do país (criação de abelhas nativas sem ferrão). Ótimo para ir com a família!",
    venue: "Jardim Zoobotânico (Rua Pedreiras, Franca - SP)",
    image: "",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Jardim+Zoobotanico+Franca+SP",
  },
  {
    name: "Parque de Exposições Fernando Costa",
    description:
      "Um refúgio de lazer urbano muito tradicional em Franca. Possui amplas pistas de caminhada, lagos ornamentais com patos, parquinhos infantis de madeira e o Horto Florestal. Local ideal para piqueniques e descanso nos finais de semana.",
    venue: "Parque Fernando Costa (Av. Dr. Flávio Rocha, 500, Franca - SP)",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/0/09/Parque_Fernando_Costa%2C_Franca_SP.jpg",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Parque+Fernando+Costa+Franca+SP",
  },
  {
    name: "Catedral Nossa Senhora da Conceição",
    description:
      "Um dos marcos históricos e arquitetônicos mais imponentes de Franca, situada bem no coração da cidade. Famosa pela beleza interna de seus vitrais coloridos e pela riqueza de sua arquitetura clássica.",
    venue:
      "Catedral Metropolitana (Praça Nossa Senhora da Conceição, Centro, Franca - SP)",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Catedral_de_Franca_-_SP.jpg/1280px-Catedral_de_Franca_-_SP.jpg",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Catedral+Nossa+Senhora+da+Conceicao+Franca+SP",
  },
  {
    name: "Pinacoteca Municipal Miguel Ângelo Pucci",
    description:
      "Um tesouro cultural no centro de Franca. Abriga diversas exposições rotativas de pinturas, esculturas e gravuras de artistas da região e nomes consagrados no país.",
    venue:
      "Pinacoteca Municipal (Rua Estevão Leão Bourroul, 2017, Centro, Franca - SP)",
    image: "",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Pinacoteca+Municipal+Franca+SP",
  },
  {
    name: "Museu Histórico Municipal José Chiachiri",
    description:
      "Instalado no belo prédio histórico do antigo fórum e cadeia pública da cidade, o museu abriga um acervo fantástico de fotos, jornais antigos, móveis e pertences que contam a história da fundação de Franca e sua evolução como a Capital do Calçado.",
    venue: "Museu Histórico (Rua Campos Salles, 2010, Centro, Franca - SP)",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/3/38/Centro%2C_Franca_-_S%C3%A3o_Paulo%2C_Brasil_-_panoramio_%28133%29.jpg",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Museu+Historico+Jose+Chiachiri+Franca+SP",
  },
  {
    name: "Cachoeira do Aeroporto / Caminhos de São José",
    description:
      "Uma queda d'água refrescante e de fácil acesso próxima à área urbana de Franca. Excelente destino para entusiastas do ciclismo, caminhadas ecológicas e trilhas em busca de natureza e calmaria.",
    venue:
      "Cachoeira do Aeroporto (Estrada vicinal próxima ao Aeroporto de Franca)",
    image: "",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Cachoeira+do+Aeroporto+Franca+SP",
  },
  {
    name: "Shopping do Calçado de Franca",
    description:
      "O maior polo de compras e comércio de Franca. Como a Capital Nacional do Calçado Masculino e de Couro, este shopping reúne dezenas de lojas direto de fábrica com excelente variedade, qualidade e preços imbatíveis.",
    venue: "Shopping do Calçado (Av. Dr. Hélio Palermo, 5001, Franca - SP)",
    image: "",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Shopping+do+Calcado+Franca+SP",
  },
  {
    name: "Ginásio Poliesportivo Pedro Morilla Fuentes (Pedrocão)",
    description:
      "Conhecido nacionalmente como o 'Templo do Basquete Brasileiro'. Assistir a uma partida do Sesi Franca Basquete no Pedrocão é uma experiência inesquecível e contagiante devido à torcida fanática local.",
    venue: "Ginásio do Pedrocão (Rua dos Pracinhas, 510, Franca - SP)",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/David_Jackson_12012019.jpg/1280px-David_Jackson_12012019.jpg",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Ginasio+Pedrocao+Franca+SP",
  },
];

/** Return a spot deterministically based on date so it shifts daily */
export function getDailySpot(dateStr: string): SightSpot {
  // Simple hash of date string
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % FRANCA_SPOTS.length;
  return FRANCA_SPOTS[idx];
}
