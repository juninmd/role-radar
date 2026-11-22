// Benchmark do caminho quente do dashboard: buildCatalog + /api/catalog.
// Uso: DB_PATH=/tmp/x.db bun run bench/catalog.bench.ts [eventos=2000]
import { db, upsertEvent } from "../src/db.ts";
import { buildCatalog } from "../src/web/catalog.ts";
import { geoKey } from "../src/web/geocode.ts";
import { cacheCoord, saveSnapshot } from "../src/web/store.ts";

const N = Number(process.argv[2] ?? 2000);
const cities = [
  "Franca",
  "Ribeirão Preto",
  "Batatais",
  "Sertãozinho",
  "Uberaba",
];
const words = [
  "Show",
  "Festa",
  "Stand-up",
  "Teatro",
  "Feira",
  "Corrida",
  "Exposição",
  "Baile",
  "Cinema",
];
db.exec("DELETE FROM events; DELETE FROM geocache;");
const base = new Date("2026-11-21T12:00:00Z").getTime();
db.transaction(() => {
  for (let i = 0; i < N; i++) {
    const city = cities[i % cities.length];
    const venue = `Espaço ${i % 300}`;
    upsertEvent({
      title: `${words[i % words.length]} número ${i} com banda e convidados`,
      date: new Date(base + (i % 120) * 864e5).toISOString().slice(0, 10),
      time: "20:00",
      venue,
      city,
      price:
        i % 3 ? `R$ ${30 + (i % 70)},00 a R$ 1.200,50` : "Entrada gratuita",
      link: `https://example.com/e/${i}`,
      image: `https://example.com/i/${i}.jpg`,
      description: "Descrição ".repeat(30),
    });
    if (i < 300)
      cacheCoord(geoKey({ venue, city }), { lat: -20.5 - i / 1e4, lng: -47.4 });
  }
})();
saveSnapshot("cinema", []);

const today = "2026-11-21";
const runs = (fn: () => void, n: number) => {
  const t: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = Bun.nanoseconds();
    fn();
    t.push((Bun.nanoseconds() - s) / 1e6);
  }
  t.sort((a, b) => a - b);
  const q = (p: number) =>
    t[Math.min(t.length - 1, Math.floor(p * t.length))].toFixed(2);
  return `p50=${q(0.5)}ms p95=${q(0.95)}ms p99=${q(0.99)}ms`;
};
for (let i = 0; i < 5; i++) buildCatalog(today); // aquecimento
console.log(
  `N=${N} buildCatalog`,
  runs(() => buildCatalog(today), 50),
);
console.log(
  `N=${N} build+JSON+gzip`,
  runs(
    () =>
      Bun.gzipSync(
        new TextEncoder().encode(JSON.stringify(buildCatalog(today))),
      ),
    50,
  ),
);
const c = buildCatalog(today);
const raw = new TextEncoder().encode(JSON.stringify(c));
console.log(
  `payload raw=${(raw.byteLength / 1024).toFixed(0)}KiB gz=${(Bun.gzipSync(raw).byteLength / 1024).toFixed(0)}KiB`,
);
