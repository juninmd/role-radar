# 🎟️ Rolê Radar — Franca & Ribeirão Preto

Radar de entretenimento em **Franca-SP** e **Ribeirão Preto-SP**: próximos shows, festivais, cinema, séries, teatro, stand-up e atrações — com preço de ingresso quando disponível. RSS → SQLite (dedupe) → curadoria com IA (pt-BR) → digest diário no Telegram.

## Stack

- **Bun** (TypeScript nativo, `bun:sqlite`, `.env` autoload)
- `rss-parser` + `node-cron`
- IA multi-provider via fetch: `litellm` (padrão — proxy do cluster, modelo `cloud/gemma3`) | `ollama` | `openai` | `anthropic` | `google`

## Fontes

Google News RSS por query (shows/eventos Franca, Ribeirão Preto, agenda cultural, teatro/stand-up, ingressos/Sympla, estreias de cinema e séries) + Papelpop. Edite em `src/config/topic.ts`.

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
```

## Dashboard web

`bun run serve` sobe um `Bun.serve` que lê o mesmo SQLite do CronJob — o que o digest diário grava aparece no dash sem deploy novo (a aba aberta recarrega a cada 30 min).

- **Visões:** 📡 Radar (distância real a partir de você, ou "tempo × vibe": fatias por categoria, raio = dias até o rolê), 🗺️ Mapa (Leaflet + tiles OSM escurecidos), 📆 Agenda (heatmap de 30 dias + lista por dia), 🖼️ Galeria, 🎲 Me decide (quiz com quem/vibe/quando/orçamento/distância → ranking com % de match e roleta ponderada) e ⚔️ Duelo ("esse ou esse?" até sobrar um).
- **Filtros:** busca, tipo (eventos, filmes em cartaz, lugares fixos), quando, período, vibe, cidade, preço, distância, ordenação e favoritos. Tudo vai no hash da URL — o link compartilhado abre igual. Favoritos ficam no `localStorage`.
- **Rotas:** `/` (app), `/api/catalog` (JSON), `/health`.
- **Localização:** cidade tem centro fixo (`src/web/places.ts`); o digest geocodifica até `GEOCODE_MAX` locais por rodada no Nominatim (1 req/s, cache em `geocache`). Local não encontrado fica no centro da cidade, marcado como aproximado.
- **Categoria/preço:** palavra-chave e regex em `src/web/classify.ts` (determinístico, sem IA).

## Fallbacks

- IA fora do ar ou travada (`AI_TIMEOUT_MS`) → o lote fica na fila e é reprocessado no próximo digest.
- Telegram falhou (429 é reenviado respeitando `retry_after`) → evento não é marcado como postado; outra rodada no mesmo dia reenvia só o que faltou (blocos já entregues ficam em `digest_runs`).
- Sem `TELEGRAM_BOT_TOKEN` → imprime o digest no console.
- Feed que falha não derruba os demais (`Promise.allSettled`).

## Env

Ver `.env.example`. Principais: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `AI_PROVIDER`, `LITELLM_BASE_URL`/`LITELLM_API_KEY`, `CRON_DIGEST`.

Dentro do cluster use `http://litellm.ai.svc.cluster.local:4000/v1`; de fora, o endpoint externo do LiteLLM (cert self-signed → `NODE_TLS_REJECT_UNAUTHORIZED=0` só em dev).
