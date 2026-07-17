import { chat } from "./ai.ts";
import { env } from "./config/env.ts";
import { topic } from "./config/topic.ts";
import { markDigested, pendingItems } from "./db.ts";
import { sendTelegram } from "./telegram.ts";

/** Build a pt-BR digest from pending items, send via Telegram, mark them done. */
export async function digest(): Promise<void> {
  const items = pendingItems(env.digestMaxItems);
  if (!items.length) {
    console.log("[digest] nada novo para resumir");
    return;
  }

  const list = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.source}] ${it.title}\n   ${it.summary ?? ""}\n   ${it.link}`,
    )
    .join("\n\n");

  const user = `Itens coletados hoje sobre ${topic.subject}:\n\n${list}\n\nGere o digest diário em português do Brasil.`;

  let body: string;
  try {
    body = await chat(topic.systemPrompt, user);
  } catch (err) {
    console.error(`[digest] IA falhou (${err}) — enviando lista bruta`);
    body = list;
  }

  const date = new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const message = `*${topic.emoji} ${topic.title} — ${date}*\n\n${body}`;

  await sendTelegram(message);
  markDigested(items.map((it) => it.id));
  console.log(`[digest] enviado com ${items.length} itens`);
}
