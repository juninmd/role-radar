import cron from "node-cron";
import { env } from "./config/env.ts";
import { topic } from "./config/topic.ts";
import { digest } from "./digest.ts";
import { ingest } from "./ingest.ts";
import { serve } from "./web/server.ts";

const args = new Set(process.argv.slice(2));

async function once() {
  await ingest();
  await digest();
}

if (args.has("--serve")) {
  serve(env.port);
} else if (args.has("--ingest")) {
  await ingest();
} else if (args.has("--digest")) {
  await digest();
} else if (args.has("--loop")) {
  console.log(`[${topic.name}] agente ativo`);
  console.log(`  ingestão: ${env.cronIngestion}`);
  console.log(`  digest:   ${env.cronDigest}`);
  await ingest();
  cron.schedule(env.cronIngestion, () => ingest().catch(console.error));
  cron.schedule(env.cronDigest, () => digest().catch(console.error));
} else {
  // padrão (--once): roda um ciclo e sai
  await once();
  process.exit(0);
}
