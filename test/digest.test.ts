import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db, eventsOn, upsertEvent } from "../src/db.ts";
import { digest } from "../src/digest.ts";
import { json, stubFetch } from "./fetch.ts";

const TZ = "America/Sao_Paulo";
const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
  timeZone: TZ,
});

const evento = (title: string, date: string, city = "Franca") =>
  upsertEvent({
    title,
    date,
    time: "20:00",
    venue: "Teatro Teste",
    city,
    price: null,
    link: null,
    image: null,
  });

/**
 * Toda fonte externa responde 404 (digest só vê o que está no banco); o
 * Telegram responde conforme `falha` decide para cada mensagem.
 */
const rede = (falha: (body: string) => boolean) =>
  stubFetch(async (url, init) => {
    if (!url.startsWith("https://api.telegram.org/"))
      return new Response("", { status: 404 });
    return falha(String(init?.body))
      ? json({ ok: false }, 500)
      : json({ ok: true });
  });

const telegram = (calls: string[]) =>
  calls.filter((u) => u.startsWith("https://api.telegram.org/"));

beforeEach(() => {
  env.telegramToken = "t";
  env.telegramChatIds = ["1"];
  db.exec("DELETE FROM items; DELETE FROM events; DELETE FROM digest_runs;");
  evento("Rolê Teste", today);
  evento("Outro Rolê", tomorrow);
});

test("evento de hoje que não saiu no Telegram não é marcado como postado", async () => {
  rede((body) => body.includes("Rolê Teste"));
  await digest();
  expect(eventsOn(today)[0]?.posted_today).toBe(0);
});

test("segunda rodada no mesmo dia só reenvia o que falhou", async () => {
  rede((body) => body.includes("Rolê Teste"));
  await digest();

  const retry = rede(() => false);
  await digest();
  expect(telegram(retry)).toHaveLength(1);
  expect(eventsOn(today)[0]?.posted_today).toBe(1);

  const terceira = rede(() => false);
  await digest();
  expect(telegram(terceira)).toHaveLength(0);
});

test("queda de rede no meio não perde o registro do que já saiu", async () => {
  stubFetch(async (url, init) => {
    if (!url.startsWith("https://api.telegram.org/"))
      return new Response("", { status: 404 });
    if (String(init?.body).includes("Agenda"))
      throw new TypeError("ECONNRESET");
    return json({ ok: true });
  });
  await digest();
  expect(eventsOn(today)[0]?.posted_today).toBe(1);
});

test("evento de fora reenviado volta com o cabeçalho de fora", async () => {
  db.exec("DELETE FROM events;");
  evento("Show Longe", today, "Ribeirão Preto");
  rede((body) => body.includes("Show Longe"));
  await digest();

  const retry = rede(() => false);
  await digest();
  const bodies = telegram(retry);
  expect(bodies).toHaveLength(2);
  expect(eventsOn(today)[0]?.posted_today).toBe(1);
});
