import { expect, test } from "bun:test";
import { nowPlaying } from "../src/sources/cinema.ts";
import { json, stubFetch } from "./fetch.ts";

// Um null na lista de filmes lançava TypeError e a cidade inteira ficava sem
// cartaz, mesmo com os outros filmes válidos.
test("cinema: item nulo não tira o cartaz da cidade", async () => {
  stubFetch(async () =>
    json([null, { title: "Filme Cinema Nulo", isPlaying: true }]),
  );
  const days = await nowPlaying();
  expect(JSON.stringify(days)).toContain("Filme Cinema Nulo");
});
