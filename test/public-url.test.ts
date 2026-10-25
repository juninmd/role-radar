import { expect, test } from "bun:test";
import {
  fetchPublic,
  isPublicUrl,
  setHostResolver,
} from "../src/sources/public-url.ts";
import { stubFetch } from "./fetch.ts";

// O pipeline roda com hostNetwork: link de matéria vem de fora e não pode
// alcançar o loopback do host, a API do cluster ou a rede privada.
test("só aceita http(s) em host público", () => {
  for (const ok of [
    "https://www.jornaldafranca.com.br/x",
    "http://8.8.8.8/",
    "https://[2800:3f0:4001:844::200e]/",
  ])
    expect(isPublicUrl(ok)).toBe(true);
  for (const bad of [
    "http://127.0.0.1:6443/",
    "http://localhost:10250/pods",
    "http://10.43.0.1/",
    "http://172.20.1.1/",
    "http://192.168.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://litellm.ai.svc.cluster.local:4000/",
    "http://localhost./",
    "http://litellm.ai.svc.cluster.local./",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
    "http://2130706433/", // 127.0.0.1 em decimal
    "http://kubernetes/",
    "file:///etc/passwd",
    "não é url",
  ])
    expect(isPublicUrl(bad)).toBe(false);
});

test("redirect para rede interna é bloqueado antes de conectar", async () => {
  const hits: string[] = [];
  stubFetch(async (url) => {
    hits.push(url);
    return new Response("", {
      status: 302,
      headers: { location: "http://127.0.0.1:6443/api" },
    });
  });
  await expect(fetchPublic("https://portal.test/materia", {})).rejects.toThrow(
    "URL não pública",
  );
  expect(hits).toEqual(["https://portal.test/materia"]);
});

test("segue redirect público até a resposta final", async () => {
  stubFetch(async (url) =>
    url === "https://portal.test/a"
      ? new Response("", { status: 301, headers: { location: "/b" } })
      : new Response("ok"),
  );
  const res = await fetchPublic("https://portal.test/a", {});
  expect(await res.text()).toBe("ok");
});

// Domínio público apontado para a rede interna: a checagem de string passa, só
// o IP resolvido denuncia. Sem isso o fetch sai para 10.x do cluster.
test("nome público que resolve para rede interna é bloqueado antes de conectar", async () => {
  setHostResolver(async () => ["93.184.216.34", "10.43.0.1"]);
  const hits = stubFetch(async () => new Response("segredo"));
  await expect(fetchPublic("https://portal.test/materia", {})).rejects.toThrow(
    "URL não pública",
  );
  expect(hits).toEqual([]);
});
