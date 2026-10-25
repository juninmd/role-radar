import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db, eventsOn, upsertEvent } from "../src/db.ts";
import { digest, falhasDaRodada } from "../src/digest.ts";
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

// Sem o cabeçalho confirmado, o evento de fora ficaria sem contexto de região:
// precisa esperar a próxima rodada, com o cabeçalho.
test("evento de fora não sai se o cabeçalho de fora falhou", async () => {
  db.exec("DELETE FROM events;");
  evento("Show Longe", today, "Ribeirão Preto");
  rede((body) => body.includes("Fora de Franca"));
  await digest();
  expect(eventsOn(today)[0]?.posted_today).toBe(0);
});

test("evento futuro novo é anunciado imediatamente como novo rolê e marcado como posted_launch", async () => {
  db.exec("DELETE FROM events;");
  evento("Mega Show Futuro", "2026-12-31", "Franca");

  const sentBodies: string[] = [];
  stubFetch(async (url, init) => {
    if (!url.startsWith("https://api.telegram.org/"))
      return new Response("", { status: 404 });
    sentBodies.push(String(init?.body));
    return json({ ok: true });
  });

  await digest();

  const launchMsg = sentBodies.find(
    (b) => b.includes("NOVO ROLÊ EM FRANCA") && b.includes("Mega Show Futuro"),
  );
  expect(launchMsg).toBeDefined();

  const row = db
    .query<{ posted_launch: number; posted_today: number }, [string]>(
      "SELECT posted_launch, posted_today FROM events WHERE title = ?",
    )
    .get("Mega Show Futuro");
  expect(row?.posted_launch).toBe(1);
  expect(row?.posted_today).toBe(0);

  // Rodada seguinte não relança o evento
  sentBodies.length = 0;
  await digest();
  const relancado = sentBodies.find((b) => b.includes("Mega Show Futuro"));
  expect(relancado).toBeUndefined();
});

test("evento futuro na região recebe selo de região e cabeçalho de fora", async () => {
  db.exec("DELETE FROM events;");
  evento("Réveillon BBQ Select", "2026-12-31", "Rifaina");

  const sentBodies: string[] = [];
  stubFetch(async (url, init) => {
    if (!url.startsWith("https://api.telegram.org/"))
      return new Response("", { status: 404 });
    sentBodies.push(String(init?.body));
    return json({ ok: true });
  });

  await digest();

  const launchMsg = sentBodies.find(
    (b) =>
      b.includes("NOVO ROLÊ NA REGIÃO") && b.includes("Réveillon BBQ Select"),
  );
  expect(launchMsg).toBeDefined();

  const row = db
    .query<{ posted_launch: number }, [string]>(
      "SELECT posted_launch FROM events WHERE title = ?",
    )
    .get("Réveillon BBQ Select");
  expect(row?.posted_launch).toBe(1);
});

// Falha de fonte some em silêncio se o allSettled descartar o motivo: conta e registra.
test("falhasDaRodada conta as fontes que falharam", () => {
  const erro = console.error;
  console.error = () => {};
  try {
    expect(
      falhasDaRodada([
        { status: "fulfilled", value: 1 },
        { status: "rejected", reason: new Error("fonte X") },
      ]),
    ).toBe(1);
  } finally {
    console.error = erro;
  }
});
