# Bilheterias — planilha de validação

Rastreio de quais plataformas de ingresso têm eventos de **Franca-SP e região**.

> **Leia antes de confiar em qualquer linha "sem Franca":** a varredura automática
> **chuta a URL de busca** de cada site. Quando o site é SPA, a URL chutada devolve
> só o esqueleto HTML — nenhum evento aparece e a conclusão sai errada. Foi assim
> que a Mega Bilheteria foi marcada como "sem Franca" indevidamente: a busca real
> dela é uma API que não tem nada a ver com a URL testada.

## Como validar (receita que resolveu a Mega Bilheteria)

1. Abra o site, **F12 → aba Network → filtro Fetch/XHR**.
2. Use a busca do próprio site (digite "Franca", escolha a cidade no seletor).
3. Olhe a requisição que aparece: essa é a API real. Copie a URL completa.
4. Cole na coluna **Endpoint real** da tabela.

Exemplo resolvido:

```
GET https://web.megabilheteria.com/api/public/v2/events?size=15&name=franca&page=1
```

Detalhe achado nessa API: **nenhum** parâmetro de cidade funciona (`city`,
`cityName`, `city_path`, `state`, `uf` — todos são ignorados e devolvem o
catálogo inteiro). O que funciona é `name=franca` (casa cidade e nome) ou
paginar tudo (~230 eventos, 3 páginas de 100) e filtrar pelo campo `city` de
cada item. A integração usa a segunda opção, que não depende de o filtro existir.

## Integradas

| Plataforma | Como entra | Observação |
|---|---|---|
| Sympla | página por cidade, payload RSC | páginas 2+ das cidades pequenas não têm nada exclusivo |
| Duoticket | home + página de cada evento | local/horário/título completo só existem no detalhe |
| Evento ON (vitrine da Q2) | `/cidade/franca-sp` | vende p/ Morada du Capiau, Teatro Municipal, Villa, Royal |
| Mega Bilheteria | API pública v2, catálogo inteiro | **achada por você**; hoje 1 evento em Franca |
| Ingresso.com | API de conteúdo | filmes em cartaz + estreias, com trailer e pôster |
| Sesc Franca | API de atividades | |
| Prefeitura (turismo) | HTML da agenda oficial | |
| Franca Basquete | tabela de jogos | só mando de quadra; fora de temporada devolve 0 |
| Franca Shopping | HTML de eventos | temporadas longas: circo, parque, exposição |

## A validar — suspeitas ALTAS (resposta pequena demais = provável SPA)

Estas devolveram HTTP 200 com corpo minúsculo, ou seja, o robô viu só o
esqueleto da página. **Mesmo sintoma da Mega Bilheteria.** São as mais prováveis
de estarem erradas.

| Plataforma | URL que testei | Resposta | Endpoint real (preencher) | Tem Franca? |
|---|---|---|---|---|
| Blueticket | `blueticket.com.br/busca?q=franca` | 200, 3 KB | | |
| Ingresso Nacional | `ingressonacional.com.br/?s=franca` | 200, 5 KB | | |
| GuicheWeb | `guicheweb.com.br/busca?termo=franca` | 200, 10 KB | | |
| Q2 Ingressos | `q2ingressos.com.br/api/events` | 200, mas é HTML de SPA | | via Evento ON |
| OTicket | `oticket.com.br/eventos` | 200, RSC do Next | | "Franca" no HTML é o endereço da empresa |

## A validar — suspeitas MÉDIAS (rota chutada deu 404)

O 404 pode significar "não existe evento" ou simplesmente "a rota de busca tem
outro nome". Não dá pra concluir nada.

| Plataforma | URL que testei | Resposta | Endpoint real (preencher) | Tem Franca? |
|---|---|---|---|---|
| Ticket360 | `/busca?busca=franca` e `/api/eventos?cidade=franca` | 404 | | |
| Ingresso Digital | `/busca?q=franca` | 404 | | |
| Venda Ingresso | `/busca/franca` | 404 | | |
| Ticket Fácil | `/busca?q=franca` | 404 | | |
| Bilheteria Digital | `/eventos/franca` | 404 | | |
| BaladApp | `/franca-sp` | 404 | | |
| Uhuu (API) | `api.uhuu.com/v1/events?search=franca` | 404 | | |

## A validar — suspeitas BAIXAS (página cheia veio e não citou Franca)

Aqui o corpo veio grande de verdade e mesmo assim não apareceu "Franca". É o
grupo mais confiável, mas ainda vale conferir o seletor de cidade do site.

| Plataforma | URL que testei | Resposta | Tem Franca? |
|---|---|---|---|
| Clube do Ingresso | `/busca?q=franca` | 200, 817 KB | |
| Bilheteria Express | `/?s=franca` | 200, 292 KB | |
| Meu Bilhete | `/eventos?busca=franca` | 200, 201 KB | |
| Total Acesso | `/busca?q=franca` | 200, 40 KB | |
| Uhuu | `/busca?q=franca` | 200, 51 KB | |
| Ingresse | `/busca?q=franca` | 200, 36 KB | |
| Quero Ingresso | `/eventos/franca-sp` | 200, 27 KB | |
| TicketMais | home | 200 | |
| Alô Ingressos | home | 200 | |
| Eventbrite | `/d/brazil--franca/` | JSON-LD é de eventos globais | não |

## Sem resposta

| Plataforma | Problema |
|---|---|
| Eventim | timeout em toda tentativa |
| Ticket Club | conexão recusada |
| Brasil Ticket | conexão recusada |
| Songkick | 406 em qualquer User-Agent |
| Bandsintown | 403 |

## Redes sociais (todas inviáveis hoje)

| Rede | Situação |
|---|---|
| Reddit | 403 no `.json` e no subreddit, qualquer User-Agent |
| Bluesky | 403 no `public.api.bsky.app` |
| Facebook | `/events/explore/...` responde 200 sem nome de evento no HTML |
| Twitter/X | exige auth; Nitter devolve corpo vazio |
| Mastodon | API aberta e funcional, mas sem nada de Franca |
| Instagram | sem API pública; cobertura indireta via Google News `site:instagram.com` |
