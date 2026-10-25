import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { sendTelegramPhoto } from "../src/telegram.ts";
import { json, stubFetch } from "./fetch.ts";

beforeEach(() => {
  env.telegramToken = "t";
  env.telegramChatIds = ["1"];
});

// A legenda corta em 1000 unidades UTF-16: um emoji na divisa sairia com metade
// do par, e a Bot API recusa o texto inválido.
test("legenda cortada na divisa de um emoji não termina com surrogate solto", async () => {
  let enviado = "";
  stubFetch(async (url, init) => {
    if (url.includes("sendPhoto")) enviado = String(init?.body);
    return json({ ok: true });
  });
  const legenda = `${"a".repeat(999)}🎉 resto`;
  await sendTelegramPhoto(legenda, "https://img.test/p.jpg");
  const caption = JSON.parse(enviado).caption as string;
  const soSurrogate =
    /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  expect(soSurrogate.test(caption)).toBe(false);
});
