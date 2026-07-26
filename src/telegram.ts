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
      let res = await send(chatId, chunk, "Markdown");
      if (res.status === 400) {
        // Markdown malformado vindo da IA — reenvia como texto puro.
        res = await send(chatId, chunk);
      }
      if (!res.ok)
        console.error(`[telegram] ${res.status}: ${await res.text()}`);
    }
  }
}

/**
 * Send a photo album (sendMediaGroup, até 10 fotos). A legenda vai na 1ª foto.
 * Cai para mensagem de texto se o álbum falhar ou não houver fotos.
 */
export async function sendTelegramAlbum(
  caption: string,
  photos: string[],
): Promise<void> {
  const imgs = photos.filter(Boolean).slice(0, 10);
  if (!env.telegramToken || !env.telegramChatIds.length) {
    console.log("[telegram] não configurado — imprimindo no console:\n");
    console.log(`[álbum ${imgs.length} fotos]\n${caption}`);
    return;
  }
  if (!imgs.length) return sendTelegram(caption);

  for (const chatId of env.telegramChatIds) {
    const media = imgs.map((url, i) => ({
      type: "photo",
      media: url,
      ...(i === 0
        ? { caption: caption.slice(0, 1000), parse_mode: "Markdown" }
        : {}),
    }));
    const res = await fetch(
      `https://api.telegram.org/bot${env.telegramToken}/sendMediaGroup`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, media }),
      },
    );
    if (!res.ok) {
      console.warn(`[telegram] sendMediaGroup ${res.status} — fallback texto`);
      let alt = await send(chatId, caption, "Markdown");
      if (alt.status === 400) alt = await send(chatId, caption);
      if (!alt.ok)
        console.error(`[telegram] ${alt.status}: ${await alt.text()}`);
    }
  }
}

/** Send a photo with Markdown caption; falls back to text-only message. */
export async function sendTelegramPhoto(
  caption: string,
  photo: string,
): Promise<void> {
  if (!env.telegramToken || !env.telegramChatIds.length) {
    console.log("[telegram] não configurado — imprimindo no console:\n");
    console.log(`[foto: ${photo}]\n${caption}`);
    return;
  }
  for (const chatId of env.telegramChatIds) {
    // Degrada um problema por vez, preservando o máximo: Markdown -> texto puro
    // (salva legenda com marcação inválida) -> upload dos bytes (salva host que
    // o Telegram não consegue buscar) -> mensagem sem foto.
    let res = await photoPorUrl(chatId, caption, photo, "Markdown");
    if (!res.ok) res = await photoPorUrl(chatId, caption, photo);
    if (!res.ok && (await uploadPhoto(chatId, caption, photo))) continue;
    if (!res.ok) {
      console.warn(`[telegram] sendPhoto ${res.status} — fallback p/ texto`);
      let alt = await send(chatId, caption, "Markdown");
      if (alt.status === 400) alt = await send(chatId, caption);
      if (!alt.ok)
        console.error(`[telegram] ${alt.status}: ${await alt.text()}`);
    }
  }
}

function photoPorUrl(
  chatId: string,
  caption: string,
  photo: string,
  parseMode?: string,
): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.telegramToken}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo,
      caption: caption.slice(0, 1000),
      ...(parseMode ? { parse_mode: parseMode } : {}),
    }),
  });
}

/**
 * Baixa a imagem e envia como multipart. Serve para host que o Telegram não
 * consegue buscar sozinho. Vai sem parse_mode: se chegou aqui, a legenda já
 * falhou como Markdown.
 */
async function uploadPhoto(
  chatId: string,
  caption: string,
  url: string,
): Promise<boolean> {
  try {
    const img = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!img.ok) return false;
    const bytes = await img.arrayBuffer();
    // Teto do Telegram para foto por upload.
    if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) return false;

    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1000));
    form.append(
      "photo",
      new Blob([bytes], { type: "image/jpeg" }),
      url.split("/").pop()?.split("?")[0] || "foto.jpg",
    );
    const res = await fetch(
      `https://api.telegram.org/bot${env.telegramToken}/sendPhoto`,
      { method: "POST", body: form },
    );
    if (res.ok) console.log("[telegram] foto enviada por upload");
    return res.ok;
  } catch {
    return false;
  }
}

function send(
  chatId: string,
  text: string,
  parseMode?: string,
): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${env.telegramToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...(parseMode ? { parse_mode: parseMode } : {}),
      disable_web_page_preview: true,
    }),
  });
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
