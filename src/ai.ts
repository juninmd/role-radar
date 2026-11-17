import { env } from "./config/env.ts";
import { readCapped } from "./sources/public-url.ts";

/** Single-shot chat completion across providers. Returns plain text. */
// Completion de texto é curta; o teto só corta resposta anômala.
const MAX_REPLY = 5_000_000;
// Erro do provedor vai para a mensagem e para o log: o início basta.
const MAX_ERROR = 1_000;
// Teto de saída por chamada, igual em todos os provedores: a conta sai do output.
// 2048 não bastava: o pool cloud/auto tem modelos de raciocínio que gastam o
// orçamento em reasoning_content antes do JSON, que voltava cortado ou vazio
// (medido no evo-agent: 800 e 1500 viravam só raciocínio).
const MAX_OUTPUT_TOKENS = env.aiMaxTokens;

export async function chat(system: string, user: string): Promise<string> {
  switch (env.aiProvider) {
    case "anthropic":
      return anthropic(system, user);
    case "google":
      return google(system, user);
    case "litellm":
      return openaiCompatible(
        env.litellmBaseUrl,
        env.litellmKey,
        env.litellmModel,
        system,
        user,
        // Extração não precisa de raciocínio longo; o LiteLLM descarta o
        // parâmetro nos modelos que não o aceitam (drop_params).
        { reasoning_effort: "low" },
      );
    case "openai":
      return openaiCompatible(
        "https://api.openai.com/v1",
        env.openaiKey,
        env.openaiModel,
        system,
        user,
      );
    case "ollama":
      return openaiCompatible(
        env.ollamaBaseUrl,
        "ollama",
        env.ollamaModel,
        system,
        user,
      );
    // Provedor com erro de digitação não pode cair no Ollama em silêncio.
    default:
      throw new Error(`AI_PROVIDER desconhecido: ${env.aiProvider}`);
  }
}

async function openaiCompatible(
  baseUrl: string,
  key: string,
  model: string,
  system: string,
  user: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...extra,
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok)
    throw new Error(`AI ${res.status}: ${await readCapped(res, MAX_ERROR)}`);
  const json = JSON.parse(await readCapped(res, MAX_REPLY)) as {
    choices: { message: { content: string }; finish_reason?: string }[];
  };
  const choice = json.choices?.[0];
  if (choice?.finish_reason === "length")
    console.warn(
      `[ai] resposta cortada no teto de ${MAX_OUTPUT_TOKENS} tokens (AI_MAX_TOKENS)`,
    );
  // Sem "choices" (bloqueio, erro de cota com 200) vira vazio, não TypeError.
  return choice?.message?.content?.trim() ?? "";
}

async function anthropic(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `Anthropic ${res.status}: ${await readCapped(res, MAX_ERROR)}`,
    );
  const json = JSON.parse(await readCapped(res, MAX_REPLY)) as {
    content: { type?: string; text?: string }[];
  };
  // Com raciocínio ligado o primeiro bloco é "thinking", sem texto.
  return (json.content ?? [])
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

async function google(system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": env.geminiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `Gemini ${res.status}: ${await readCapped(res, MAX_ERROR)}`,
    );
  const json = JSON.parse(await readCapped(res, MAX_REPLY)) as {
    candidates: {
      content: { parts: { text?: string; thought?: boolean }[] };
    }[];
  };
  // parts[0] pode ser o raciocínio (thought): junta só o texto da resposta.
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => (p.thought ? "" : (p.text ?? "")))
    .join("")
    .trim();
}
