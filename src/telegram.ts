import { env } from "./config/env.ts";

/** Send a Markdown message to every configured chat. No-op if unconfigured. */
export async function sendTelegram(text: string): Promise<void> {
  if (!env.telegramToken || !env.telegramChatIds.length) {
    console.log("[telegram] não configurado — imprimindo no console:\n");
    console.log(text);
    return;
  }
  for (const chatId of env.telegramChatIds) {
    for (const chunk of split(text, 3800)) {
      const res = await fetch(
        `https://api.telegram.org/bot${env.telegramToken}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok)
        console.error(`[telegram] ${res.status}: ${await res.text()}`);
    }
  }
}

function split(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if (buf.length + line.length + 1 > max) {
      out.push(buf);
      buf = "";
    }
    buf += `${line}\n`;
  }
  if (buf) out.push(buf);
  return out;
}
