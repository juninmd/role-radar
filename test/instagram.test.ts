import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import { instagramFeeds } from "../src/sources/instagram.ts";
import { json, stubFetch } from "./fetch.ts";

const TOKEN = "SEGREDO-TOKEN-123";

beforeEach(() => db.exec("DELETE FROM items;"));

function configura(accounts: string) {
  env.igUserId = "1784";
  env.igToken = TOKEN;
  env.igAccounts = accounts;
}

test("sem token ou id a fonte fica desligada", () => {
  env.igUserId = "";
  env.igToken = "";
  env.igAccounts = "casa.show";
  expect(instagramFeeds()).toEqual([]);
  env.igUserId = "1784";
  expect(instagramFeeds()).toEqual([]);
});

test("contas válidas viram feeds; @ é removido e entrada suspeita é ignorada", () => {
  configura("@casa.show, bar_x ; ../etc/passwd, b$c, ");
  expect(instagramFeeds().map((f) => f.url)).toEqual([
    "ig:casa.show",
    "ig:bar_x",
  ]);
});

test("ingest grava posts com legenda e link; post sem legenda ou sem link é ignorado", async () => {
  configura("casa.show");
  const calls = stubFetch(async (url) => {
    if (url.startsWith("https://graph.facebook.com/"))
      return json({
        business_discovery: {
          media: {
            data: [
              {
                caption: "Sexta tem Samba!\nDia 06/11 às 21h",
                timestamp: "2026-11-04T13:00:00+0000",
                permalink: "https://www.instagram.com/p/AAA/",
              },
              { caption: "", permalink: "https://www.instagram.com/p/BBB/" },
              { caption: "sem link" },
            ],
          },
        },
        id: "1784",
      });
    return new Response("", { status: 404 });
  });
  await ingest();
  const rows = db
    .query(
      "SELECT title, link, source FROM items WHERE source LIKE 'Instagram%'",
    )
    .all();
  expect(rows).toEqual([
    {
      title: "Sexta tem Samba!",
      link: "https://www.instagram.com/p/AAA/",
      source: "Instagram @casa.show",
    },
  ]);
  const graph = calls.find((u) => u.startsWith("https://graph.facebook.com/"));
  expect(graph).toContain("business_discovery.username(casa.show)");
});

test("erro da API não vaza o token no log", async () => {
  configura("casa.show");
  stubFetch(async (url) =>
    url.startsWith("https://graph.facebook.com/")
      ? json({ error: { message: "Invalid OAuth access token." } }, 400)
      : new Response("", { status: 404 }),
  );
  const warns: string[] = [];
  const original = console.warn;
  console.warn = (...a: unknown[]) => warns.push(a.join(" "));
  try {
    await ingest();
  } finally {
    console.warn = original;
  }
  const falha = warns.find((w) => w.includes("Instagram @casa.show"));
  expect(falha).toContain("Invalid OAuth access token");
  expect(warns.join("\n")).not.toContain(TOKEN);
});
