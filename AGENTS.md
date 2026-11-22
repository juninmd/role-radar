# AGENTS.md

Rolê Radar: a Bun + TypeScript service that collects shows, festivals, theatre, stand-up, cinema and attractions in
Franca-SP and Ribeirão Preto-SP (up to ~100 km), dedupes them in SQLite, curates them with an OpenAI-compatible model,
and delivers a daily Telegram digest plus a web dashboard that reads the same database. User-facing text is pt-BR.

## Stack

- Bun runtime (`bun:sqlite`, `Bun.serve`), TypeScript with `strict: true` (`tsconfig.json`)
- SQLite for storage and dedupe (`src/db.ts`); curation through an OpenAI-compatible endpoint (`src/ai.ts`, e.g. a LiteLLM proxy)
- Telegram delivery (`src/telegram.ts`, `src/bot.ts`); dashboard in `public/` (vanilla JS/CSS, Leaflet map)
- Biome for lint and format (`biome.json`, recommended rules, 2-space indent); `bun test` for tests
- Docker image `oven/bun:1-slim`, runs as a non-root user (uid 10001)

## Commands

```sh
bun install                 # lockfile: bun.lock; the Docker build uses --frozen-lockfile
bun run dev                 # one cycle: collect + digest
bun run ingest              # collect only
bun run digest              # send the digest only
bun run serve               # dashboard on http://localhost:3000
bun test                    # tests (network and Telegram are mocked)
bun run typecheck           # tsc --noEmit
bun run lint                # biome check --write . (writes fixes; see Gotchas)
bun run bench               # catalog benchmark, DB at /tmp/role-radar-bench.db
```

## Structure

- `src/index.ts`: entry point; flags `--loop`, `--ingest`, `--digest`, `--serve`
- `src/sources/`: one scraper per site or feed (ticket sellers, venues, Google News queries, RSS, public social profiles)
- `src/ingest.ts`, `src/extract.ts`, `src/job-guard.ts`: collection pipeline, date/place/price extraction, job guard
- `src/db.ts`: SQLite schema and dedupe (canonical title + date identify an event; seasons and festivals collapse)
- `src/ai.ts`, `src/digest.ts`, `src/telegram.ts`, `src/bot.ts`: curation, digest, Telegram
- `src/web/`: dashboard server, store, catalog, classification, geocoding, places, ICS export
- `src/config/`: `env.ts` (environment), `region.ts` (cities and radius), `topic.ts`
- `public/`: dashboard assets (`js/`, `css/`); `test/`: `bun test` suites with preload `test/setup.ts`
- `docs/`: source research (`bilheterias.md`, `pesquisa-*.md`), README screenshots, prints
- `.github/pr-evidence/`: screenshots attached to PRs

## Conventions

- Copy in the UI, README and digest is pt-BR; code, identifiers and comments follow the existing files.
- Configuration comes only from environment variables. Document every new variable in `.env.example` (names and comments, never values).
- Every source in `src/sources/` has a test in `test/` that mocks the network (all 38 do today); no test calls a live site or Telegram.
- Lint and format with Biome before a PR. Keep the `recommended` preset.

## Gotchas

- `bun run lint` runs `biome check --write .`, so it rewrites files. For a read-only check run `bunx biome check .`.
- Never commit `.env` (gitignored). Environment variables that carry secrets: `LITELLM_API_KEY`, `TELEGRAM_BOT_TOKEN`.
  Telegram chat ids (`TELEGRAM_CHAT_IDS`) are personal data; keep them out of logs and fixtures.
- Instagram, Facebook and X require login and are not scraped; `EXTRA_FEEDS` only takes public profiles.
- The dashboard and the collection job share one SQLite file (`DB_PATH`). The cron skips a run while the previous one is still going (`semSobreposicao` in `src/job-guard.ts`); wrap any new scheduled job in it.
- The Docker image sets `DB_PATH=/data/store.db`; make sure the runtime user can write to that path before shipping a change to storage.

<!-- base-actions-main-policy -->
## GitHub Actions — padrão obrigatório (@main)

- Referencie as actions internas sempre pelo branch, nunca por SHA:
  - `uses: juninmd/base-actions/<action>@main`
  - `uses: juninmd/base-actions/.github/workflows/<arquivo>.yml@main`
- Não fixe `@<sha>` em `juninmd/base-actions`: a atualização é centralizada no
  `main` e passa a valer no próximo run.
- PRs cujos checks não iniciam por billing/spending limit são mesclados pelo bot central
  `juninmd/base-actions/.github/workflows/auto-merge-billing-blocked.yml`.
  Para impedir o merge automático de um PR, aplique a label `do-not-merge`.