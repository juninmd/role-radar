import { env } from "./config/env.ts";
import { readCapped } from "./sources/public-url.ts";

/** Single-shot chat completion across providers. Returns plain text. */
// Completion de texto é curta; o teto só corta resposta anômala.
const MAX_REPLY = 5_000_000;
// Erro do provedor vai para a mensagem e para o log: o início basta.
const MAX_ERROR = 1_000;

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
      );
    case "openai":
      return openaiCompatible(
        "https://api.openai.com/v1",
        env.openaiKey,
        env.openaiModel,
        system,
        user,
      );
    default:
      return openaiCompatible(
        env.ollamaBaseUrl,
        "ollama",
        env.ollamaModel,
        system,
        user,
      );
  }
}

async function openaiCompatible(
  baseUrl: string,
  key: string,
  model: string,
  system: string,
  user: string,
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
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok)
    throw new Error(`AI ${res.status}: ${await readCapped(res, MAX_ERROR)}`);
  const json = JSON.parse(await readCapped(res, MAX_REPLY)) as {
    choices: { message: { content: string } }[];
  };
  return json.choices[0]?.message?.content?.trim() ?? "";
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
      max_tokens: 2048,
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
    content: { text: string }[];
  };
  return json.content[0]?.text?.trim() ?? "";
}

async function google(system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent?key=${env.geminiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
    signal: AbortSignal.timeout(env.aiTimeoutMs),
  });
  if (!res.ok)
    throw new Error(
      `Gemini ${res.status}: ${await readCapped(res, MAX_ERROR)}`,
    );
  const json = JSON.parse(await readCapped(res, MAX_REPLY)) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return json.candidates[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}
