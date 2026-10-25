import { expect, test } from "bun:test";
import { createHandler } from "../src/web/server.ts";

// Respostas sem arquivo (health, 404, 405) também saem com os cabeçalhos de segurança.
const get = (path: string, method = "GET") => createHandler()(new Request(`http://x${path}`, { method }));

test("health e 404 carregam CSP, nosniff e Permissions-Policy", () => {
  for (const res of [get("/health"), get("/nao-existe")]) {
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  }
});

test("405 também carrega os cabeçalhos de segurança", () => {
  expect(get("/api/catalog", "POST").headers.get("x-content-type-options")).toBe("nosniff");
});
