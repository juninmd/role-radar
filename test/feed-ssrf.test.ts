import { beforeEach, expect, test } from "bun:test";
import { env } from "../src/config/env.ts";
import { topic } from "../src/config/topic.ts";
import { ingest } from "../src/ingest.ts";
import { stubFetch } from "./fetch.ts";

beforeEach(() => {
  env.extraFeeds = "";
});

test("feed apontando para IP privado ou loopback é bloqueado pelo SSRF", async () => {
  env.extraFeeds =
    "FeedPrivado=http://127.0.0.1:8080/feed.xml;FeedInterno=http://10.43.0.1/rss";
  // Mesmo sem internet, fetchPublic deve barrar antes de conectar
  const hits: string[] = [];
  stubFetch(async (url) => {
    hits.push(url);
    return new Response("<rss></rss>");
  });

  // Salva feeds originais para isolar o teste
  const originalFeeds = [...topic.feeds];
  topic.feeds = [];
  try {
    const added = await ingest();
    expect(added).toBe(0);
    expect(hits).toHaveLength(0);
  } finally {
    topic.feeds = originalFeeds;
  }
});

test("feed que redireciona para IP privado é bloqueado", async () => {
  env.extraFeeds = "RedirectMalicioso=https://exemplo-publico.com/rss";
  const hits: string[] = [];
  stubFetch(async (url) => {
    hits.push(url);
    return new Response("", {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  });

  const originalFeeds = [...topic.feeds];
  topic.feeds = [];
  try {
    const added = await ingest();
    expect(added).toBe(0);
    expect(hits).toEqual(["https://exemplo-publico.com/rss"]);
  } finally {
    topic.feeds = originalFeeds;
  }
});
