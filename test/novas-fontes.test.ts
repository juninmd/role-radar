import { expect, test } from "bun:test";
import {
  citaRegiao,
  parseClubeDetail,
  parseClubeHome,
} from "../src/sources/clubedoingresso.ts";
import { largada, parseCalendario } from "../src/sources/corridasbr.ts";
import { parseSesiList, parseSesiSessions } from "../src/sources/sesisp.ts";
import { categorize } from "../src/web/classify.ts";

const TODAY = "2026-10-29";

// Recortes reais das páginas, reduzidos ao que o parser lê.
test("SESI: card da listagem e só o painel da unidade pedida", () => {
  const list = `<div class="card h-100  "><div class="card-img shadow-sm" style="background-image: url(https://blob.test/e1);"></div>
    <div class="card-body"><h5 class="card-title">Espiral de corpo e m&#xFA;sica</h5><p class="card-text">Bando Mukuvu</p></div>
    <div class="card-footer"><a href="/evento/955f83d6-a3d2-4014-a62f-acac38b319e3/espiral" class="btn">Saiba mais</a>
    <img class="evento-classificacao rounded" src="https://x.test/i" alt="Livre" width="28">`;
  expect(parseSesiList(list)).toEqual([
    {
      path: "/evento/955f83d6-a3d2-4014-a62f-acac38b319e3/espiral",
      title: "Espiral de corpo e música",
      image: "https://blob.test/e1",
      company: "Bando Mukuvu",
      age: "Livre",
    },
  ]);
  const painel = (cidade: string, dia: string, hora: string) =>
    `<div class="panel pb-1"><a role="button" href="#c"> SESI ${cidade} </a>
     <p><strong>Teatro do SESI ${cidade}</strong><br />  Av. Santa Cruz, 2870 - Jardim Centenário - ${cidade} - SP<br /></p>
     <div class="accordion-day-item"><h4 class="mb-0">${dia}<br /></h4>
     <i class="fa fa-clock mr-1" aria-hidden="true"></i>${hora} <span>às 21:00</span></div></div>`;
  const det =
    painel("Bauru", "29 OUTUBRO", "18:00") +
    painel("Franca", "31 OUTUBRO", "20:00");
  expect(parseSesiSessions(det, "Franca", TODAY)).toEqual([
    {
      date: "2026-10-31",
      time: "20:00",
      end_time: "21:00",
      venue: "Teatro do SESI Franca",
      address: "Av. Santa Cruz, 2870 - Jardim Centenário - Franca",
    },
  ]);
  expect(parseSesiSessions(det, "Barretos", TODAY)).toEqual([]);
});

test("Clube do Ingresso: card, filtro de região e detalhe com faixa de preço", () => {
  const home = `<div class="ItemCarrousel__content"><a href="/evento/oreiaindavive-franca">
    <div class="ItemCarrousel__nome">O Rei Ainda Vive...</div>
    <div class="ItemCarrousel__data">Quarta, 04/11/2026</div>
    <div class="ItemCarrousel__local [#x#]"><img src="/i.svg">Teatro Municipal</div></div>`;
  const [card] = parseClubeHome(home);
  expect(card).toEqual({
    path: "/evento/oreiaindavive-franca",
    name: "O Rei Ainda Vive...",
    local: "Teatro Municipal",
  });
  expect(citaRegiao(card)).toBe(true);
  expect(
    citaRegiao({ path: "/evento/x-campinas", name: "X", local: "Y" }),
  ).toBe(false);

  const det = `<div class="nome" data-nome="O Rei Ainda Vive">x</div>
    <div class="PageEvent__select"> <div class="PageEvent__desc">Quarta, 04 de Novembro de 2026 - Abertura: 20:00</div></div>
    <div class="PageEvent__local"> <div class="PageEvent__subTitle">Teatro Municipal de Franca</div> <div class="PageEvent__desc">Avenida Sete de Setembro, 455 - Residencial Baldassari - Franca, SP</div></div>
    <div class="PageEvent__class"> <div class="PageEvent__subTitle">Classificação</div> <div class="PageEvent__desc">Livre</div></div>
    <script type="application/ld+json">{"offers":{"price":"60.00"}} {"offers":{"price":"120.00"}}</script>`;
  expect(parseClubeDetail(det, TODAY)).toMatchObject({
    data: { date: "2026-11-04", time: "20:00" },
    venue: "Teatro Municipal de Franca",
    city: "Franca",
    price: "R$ 60 a R$ 120",
    title: "O Rei Ainda Vive",
    address: "Avenida Sete de Setembro, 455 - Residencial Baldassari",
    age_rating: "Livre",
  });
});

test("CorridasBR: linha do calendário sem ano e local da largada", () => {
  const html = `<tr><td width="40">15.11</span></td>
    <td><a href='/SP/por_cidade.asp?cidade=Franca'>Franca</a></td>
    <td><a href='mostracorrida.asp?escolha=64803&Corre'>Corre e Curti Corre Delax</a></td>
    <td>6/3km</td></tr><tr><td>Data</td><td>Cidade</td></tr>`;
  expect(parseCalendario(html, TODAY)).toEqual([
    {
      id: "64803",
      date: "2026-11-15",
      city: "Franca",
      name: "Corre e Curti Corre Delax",
      distances: "6/3km",
    },
  ]);
  expect(
    largada("<tr><td>Largada:</td><td>Rua Eliseu Alves Teixeira</td></tr>"),
  ).toBe("Rua Eliseu Alves Teixeira");
});

// "Teatro do SESI Franca" é teatro; o time de basquete é "Sesi Franca x …".
test("palco do SESI não vira esporte; corrida sem a palavra 'corrida' vira", () => {
  expect(categorize("Mukuvu - Uma Festa", "Teatro do SESI Franca")).toBe(
    "teatro",
  );
  expect(categorize("Sesi Franca x Flamengo")).toBe("esporte");
  expect(categorize("Corre e Curti Corre Delax")).toBe("esporte");
});
