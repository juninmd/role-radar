# 🎟️ Rolê Radar — Franca & Ribeirão Preto

Radar de entretenimento em **Franca-SP** e **Ribeirão Preto-SP**: próximos shows, festivais, cinema, séries, teatro, stand-up e atrações — com preço de ingresso quando disponível. RSS → SQLite (dedupe) → curadoria com IA (pt-BR) → digest diário no Telegram.

## Stack

- **Bun** (TypeScript nativo, `bun:sqlite`, `.env` autoload)
- `rss-parser` + `node-cron` *(Nota: o `rss-parser` interpreta o XML de feeds após o fetch próprio com descompressão e proteção SSRF via `fetchPublic`; atualização/troca de dependências é avaliada na issue #136)*
- IA via fetch para o proxy **LiteLLM** (API compatível com OpenAI; modelo padrão `cloud/auto`, configurável em `LITELLM_MODEL`)

## Fontes

Bilheterias e agendas estruturadas (ver `docs/bilheterias.md`: Sympla, Q2, SESI-SP Cultura, Clube do Ingresso, CorridasBR e outras) + Google News RSS por query (shows/eventos Franca, Ribeirão Preto, agenda cultural, teatro/stand-up, ingressos/Sympla, estreias de cinema e séries) + Papelpop. Edite em `src/config/topic.ts`.

Além dos feeds, `src/sources/` raspa ~30 bilheterias e agendas (Sympla, OTicket, Q2, Fever, Sesc…) direto para eventos estruturados, e o BolaShow (guia de shows no Bluesky) é a única rede social com feed público sem login — Instagram, Facebook e X exigem sessão. A região vai até ~100 km de Franca (`src/config/region.ts`, incl. Uberaba-MG). Mapa do que foi testado e descartado: `docs/pesquisa-fontes-eventos.md`.

**Bilheterias reconhecidas (`VENDAS`):**
O radar identifica automaticamente o ponto de venda a partir do domínio do link (exibindo selo `🎫 Vendas: <Nome>` no card):
- Sympla (`sympla.com.br`)
- Q2 Ingressos (`q2ingressos.com.br` / `quero2ingressos.com.br`)
- Evento ON (`eventoon.com.br`)
- Zig (`zig.tickets`)
- Duoticket (`duoticket.com.br`)
- OTicket (`oticket.com.br`)
- Guichê Web (`guicheweb.com.br`)
- Articket (`articket.com.br`)
- Mega Bilheteria (`megabilheteria.com`)
- Blueticket (`blueticket.com.br`)
- Ingresso Digital (`ingressodigital.com`)
- Ingresso Nacional (`ingressonacional.com.br`)
- Minha Entrada (`minhaentrada.com.br`)
- Bilheteria Express (`bilheteriaexpress.com.br`)
- Bilheteria Digital (`bilheteriadigital.com`)
- Clube do Ingresso (`clubedoingresso.com`)
- Uhuu (`uhuu.com`)
- Ingresso.com (`ingresso.com`)
- Sesc (`sescsp.org.br`)
- SESI-SP (`sesisp.org.br`)
- CorridasBR (`corridasbr.com.br`)
- Theatro Pedro II (`theatropedro2.com.br`)

**Redes sociais e Feeds Extras (`EXTRA_FEEDS`):**
A variável `EXTRA_FEEDS` aceita múltiplos perfis ou feeds no formato `Nome=alvo`, separados por ponto-e-vírgula (`;`):
- Bluesky: `bsky:handle` (ex.: `BolaShow=bsky:bolashow.bsky.social`)
- YouTube: `yt:UC...` (ID do canal)
- Telegram: `tg:canal` (lido do portal público `t.me/s/canal`)
- RSS direto: URL completa (ex.: `Bridge=https://meu-rss-bridge.local/?action=display...`)
Todas as requisições passam por validação de host público e proteção anti-SSRF (`fetchPublic`). O texto dos posts passa pela mesma curadoria e extração por IA dos feeds principais.

## Bot Telegram e Comandos

Quando executado no modo `--loop` (`bun start`), o bot realiza long polling via `getUpdates` para chats cadastrados em `TELEGRAM_CHAT_IDS`:
- `/hoje`: Responde com os eventos do dia filtrados pelas preferências do chat.
- `/semana`: Agenda agrupada dos próximos 7 dias.
- `/categoria show|teatro|cinema|...|todas`: Define filtros de categorias desejadas.
- `/silenciar <cidade>`: Alterna o silenciamento de eventos de uma cidade para o chat.
- `/ajuda`: Lista os comandos disponíveis e as preferências atualmente salvas no SQLite.

Notícia com cara de rolê (ou com data) tem a matéria original lida antes da extração: o link do Google News é decodificado para a URL real e o corpo (JSON-LD `articleBody` ou parágrafos de `<article>`) vai pro prompt — é onde ficam data, local e gratuidade. Até `ARTICLE_MAX` matérias por rodada. Se o Google responder 429, a rodada para de consultá-lo e esses itens ficam na fila por até 48h. Com `GOOGLE_IPV6=1` (CronJob com `hostNetwork`) o Google é consultado direto pelo IPv6 do host, que não leva o 429 do IPv4 do cluster; todo link externo só é buscado se o host for público (também em cada redirect).

## Uso

```sh
bun install
cp .env.example .env   # configure tokens
bun run dev      # 1 ciclo: ingest + digest
bun start        # loop com cron (ingest a cada 30min, digest 11h)
bun run ingest   # só coleta
bun run digest   # só envia digest
bun run serve    # dashboard web em http://localhost:3000 (PORT)
bun test         # testes (rede e Telegram mockados)
bun run typecheck
bun run lint     # biome check --write: corrige o que for seguro
```

## Dashboard web

`bun run serve` sobe um `Bun.serve` que lê o mesmo SQLite do CronJob — o que o digest diário grava aparece no dash sem deploy novo (a aba aberta recarrega a cada 30 min).

- **Visões:** 🔎 Explorar (faixa de 14 dias com calor + lista agrupada por dia, em cards com foto ou linhas com miniatura), 🗺️ Mapa (Leaflet + tiles OSM escurecidos, anéis de 10/50/100 km e carrossel de cards) e 🎲 Me decide (sorteio: quiz com quem/vibe/quando/orçamento/distância → ranking com % de match e roleta ponderada; duelo: "esse ou esse?" até sobrar um). Links antigos `#v=radar`, `#v=agenda`, `#v=galeria` e `#v=duelo` abrem na tela equivalente.
- **Filtros:** busca, tipo (eventos, filmes em cartaz, lugares fixos), quando, período, vibe, cidade, preço, distância, ordenação e favoritos. Tudo vai no hash da URL — o link compartilhado abre igual. Favoritos ficam no `localStorage`.
- **Rotas:** `/` (app), `/api/catalog` (JSON), `/agenda.ics` (agenda futura para importar em Google, Apple ou Outlook), `/health`.
- **Localização:** cidade tem centro fixo (`src/web/places.ts`); o digest geocodifica até `GEOCODE_MAX` locais por rodada no Nominatim (1 req/s, cache em `geocache`). Local não encontrado fica no centro da cidade, marcado como aproximado.
- **Categoria/preço:** palavra-chave e regex em `src/web/classify.ts` (determinístico, sem IA).

## Fallbacks

- IA fora do ar ou travada (`AI_TIMEOUT_MS`) → o lote fica na fila e é reprocessado no próximo digest.
- Telegram falhou (429 é reenviado respeitando `retry_after`) → evento não é marcado como postado; outra rodada no mesmo dia reenvia só o que faltou (blocos já entregues ficam em `digest_runs`).
- Sem `TELEGRAM_BOT_TOKEN` → imprime o digest no console.
- Feed que falha não derruba os demais (`Promise.allSettled`).

## Env

Copie `.env.example` para `.env` (o Bun carrega sozinho). Todas as variáveis são opcionais; os padrões vêm de `src/config/env.ts`. Valores numéricos inválidos ou negativos caem no padrão.

| Variável | Padrão | Descrição |
|---|---|---|
| `LITELLM_BASE_URL` | `http://litellm.ai.svc.cluster.local:4000/v1` | endpoint do LiteLLM |
| `LITELLM_API_KEY` | — | chave do LiteLLM |
| `LITELLM_MODEL` | `cloud/auto` | modelo usado na curadoria |
| `TELEGRAM_BOT_TOKEN` | — | sem token, o digest é impresso no console |
| `TELEGRAM_CHAT_IDS` | — | chat ids separados por vírgula |
| `CRON_INGESTION` / `CRON_DIGEST` | `*/30 * * * *` / `0 11 * * *` | agendas do `--loop` (UTC; 11h UTC = 8h BRT) |
| `DB_PATH` | `./data/store.db` | arquivo SQLite |
| `PORT` | `3000` | porta do `bun run serve` |
| `MAX_ITEMS_PER_FEED` | `20` | itens lidos por feed |
| `DIGEST_MAX_ITEMS` | `120` | teto de itens enviados à IA por digest |
| `FEED_TIMEOUT_MS` / `AI_TIMEOUT_MS` | `12000` / `60000` | timeouts de feed e de IA |
| `AI_MAX_TOKENS` | `4096` | teto de tokens de saída por chamada |
| `GEOCODE_MAX` | `25` | locais geocodificados por rodada (`0` desliga) |
| `ARTICLE_MAX` | `40` | matérias abertas por rodada para ler o corpo |
| `EXTRA_FEEDS` | — | perfis públicos extras (ver acima) |
| `GOOGLE_IPV6` | — | `1` consulta o Google News pelo IPv6 do host |

Dentro do cluster use `http://litellm.ai.svc.cluster.local:4000/v1`; de fora, o endpoint externo do LiteLLM (cert self-signed → `NODE_TLS_REJECT_UNAUTHORIZED=0` só em dev).
