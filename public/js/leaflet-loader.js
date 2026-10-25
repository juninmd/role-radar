// Leaflet (~46 KB gzip) só é baixado quando a aba Mapa abre pela primeira vez.
// Mesmos arquivos e SRI que estavam fixos no index.html.
const CDN = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist";
const CSS = {
  href: `${CDN}/leaflet.css`,
  integrity:
    "sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H",
};
const JS = {
  src: `${CDN}/leaflet.js`,
  integrity:
    "sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH",
};

let pending = null;

/** Uma só carga por página; falha libera para tentar de novo na próxima troca de aba. */
export function ensureLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  pending ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = CSS.href;
    css.integrity = CSS.integrity;
    css.crossOrigin = "anonymous";

    const js = document.createElement("script");
    js.src = JS.src;
    js.integrity = JS.integrity;
    js.crossOrigin = "anonymous";

    const loaded = (el) =>
      new Promise((ok, fail) => {
        el.onload = ok;
        el.onerror = fail;
      });
    // CDN que trava sem dar erro deixava "Carregando o mapa…" para sempre.
    const limite = new Promise((_, fail) =>
      setTimeout(() => fail(new Error("leaflet: tempo esgotado")), 10000),
    );
    Promise.race([Promise.all([loaded(css), loaded(js)]), limite]).then(
      () => resolve(window.L),
      (err) => {
        pending = null;
        reject(err);
      },
    );
    document.head.append(css, js);
  });
  return pending;
}
