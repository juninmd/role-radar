import { expect, test } from "bun:test";
import { createHandler } from "../src/web/server.ts";

// Asset sem ETag é baixado inteiro a cada visita; com ETag, a revisita recebe 304.
test("asset estático tem ETag e revisita com If-None-Match recebe 304 sem corpo", async () => {
  const handler = createHandler();
  const first = await handler(new Request("http://x/js/main.js"));
  expect(first.status).toBe(200);
  const etag = first.headers.get("etag");
  expect(etag).not.toBeNull();
  await first.arrayBuffer();

  const again = await handler(
    new Request("http://x/js/main.js", {
      headers: { "if-none-match": etag ?? "" },
    }),
  );
  expect(again.status).toBe(304);
  expect((await again.arrayBuffer()).byteLength).toBe(0);
});
