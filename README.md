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
bun run typecheck
```

## Fallbacks

- IA fora do ar → digest envia lista bruta dos itens.
- Sem `TELEGRAM_BOT_TOKEN` → imprime o digest no console.
- Feed que falha não derruba os demais (`Promise.allSettled`).

## Env

Ver `.env.example`. Principais: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS`, `AI_PROVIDER`, `LITELLM_BASE_URL`/`LITELLM_API_KEY`, `CRON_DIGEST`.

Dentro do cluster use `http://litellm.ai.svc.cluster.local:4000/v1`; de fora, o endpoint externo do LiteLLM (cert self-signed → `NODE_TLS_REJECT_UNAUTHORIZED=0` só em dev).
