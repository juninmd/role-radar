import { env } from "./config/env.ts";
import { readCapped } from "./sources/public-url.ts";

/** Single-shot chat completion via LiteLLM. Returns plain text. */
// Completion de texto é curta; o teto só corta resposta anômala.
const MAX_REPLY = 5_000_000;
// Erro do provedor vai para a mensagem e para o log: o início basta.
const MAX_ERROR = 1_000;
// Teto de saída por chamada: a conta sai do output.
// 2048 não bastava: o pool cloud/auto tem modelos de raciocínio que gastam o
// orçamento em reasoning_content antes do JSON, que voltava cortado ou vazio
// (medido no evo-agent: 800 e 1500 viravam só raciocínio).
const MAX_OUTPUT_TOKENS = env.aiMaxTokens;

// Só LiteLLM: o proxy do cluster escolhe o modelo, faz fallback e guarda as chaves.
export async function chat(system: string, user: string): Promise<string> {
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
