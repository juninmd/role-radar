import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { sendTelegram, sendTelegramPhoto } from "../src/telegram.ts";
import { json, stubFetch } from "./fetch.ts";

beforeEach(() => {
  env.telegramToken = "t";
  env.telegramChatIds = ["1"];
});

test("429 espera o retry_after e reenvia em vez de perder a mensagem", async () => {
  let n = 0;
  const calls = stubFetch(async () =>
    n++ === 0
      ? json({ ok: false, parameters: { retry_after: 0 } }, 429)
      : json({ ok: true }),
  );
  expect(await sendTelegram("oi")).toBe(true);
  expect(calls).toHaveLength(2);
});

test("falha definitiva é reportada a quem chamou", async () => {
  stubFetch(async () => json({ ok: false }, 500));
  expect(await sendTelegram("oi")).toBe(false);
});

test("erro de rede vira falha reportada, não exceção", async () => {
  stubFetch(async () => {
    throw new TypeError("ECONNRESET");
  });
  expect(await sendTelegram("oi")).toBe(false);
});

test("foto que não sai por nenhum fallback é reportada", async () => {
  stubFetch(async () => json({ ok: false }, 500));
  expect(await sendTelegramPhoto("oi", "https://img.test/a.jpg")).toBe(false);
});

test("foto entregue é reportada", async () => {
  stubFetch(async () => json({ ok: true }));
  expect(await sendTelegramPhoto("oi", "https://img.test/a.jpg")).toBe(true);
});

test("mensagem e foto enviam reply_markup com inline_keyboard quando botões são fornecidos", async () => {
  const payloads: Record<string, unknown>[] = [];
  stubFetch(async (_url, init) => {
    payloads.push(JSON.parse(String(init?.body)));
    return json({ ok: true });
  });

  const buttons = [
    [
      { text: "🎟️ Ingressos", url: "https://ingressos.test" },
      { text: "📍 Maps", url: "https://maps.test" },
    ],
  ];

  await sendTelegram("texto com botão", buttons);
  await sendTelegramPhoto("foto com botão", "https://img.test/a.jpg", buttons);

  expect(payloads[0].reply_markup).toEqual({ inline_keyboard: buttons });
  expect(payloads[1].reply_markup).toEqual({ inline_keyboard: buttons });
});

// Upload de foto baixa a imagem no próprio servidor: host interno não pode ser
// buscado, e corpo acima do teto não pode entrar inteiro na memória.
test("fallback de upload não busca imagem de host interno", async () => {
  const hits: string[] = [];
  stubFetch(async (url) => {
    hits.push(url);
    if (url.startsWith("https://api.telegram.org/"))
      return json({ ok: false }, 400);
    return new Response(new Uint8Array(100), { status: 200 });
  });
  expect(await sendTelegramPhoto("oi", "http://127.0.0.1/a.jpg")).toBe(false);
  expect(hits.some((u) => u.includes("127.0.0.1"))).toBe(false);
});

test("imagem acima do teto de upload não é lida inteira", async () => {
  const mb = new Uint8Array(1024 * 1024);
  let pulled = 0;
  stubFetch(async (url) => {
    if (url.startsWith("https://api.telegram.org/"))
      return json({ ok: false }, 400);
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulled >= 40) return controller.close();
          pulled++;
          controller.enqueue(mb);
        },
      }),
    );
  });
  await sendTelegramPhoto("oi", "https://img.test/grande.jpg");
  expect(pulled).toBeLessThan(15);
});

test("linha maior que o teto é quebrada, nenhuma mensagem passa de 4096", async () => {
  const sent: string[] = [];
  stubFetch(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)).text);
    return json({ ok: true });
  });
  const longa = "x".repeat(9000);
  expect(await sendTelegram(`inicio\n${longa}\nfim`)).toBe(true);
  expect(Math.max(...sent.map((t) => t.length))).toBeLessThanOrEqual(4096);
  expect(sent.join("").replace(/\n/g, "")).toBe(`inicio${longa}fim`);
});

test("corte de linha longa não separa emoji (par surrogate) entre mensagens", async () => {
  const sent: string[] = [];
  stubFetch(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)).text);
    return json({ ok: true });
  });
  await sendTelegram("😀".repeat(3000));
  const soSurrogate = /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/;
  expect(Math.max(...sent.map((t) => t.length))).toBeLessThanOrEqual(4096);
  expect(sent.some((t) => soSurrogate.test(t))).toBe(false);
  expect(sent.join("").replace(/\n/g, "")).toBe("😀".repeat(3000));
});

test("chamada à Bot API tem prazo de resposta", async () => {
  let signal: AbortSignal | undefined;
  stubFetch(async (_url, init) => {
    signal = init?.signal ?? undefined;
    return json({ ok: true });
  });
  await sendTelegram("oi");
  expect(signal).toBeInstanceOf(AbortSignal);
});
