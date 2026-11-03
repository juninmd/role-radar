import { beforeEach, expect, test } from "bun:test";
import {
  handleCommand,
  parseCommand,
  pollTelegramUpdates,
} from "../src/bot.ts";
import { env } from "../src/config/env.ts";
import {
  db,
  getChatPreferences,
  setChatPreferences,
  upsertEvent,
} from "../src/db.ts";
import { json, stubFetch } from "./fetch.ts";

const evento = (
  title: string,
  date: string,
  city = "Franca",
  venue = "Teatro Municipal",
) =>
  upsertEvent({
    title,
    date,
    time: "20:00",
    venue,
    city,
    price: "R$ 50",
    link: "https://ev.test/1",
    image: null,
  });

beforeEach(() => {
  env.telegramToken = "mock_token";
  env.telegramChatIds = ["100", "200"];
  db.exec("DELETE FROM events; DELETE FROM chat_preferences;");
});

test("parseCommand extrai comando e argumentos corretamente", () => {
  expect(parseCommand("não é comando")).toBeNull();
  expect(parseCommand("/hoje")).toEqual({ command: "hoje", args: [] });
  expect(parseCommand("/hoje@RoleRadarBot")).toEqual({
    command: "hoje",
    args: [],
  });
  expect(parseCommand("/categoria show teatro")).toEqual({
    command: "categoria",
    args: ["show", "teatro"],
  });
  expect(parseCommand("/silenciar Ribeirão Preto")).toEqual({
    command: "silenciar",
    args: ["Ribeirão", "Preto"],
  });
});

test("preferências de chat são persistidas no SQLite", () => {
  const p1 = getChatPreferences("100");
  expect(p1.silenced_cities).toEqual([]);
  expect(p1.filter_categories).toEqual([]);

  setChatPreferences({
    chat_id: "100",
    silenced_cities: ["Ribeirão Preto", "Batatais"],
    filter_categories: ["show", "cinema"],
  });

  const p2 = getChatPreferences("100");
  expect(p2.silenced_cities).toEqual(["Ribeirão Preto", "Batatais"]);
  expect(p2.filter_categories).toEqual(["show", "cinema"]);

  // Chat 200 continua sem preferências
  const p3 = getChatPreferences("200");
  expect(p3.silenced_cities).toEqual([]);
  expect(p3.filter_categories).toEqual([]);
});

test("/silenciar adiciona e remove cidades nas preferências", () => {
  const res1 = handleCommand(
    { command: "silenciar", args: ["Ribeirão", "Preto"] },
    "100",
  );
  expect(res1[0].text).toContain("silenciada");
  expect(getChatPreferences("100").silenced_cities).toEqual(["Ribeirão Preto"]);

  // Chamar novamente remove (reativa)
  const res2 = handleCommand(
    { command: "silenciar", args: ["Ribeirão", "Preto"] },
    "100",
  );
  expect(res2[0].text).toContain("reativada");
  expect(getChatPreferences("100").silenced_cities).toEqual([]);
});

test("/categoria atualiza e limpa categorias nas preferências", () => {
  const res1 = handleCommand(
    { command: "categoria", args: ["show", "teatro"] },
    "100",
  );
  expect(res1[0].text).toContain("Filtro atualizado");
  expect(getChatPreferences("100").filter_categories).toEqual([
    "show",
    "teatro",
  ]);

  // Limpar com 'todas'
  const res2 = handleCommand({ command: "categoria", args: ["todas"] }, "100");
  expect(res2[0].text).toContain("limpo");
  expect(getChatPreferences("100").filter_categories).toEqual([]);
});

test("/hoje responde com os eventos do dia filtrados pelas preferências do chat", () => {
  const today = "2026-11-01";
  evento("Show Rock", today, "Franca", "Ginásio");
  evento("Peça de Teatro", today, "Ribeirão Preto", "Pedro II");
  evento("Stand-up Comedy", today, "Franca", "Espaço Cultural");

  // Sem filtros: 3 eventos
  const resTodos = handleCommand({ command: "hoje", args: [] }, "100", today);
  expect(resTodos).toHaveLength(3);
  expect(resTodos[0].buttons).toBeDefined();

  // Silencia Ribeirão Preto
  handleCommand({ command: "silenciar", args: ["Ribeirão", "Preto"] }, "100");
  const resSilenciado = handleCommand(
    { command: "hoje", args: [] },
    "100",
    today,
  );
  expect(resSilenciado).toHaveLength(2);
  expect(resSilenciado.some((r) => r.text.includes("Peça de Teatro"))).toBe(
    false,
  );

  // Filtra por categoria teatro (que só tinha em Ribeirão, silenciada)
  handleCommand({ command: "categoria", args: ["teatro"] }, "100");
  const resVazio = handleCommand({ command: "hoje", args: [] }, "100", today);
  expect(resVazio).toHaveLength(1);
  expect(resVazio[0].text).toContain("Nenhum evento encontrado para hoje");
});

test("/semana responde com eventos dos próximos 7 dias respeitando preferências", () => {
  const today = "2026-11-01";
  evento("Show Futuro Franca", "2026-11-03", "Franca");
  evento("Show Futuro Ribeirão", "2026-11-04", "Ribeirão Preto");

  const resSemFiltro = handleCommand(
    { command: "semana", args: [] },
    "100",
    today,
  );
  expect(resSemFiltro[0].text).toContain("Show Futuro Franca");
  expect(resSemFiltro[0].text).toContain("Show Futuro Ribeirão");

  handleCommand({ command: "silenciar", args: ["Ribeirão", "Preto"] }, "100");
  const resFiltrado = handleCommand(
    { command: "semana", args: [] },
    "100",
    today,
  );
  expect(resFiltrado[0].text).toContain("Show Futuro Franca");
  expect(resFiltrado[0].text).not.toContain("Show Futuro Ribeirão");
});

test("pollTelegramUpdates processa mensagens de chats permitidos e ignora chats não autorizados", async () => {
  const sentMessages: Array<{ chat_id: string; text: string }> = [];

  stubFetch(async (url, init) => {
    if (url.includes("getUpdates")) {
      return json({
        ok: true,
        result: [
          {
            update_id: 1,
            message: { chat: { id: 999 }, text: "/hoje" }, // Chat 999 não está em env.telegramChatIds
          },
          {
            update_id: 2,
            message: { chat: { id: 100 }, text: "/ajuda" }, // Chat 100 autorizado
          },
        ],
      });
    }
    if (url.includes("sendMessage")) {
      sentMessages.push(JSON.parse(String(init?.body)));
      return json({ ok: true });
    }
    return json({ ok: true });
  });

  const nextOffset = await pollTelegramUpdates(0);
  expect(nextOffset).toBe(3);
  // Apenas a mensagem para o chat 100 deve ter sido enviada
  expect(sentMessages).toHaveLength(1);
  expect(sentMessages[0].chat_id).toBe("100");
  expect(sentMessages[0].text).toContain("Comandos do Rolê Radar");
});
