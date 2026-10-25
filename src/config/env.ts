// Bun carrega .env automaticamente — sem dotenv.
// "abc" dá NaN, e NaN em slice() esvazia a rodada sem erro: cai no padrão.
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : d;
};

export const env = {
  aiProvider: (process.env.AI_PROVIDER || "litellm") as
    | "litellm"
    | "ollama"
    | "openai"
    | "anthropic"
    | "google",
  litellmBaseUrl:
    process.env.LITELLM_BASE_URL ??
    "http://litellm.ai.svc.cluster.local:4000/v1",
  litellmKey: process.env.LITELLM_API_KEY ?? "",
  litellmModel: process.env.LITELLM_MODEL ?? "cloud/auto",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
  ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
  geminiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",

  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatIds: (process.env.TELEGRAM_CHAT_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  cronIngestion: process.env.CRON_INGESTION ?? "*/30 * * * *",
  // PORT vazia cai no padrão: Number("") é 0, e a porta 0 é escolhida pelo SO.
  port: num(process.env.PORT, 3000),
  cronDigest: process.env.CRON_DIGEST ?? "0 11 * * *",

  dbPath: process.env.DB_PATH ?? "./data/store.db",
  maxItemsPerFeed: num(process.env.MAX_ITEMS_PER_FEED, 20),
  // Teto de itens enviados à IA por digest (em lotes paralelos, não numa call).
  digestMaxItems: num(process.env.DIGEST_MAX_ITEMS, 120),
  feedTimeoutMs: num(process.env.FEED_TIMEOUT_MS, 12000),
  // Provider travado não pode pendurar o digest inteiro (CronJob).
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 60000),
  // Locais geocodificados por rodada (Nominatim: 1 req/s) — 0 desliga.
  geocodeMax: num(process.env.GEOCODE_MAX, 25),
  // Matérias abertas por rodada para ler o corpo (o RSS só traz a manchete).
  articleMax: num(process.env.ARTICLE_MAX, 40),
  // Google News por IPv6 (o IPv4 do cluster leva 429) — exige hostNetwork.
  googleIpv6: process.env.GOOGLE_IPV6 === "1",
};
