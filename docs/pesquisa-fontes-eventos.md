# Mapeamento Completo de Fontes de Eventos — Franca e Região

Este documento cataloga de forma exaustiva todas as fontes de eventos pesquisadas, testadas e avaliadas para o **Rolê Radar** (Franca-SP e raio expandido de ~100km). O objetivo é registrar o comportamento técnico de cada uma para não precisar repetir pesquisas no futuro.

---

## 1. Fontes Estruturadas Integradas (Ativas no Digest)

| Plataforma / Fonte | Endpoint / Método | Tipo de Cobertura | Detalhes Técnicos e Particularidades |
|---|---|---|---|
| **Sympla** | `https://www.sympla.com.br/eventos/{cidade-slug}` | Franca, Ribeirão Preto, Batatais, etc. | Extrai dados do payload React Server Component (RSC). Cidades menores têm todos os eventos na pág 1; Ribeirão usa até 2 páginas. |
| **Q2 Ingressos** | `https://cdn.q2ingressos.com.br/assets/api/nextEvents.json` | Franca (sede da empresa), Batatais, RP | Catálogo JSON leve e oficial servido via CDN. Traz Villa Eventos, Agrobar, Morada du Capiau, congressos e shows regionais. Link: `/events/{Slug}`. |
| **Guichê Web** | `POST https://www.guicheweb.com.br/webservices/api/api.php` | Sertãozinho, Ribeirão Preto, Franca | Requisição multipart com `a=carregar_home&pesquisa={cidade}`. Cobre tardezinhas, festivais cervejeiros, Oktoberfest e shows sertanejos. |
| **Zig.tickets** | `https://zig.tickets/` (`__NEXT_DATA__`) | Ribeirão Preto, Franca, Altinópolis | Next.js SSR. Objeto `props.pageProps.events.events` expõe catálogo nacional com filtragem regional instantânea. Pubs, Art House, Old Barn, baladas. Link: `/eventos/{slug}`. |
| **OTicket** | `GET https://api.oticket.com.br/search?city=&producer=` | Franca (empresa local), Orlândia, RP | API aberta JSON. `city=` vazio traz ~100 eventos da região sem paginação. Club Show Franca, Paggio Gastrobar, Unifran. |
| **Mega Bilheteria** | `GET https://web.megabilheteria.com/api/public/v2/events` | Franca, Bebedouro, Batatais, RP | Filtro de cidade da API é ignorado; radar busca páginas e filtra localmente via `inRegion()`. Teatros municipais e stand-up comedy. |
| **Duoticket** | Home + detalhe de cada evento | Franca e região | Requer raspagem de detalhe para obter endereço e horários precisos. |
| **Evento ON** | `https://www.eventoon.com.br/cidade/franca-sp` | Franca (vitrine parceira) | Morada du Capiau, Teatro Municipal, Royal, Villa. |
| **Blueticket** | `https://api2.blueticket.com.br/events/?origin=capa&pdv=100` | Ribeirão Preto e festivais | Parâmetro de cidade é ignorado no backend; filtra localmente. URL do JSON é a imagem; digest infere og:image se necessário. |
| **Ingresso Digital** | `https://www.ingressodigital.com/pesquisa.php?busca=S&pg=1&txt_busca=` | Franca, RP | HTML server-side. Datas vêm sem ano ("14 de Ago"); calculadas para próximo ano futuro. |
| **Ingresso Nacional** | `GET https://www.ingressonacional.com.br/api/paginas/eventos.php` | Theatro Pedro II e região | Exige headers específicos do AngularJS (`Accept: application/json, text/plain, */*` e `X-Requested-With: XMLHttpRequest`). |
| **Minha Entrada** | `GET https://minhaentrada.com.br/buscar-eventos?buscaNome=&buscaLocal={cidade}` | Ribeirão Preto | AJAX retorna fragmentos HTML de cards de eventos. |
| **Theatro Pedro II** | `https://www.theatropedro2.com.br/agenda.php` | Ribeirão Preto | Agenda oficial própria com horários, sinopses e imagens de capa. |
| **Prefeitura de Franca** | `https://turismo.franca.sp.gov.br/eventos` | Franca | Agenda oficial de turismo e cultura (feiras, praças, teatro municipal). |
| **Franca Shopping** | `https://francashopping.com.br/eventos/` | Franca | Exposições, parques, circo e temporadas longas. |
| **Sesc SP** | `https://www.sescsp.org.br/wp-json/wp/v1/atividades/filter?local={id}` | Franca (1005) e RP (35) | API oficial do Sesc com gratuidade, datas, locais e ingressos. |
| **Ingresso.com** | API de catálogo/cinema | Franca (Moviecom Franca Shopping) | Sessões diárias de cinema, trailers, sinopses e pôsteres em alta definição. |
| **Franca Basquete** | Raspagem do calendário NBB/CBB | Franca (Pedrocão) | Filtra apenas mando de quadra no Ginásio Pedrocão. |

---

## 2. Feeds de Notícias e Portais Locais (Ingestão RSS + IA)

| Fonte / Veículo | URL do Feed / Mecanismo | Cidade / Região | Diagnóstico e Aproveitamento |
|---|---|---|---|
| **G1 Ribeirão e Franca** | `g1.globo.com/rss/g1/sp/ribeirao-preto-franca/` | Franca e Ribeirão | Feed ativo. Utiliza `extractEvents()` via IA para extrair rolês de matérias jornalísticas. |
| **Jornal da Franca** | `www.jornaldafranca.com.br/feed/` | Franca | Feed WordPress padrão. Excelente cobertura comunitária e cultural local. |
| **Verdade ON** | `verdadeon.com.br/portal/feed/` | Franca | Cobriu eventos independentes como Festival Mundo Asiático. |
| **A Tribuna Regional** | `atribunaregional.com.br/feed/` | Região de Franca | Eventos gastronômicos e grandes feijoadas regionais. |
| **24h SP Franca** | `franca.24hsp.com.br/feed/` | Franca | Feed WordPress ativo (26+ itens). Cobertura de editais sociais e programação cultural. |
| **Gazeta de Bebedouro** | `gazetadebebedouro.com.br/feed/` | Bebedouro | Feed WordPress ativo. Traz festas cívicas, celebrações e eventos da cidade. |
| **A Cidade ON Ribeirão** | `acidadeon.com/ribeiraopreto/lazer-e-cultura/feed/` | Ribeirão Preto / Franca | Categoria exclusiva de cultura e lazer. Altíssimo sinal/ruído. |
| **Agenda Barretos** | `barretosnews.com.br/category/agenda-cultural/feed/` | Barretos | Cobertura cultural focada em Barretos e região. |
| **Em Foco Sertãozinho** | `emfocosertaozinho.com.br/feed/` | Sertãozinho | Noticiário local que cobre eventos no Teatro Municipal de Sertãozinho. |
| **Google News RSS (20+ queries)** | `news.google.com/rss/search?q=...` | Franca e cidades vizinhas | Consultas refinadas por casas noturnas, praças, futebol local (Francana) e shows. |

---

## 3. Plataformas Pesquisadas e Status Técnico Detalhado

| Plataforma | URL / Endpoint Testado | Status / Comportamento | Veredito / Motivo de Não Integração Direta |
|---|---|---|---|
| **BaladApp** | `https://baladapp.com.br/` | 200 (Cloudflare Turnstile ativo) | Bloqueio anti-bot ativo (`Just a moment...` / Turnstile) em fetch headless. Eventos de Franca (Villa) entram indiretamente pelo Google News/notícias. |
| **Blacktag** | `https://blacktag.com.br/busca?q=Franca` | 404 / Cloudflare Turnstile | Rotas de busca não expostas como API pública e proteção Cloudflare em requisições diretas. |
| **IngressoLive** | `https://www.ingressolive.com/eventos?cidade=Franca` | 404 na busca | Histórico universitário pontual (Barraco Baco), mas plataforma não oferece busca pública estruturada por cidade para 2026. |
| **INTI (Byinti)** | `https://byinti.com/` | CMS WordPress na home (sem listagem global) | Cada organizador usa seu subdomínio dedicado (ex.: `casacorribeiraopreto.byinti.com`). Sem catálogo unificado de busca. |
| **Ticket360** | `/eventos/pesquisar?s=` | 200 (0 eventos na região) | API responde, mas locais cadastrados (Castelinho Franca, Ribeirão Shopping) não têm venda ativa. |
| **Ticket Fácil** | `/search.html?q=` | 200 (0 eventos na região) | Sem atrações no interior de SP. |
| **Bilheteria Digital** | `/busca/franca/as/1` | 200 (sem eventos) | Vendas raras no Livre Bar, atualmente sem agenda ativa. |
| **Uhuu** | `/busca?termo=` | 200 (sem eventos na região) | Sem casas cadastradas em Franca/região. |
| **Bilheteria Express** | `/agendas/` | 200 (sem eventos na região) | Foco predominante na Grande SP e ABC. |
| **Eventbrite** | `/d/brazil--franca/events/` | 200 (lixo / genérico) | Devolve eventos online internacionais ou repetidos; sem sinal útil local. |
| **Eventim** | `eventim.com.br` | Timeout / 403 | Bloqueio WAF estrito; foco em megashows na capital. |
| **Ticketmaker (BR)** | Catch-all na home | Sem busca | Roteamento catch-all, sem endpoints acessíveis. |
| **Bandsintown** | API / web | 403 Forbidden | Exige credenciais de parceiro fechadas. |
| **Songkick** | Web / API | 406 Not Acceptable | Recusa qualquer User-Agent convencional. |
| **Sampi (GCN Franca)** | `/franca/noticias/cultura` | 404 | Sem feed RSS público ou rota de cultura direta. Monitorado via busca do Google News. |
| **Portal Pop Mundi** | `popmundi.com.br/feed/` | 200 (0 itens RSS) | O feed existe mas devolve XML vazio / redireciona para HTML. |
| **Prefeitura de Batatais** | `batatais.sp.gov.br/feed/` | 200 (0 itens RSS) | Feed institucional vazio. |
| **Portal da Cidade (Rede)** | Várias cidades | 403 Forbidden / sem RSS | Não há unidade própria em Franca/Batatais/Sertãozinho. |
| **Instagram / Facebook** | Web scraping | Exige autenticação / WAF | Monitorado de forma limpa e resiliente via dorks do Google News (`site:instagram.com Franca evento`). |

---

## 4. Diretrizes para Futuras Expansões
1. **Prioridade Geográfica:** Franca (`cityRank = 0`) tem precedência absoluta nos digests do Telegram e no cabeçalho do radar web. Cidades vizinhas (`cityRank = 1`) e Ribeirão Preto (`cityRank = 2`) são agregadas como complemento rodoviário.
2. **Novas Casas de Show:** Antes de criar scraper, verificar se o estabelecimento vende via **Q2**, **OTicket**, **Sympla**, **Guichê Web** ou **Zig.tickets**, que já cobrem 90%+ das vendas estruturadas da região.
