import { createHash } from "node:crypto";
import Parser from "rss-parser";
import { env } from "./config/env.ts";
import { topic } from "./config/topic.ts";
import { insertItem } from "./db.ts";

const parser = new Parser({
  timeout: env.feedTimeoutMs,
  customFields: { item: [["media:content", "media"]] },
});

const itemImage = (it: Record<string, unknown>): string | null => {
  const enclosure = it.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && (enclosure.type ?? "").startsWith("image"))
    return enclosure.url;
  const media = it.media as { $?: { url?: string } } | undefined;
  return media?.$?.url ?? null;
};

const hash = (s: string) => createHash("sha1").update(s).digest("hex");
const clean = (s?: string) =>
  (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

/** Fetch every configured feed, store new items. Returns count of new items. */
export async function ingest(): Promise<number> {
  let added = 0;
  const now = new Date().toISOString();

  const results = await Promise.allSettled(
    topic.feeds.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      const items = (parsed.items ?? []).slice(0, env.maxItemsPerFeed);
      let feedAdded = 0;
      for (const it of items) {
        const link = it.link ?? "";
        if (!link || !it.title) continue;
        const isNew = insertItem({
          id: hash(link),
          title: it.title.trim(),
          link,
          source: feed.name,
          summary: clean(it.contentSnippet ?? it.content),
          published: it.isoDate ?? it.pubDate ?? null,
          image: itemImage(it as unknown as Record<string, unknown>),
          fetched_at: now,
        });
        if (isNew) feedAdded++;
      }
      return { name: feed.name, feedAdded };
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      added += r.value.feedAdded;
      if (r.value.feedAdded)
        console.log(`  + ${r.value.feedAdded} de ${r.value.name}`);
    } else {
      console.warn(`  ! feed falhou: ${r.reason}`);
    }
  }
  console.log(`[ingest] ${added} itens novos`);
  return added;
}
