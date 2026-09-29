import { afterEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bun já carregou o .env antes deste preload: neutraliza tudo que alcançaria
// o mundo real (banco em disco, bot de verdade, LiteLLM do cluster).
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "role-radar-")), "t.db");
process.env.TELEGRAM_BOT_TOKEN = "";
process.env.TELEGRAM_CHAT_IDS = "";
process.env.AI_PROVIDER = "litellm";
process.env.LITELLM_BASE_URL = "http://llm.test/v1";
process.env.GEOCODE_MAX = "0";

// Import dinâmico: env.ts precisa ler o process.env já neutralizado acima.
const { env } = await import("../src/config/env.ts");
const envInicial = { ...env };
const fetchOriginal = globalThis.fetch;

// Hook de preload vale para todos os arquivos: nenhum teste herda o stub de
// fetch ou o env mexido por outro.
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  Object.assign(env, envInicial);
});
