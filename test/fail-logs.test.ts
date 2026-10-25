import { expect, spyOn, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { syncDuoticket } from "../src/sources/duoticket.ts";
import { sendTelegramPhoto } from "../src/telegram.ts";
import { json, stubFetch } from "./fetch.ts";

// Falha que o código engole precisa aparecer no log: senão some sem rastro.

test("upload de foto bloqueado pelo SSRF é registrado, não some", async () => {
  const { telegramToken, telegramChatIds } = env;
  env.telegramToken = "t";
  env.telegramChatIds = ["1"];
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    stubFetch(async (url) =>
      url.startsWith("https://api.telegram.org/")
        ? json({ ok: false }, 400)
        : new Response(new Uint8Array(100), { status: 200 }),
    );
    await sendTelegramPhoto("oi", "http://127.0.0.1/a.jpg");
    const logged = [...warn.mock.calls, ...error.mock.calls].join("\n");
    expect(logged).toContain("URL não pública");
  } finally {
    env.telegramToken = telegramToken;
    env.telegramChatIds = telegramChatIds;
    warn.mockRestore();
    error.mockRestore();
  }
});

test("detalhe da Duoticket que falha é registrado e o evento sai da mesma forma", async () => {
  const HOME = `<div class="item-listing-container-skrn"><div class="text-name-event"><a href="#">Show Teste</a></div><a href="evento/123/show-teste">x</a><span>11/10/2026</span><i class="fa-map-marker-alt"></i> Franca | Teatro</div>`;
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    stubFetch(async (url) => {
      if (url === "https://duoticket.com.br/") return new Response(HOME);
      throw new Error("detalhe offline");
    });
    const count = await syncDuoticket("2026-10-11");
    expect(count).toBe(1);
    expect(warn.mock.calls.join("\n")).toContain("detalhe offline");
  } finally {
    warn.mockRestore();
  }
});
