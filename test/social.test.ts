import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { db } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import {
  parseExtraFeeds,
  parseTelegramChannel,
} from "../src/sources/social.ts";
import { stubFetch } from "./fetch.ts";

beforeEach(() => db.exec("DELETE FROM items;"));

test("EXTRA_FEEDS expande atalhos e recusa alvo inválido sem derrubar os demais", () => {
  const feeds = parseExtraFeeds(
    [
      "Casa X=bsky:casax.bsky.social",
      "Sesc=yt:UCFa9HoqA-7evizR7SB3JDyg",
      "Bar=tg:agenda_bar",
      "Bridge=https://bridge.example/?action=display&bridge=Instagram&u=casa",
      "https://blog.example/feed.xml",
      "Ruim=bsky:../../etc",
      "Js=javascript:alert(1)",
      "Arquivo=file:///etc/passwd",
      "yt:curto",
    ].join(";"),
  );
  expect(feeds.map((f) => [f.name, f.url])).toEqual([
    ["Casa X", "https://bsky.app/profile/casax.bsky.social/rss"],
    [
      "Sesc",
      "https://www.youtube.com/feeds/videos.xml?channel_id=UCFa9HoqA-7evizR7SB3JDyg",
    ],
    ["Bar", "https://t.me/s/agenda_bar"],
    [
      "Bridge",
      "https://bridge.example/?action=display&bridge=Instagram&u=casa",
    ],
    ["https://blog.example/feed.xml", "https://blog.example/feed.xml"],
  ]);
  expect(parseExtraFeeds("")).toEqual([]);
});

const post = (id: number, texto: string, quando: string) => `
<div class="tgme_widget_message_wrap js-widget_message_wrap">
 <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="agenda_bar/${id}">
  <div class="tgme_widget_message_text js-message_text" dir="auto">${texto}</div>
  <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/agenda_bar/${id}"><time datetime="${quando}" class="time">10:00</time></a></div>
 </div>
</div>`;

test("canal do Telegram: texto, link e data de cada post; post sem texto é ignorado", () => {
  const html =
    post(
      1,
      "Sexta tem <b>Samba</b> às 21h<br/>Entrada R$ 20 &amp; drink",
      "2026-11-06T13:00:00+00:00",
    ) +
    `<div class="tgme_widget_message_wrap"><a class="tgme_widget_message_date" href="https://t.me/agenda_bar/2"><time datetime="2026-11-07T10:00:00+00:00"></time></a></div>` +
    post(3, "Sábado: Rock", "2026-11-07T13:00:00+00:00");
  const items = parseTelegramChannel(html);
  expect(items.map((i) => i.link)).toEqual([
    "https://t.me/agenda_bar/1",
    "https://t.me/agenda_bar/3",
  ]);
  expect(items[0].title).toBe("Sexta tem Samba às 21h");
  expect(items[0].contentSnippet).toContain("Entrada R$ 20 & drink");
  expect(items[0].isoDate).toBe("2026-11-06T13:00:00+00:00");
  expect(parseTelegramChannel("<html>sem posts</html>")).toEqual([]);
});

test("ingest lê canal do Telegram e RSS do Bluesky vindos de EXTRA_FEEDS", async () => {
  env.extraFeeds = "Bar=tg:agenda_bar;Casa=bsky:casax.bsky.social";
  stubFetch(async (url) => {
    if (url === "https://t.me/s/agenda_bar")
      return new Response(
        post(9, "Sexta: Samba 06/11 às 21h", "2026-11-04T13:00:00+00:00"),
      );
    if (url.includes("bsky.app/profile/casax"))
      return new Response(
        `<rss version="2.0"><channel><title>Casa</title><item><title>Noite do Rock 07/11</title><link>https://bsky.app/profile/casax/post/1</link><description>Noite do Rock 07/11 às 22h</description></item></channel></rss>`,
      );
    return new Response("", { status: 404 });
  });
  await ingest();
  const rows = db
    .query(
      "SELECT source, link FROM items WHERE source IN ('Bar','Casa') ORDER BY source",
    )
    .all() as { source: string; link: string }[];
  expect(rows).toEqual([
    { source: "Bar", link: "https://t.me/agenda_bar/9" },
    { source: "Casa", link: "https://bsky.app/profile/casax/post/1" },
  ]);
});
