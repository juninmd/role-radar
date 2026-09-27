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
