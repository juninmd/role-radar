# Bilheterias — status da varredura

Escopo do radar: **Franca-SP em primeiro lugar**, a microregião imediata como
complemento e **Ribeirão Preto** também aceito. A ordem de exibição segue essa
prioridade (`cityRank` em `src/config/region.ts`).

> **Lição do rastreio:** a varredura automática chutava a URL de busca de cada
> site. Quando o site é SPA, a URL chutada devolve só o esqueleto e o veredito
> sai errado — foi assim que Mega Bilheteria, OTicket, Blueticket e Ingresso
> Digital foram marcadas como "sem Franca" indevidamente. As quatro têm eventos.
> O jeito certo é abrir **F12 → Network → Fetch/XHR** e usar a busca do site.

## Integradas

| Plataforma | Endpoint | Observação |
|---|---|---|
| Sympla | página por cidade (payload RSC) | páginas 2+ das cidades pequenas não têm nada exclusivo; Ribeirão usa as duas páginas (48 vagas, 100% da cidade) |
| Duoticket | home + página de cada evento | local/horário/título completo só existem no detalhe |
| Evento ON (vitrine da Q2) | `/cidade/franca-sp` | Morada du Capiau, Teatro Municipal, Villa, Royal |
| Mega Bilheteria | `web.megabilheteria.com/api/public/v2/events` | filtro de cidade não existe: pagina tudo e filtra localmente |
| OTicket | `api.oticket.com.br/search?city=&producer=` | empresa é de Franca; traz Club Show, Paggio, Unifran |
| Blueticket | `api2.blueticket.com.br/events/?origin=capa&pdv=100` | `city` é ignorado; cobre Ribeirão Preto |
| Ingresso Digital | `/pesquisa.php?busca=S&pg=1&txt_busca=` | HTML server-side; teatro e stand-up |
| Ingresso Nacional | `/api/paginas/eventos.php` | **só responde JSON com os headers do AngularJS** (ver abaixo); Theatro Pedro II |
| Ingresso.com | API de conteúdo | filmes em cartaz e estreias, com trailer e pôster |
| Sesc Franca | API de atividades | Franca (1005) e Ribeirão Preto (35) |
| Q2 Ingressos | `cdn.q2ingressos.com.br/assets/api/nextEvents.json` | Sede em Franca; cobre Villa Eventos, Agrobar, Morada du Capiau, Batatais |
| Guichê Web | `/webservices/api/api.php` (`carregar_home`) | POST multipart por cidade; cobre Sertãozinho (Tardezinha, Oktoberfest) e Ribeirão |
| Zig Tickets | `zig.tickets/` (`__NEXT_DATA__`) | Pubs e baladas (Old Barn Pub, Art House, shows em Ribeirão/Franca) |
| Articket | `articket.com.br/api/search?q=<cidade>` | Shows de rock e casas underground (Toca do Jack Pub, Armazém Baixada) |
| Minha Entrada | `/buscar-eventos?buscaNome=&buscaLocal=<cidade>` | fragmento HTML; só Ribeirão tem resultado (Franca/Batatais: 0) |
| Theatro Pedro II (agenda própria) | `/agenda.php` | HTML com horário e capa; complementa a Ingresso Nacional |
| Prefeitura (turismo) | HTML da agenda oficial | |
| Franca Basquete | tabela de jogos | só mando de quadra; fora de temporada devolve 0 |
| Franca Shopping | HTML de eventos | temporadas longas: circo, parque, exposição |

### Armadilhas de cada API integrada

- **Mega Bilheteria** — `city`, `cityName`, `city_path`, `state` e `uf` são
  todos ignorados e devolvem o catálogo inteiro (~230 itens, 3 páginas de 100).
  Link do evento: `/evento?id={code}`, padrão que vazou no template do site.
- **OTicket** — `?city=franca` funciona, mas só com match exato e sem acento
  (`?city=ribeirao preto` devolve 0). Pedir `city=` vazio traz os ~96 eventos de
  todas as cidades numa requisição. Link: `/event/{slug}`. O catálogo contém
  evento de teste do operador ("EVENTO TESTE ALEXANDRE"), filtrado por nome.
- **Blueticket** — `?city=Franca` devolve exatamente a mesma lista que
  `?city=Ribeirão Preto`: o parâmetro é ignorado. O campo `url` do JSON é a
  **imagem**, não a página; `listingUrl` vem vazio. A API às vezes responde 200
  com corpo `null`.
- **Ingresso Digital** — a data vem sem ano ("14 de Ago às 19:00"); assume-se o
  próximo ano em que a data ainda é futura. Paginação morre na página 1.

### Ingresso Nacional: o header é o segredo

O endpoint é o que você achou, mas ele responde três coisas diferentes segundo
o cabeçalho — e só uma delas é o catálogo:

| Requisição | Resposta |
|---|---|
| `GET eventos.php` sem header especial | HTML da SPA (5 KB) |
| `+ accept: application/json` | **406** |
| `+ accept: application/json, text/plain, */*` e `x-requested-with: XMLHttpRequest` | **JSON, 175 KB, 212 eventos** |

É o `Accept` do `$http` do AngularJS. Campos úteis: `DataOrdem` ("20260730",
já ordenável), `Cidade`, `Local`, `Nome`, `IDEvento`, `urlEvento`, e as flags
`Cancelado`/`Adiado`. Link: `/evento/{IDEvento}/{urlEvento}` — o roteador usa o
id, então o slug pode variar. O payload traz só o nome do arquivo da imagem e
não achei a base pública; o digest cobre com og:image.

## Armadilha do Telegram (custou um bug em produção)

No Markdown **legado** do Telegram, um `_` solto abre itálico e nunca fecha — a
mensagem inteira volta 400 (`can't find end of the entity`). Links da Prefeitura
têm `detalhe_evento`, então todo evento vindo dali perdia a foto e caía pra
texto. Medido contra a API:

| Forma | Resposta |
|---|---|
| `🔗 https://…/detalhe_evento?slug=19-festbar` | **400 recusado** |
| `🔗 [Ingressos e detalhes](https://…/detalhe_evento?…)` | **200 aceito** |

Regra: URL sempre dentro de `[rótulo](url)`, e texto vindo de fonte externa
(título, local, preço) passa por `mdSafe()` antes de entrar na mensagem.

## Confirmadas sem eventos da região

Endpoint real localizado, busca respondeu, nenhum evento de Franca/região:
Ticket360 (`/eventos/pesquisar?s=`), Ticket Fácil (`/search.html?q=`),
Bilheteria Digital (`/busca/franca/as/1`), Uhuu (`/busca?termo=`),
Bilheteria Express (`/agendas/`), BaladApp
(`/?search=`), Ingresso Nacional (`/api/paginas/eventos.php`), Venda Ingresso,
Meu Bilhete, Total Acesso, Ingresse, Quero Ingresso,
TicketMais, Alô Ingressos, Eventbrite.

> **2026-10-29:** Clube do Ingresso saiu desta lista — tem evento de Franca
> (Teatro Municipal) e de Ribeirão. Ticket360 passou a responder 404 na busca.
> Ver `docs/pesquisa-2026-10-29.md`.

## Sem resposta

| Plataforma | Problema |
|---|---|
| Eventim | timeout em toda tentativa |
| Ticketmaker (BR) | catch-all: toda URL devolve a home, sem endpoint de busca localizado |
| Ticket Club / Brasil Ticket | conexão recusada |
| Songkick | 406 em qualquer User-Agent |
| Bandsintown | 403 |

## Redes sociais

| Rede | Situação |
|---|---|
| Reddit | 403 no `.json` e no subreddit |
| Bluesky | 403 na API pública |
| Facebook | 200, sem nome de evento no HTML |
| Twitter / X | exige auth; Nitter devolve vazio |
| Mastodon | API aberta e funcional, sem nada de Franca |
| Instagram | sem API; indireto via Google News `site:instagram.com` |

## Descartadas na rodada de 2026-10

- **Eventbrite**: páginas `/d/brazil--<cidade>/events/` devolvem lista genérica global (mesmos 16 eventos, online/exterior) - inútil.
- **Ticketmaker**: ver tabela acima.
- **SESI-SP**, prefeituras de Batatais/Ituverava: HTML de notícias, sem agenda estruturada.

