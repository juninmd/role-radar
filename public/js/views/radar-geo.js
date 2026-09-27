// Geometria do radar (SVG 1000×1000, centro C, raio R).
export const C = 500;
export const R = 440;
export const SWEEP_S = 6;
const KM_RINGS = [1, 3, 10, 30, 100, 200];
const DAY_RINGS = [
  [0, "hoje"],
  [1, "amanhã"],
  [7, "1 sem"],
  [14, "2 sem"],
  [30, "1 mês"],
  [60, "2 meses"],
  [90, "3 meses"],
];

/** Ângulo em graus (0 = norte, horário) + raio → coordenada SVG. */
export const polar = (angleDeg, r) => {
  const a = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

// Hash estável 0..1 — posição dentro do setor não pula entre renders.
const unit = (id) => {
  let x = 2166136261;
  for (const ch of id) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return ((x >>> 0) % 10000) / 10000;
};

export function sectorPath(from, to) {
  const [x1, y1] = polar(from, R);
  const [x2, y2] = polar(to, R);
  return `M${C} ${C} L${x1} ${y1} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/**
 * "distancia": rumo real e raio log(distância) (Franca não esmaga contra
 * Ribeirão). "tempo": uma fatia por vibe e raio √dias até o rolê.
 */
export function layout(items, mode, maxKm) {
  if (mode === "distancia") {
    const pts = items.filter((it) => it.km !== null);
    const far = Math.max(1, ...pts.map((it) => it.km));
    const maxD = maxKm || KM_RINGS.find((k) => k >= far * 1.05) || far;
    const scale = (km) =>
      (R * Math.log1p(Math.min(km, maxD))) / Math.log1p(maxD);
    const rings = KM_RINGS.filter((k) => k <= maxD)
      .slice(-5)
      .map((k) => [scale(k), `${k} km`]);
    return {
      rings,
      sectors: [],
      blips: pts.map((it) => ({
        it,
        angle: it.bearing,
        r: Math.max(scale(it.km), 14),
      })),
    };
  }
  const pts = items.filter((it) => it.daysAhead !== null);
  const cats = [...new Set(pts.map((it) => it.category))];
  // Teto de 90 dias: um evento de daqui a um ano não pode esmagar a semana.
  const maxDays = Math.min(90, Math.max(7, ...pts.map((it) => it.daysAhead)));
  const scale = (d) =>
    18 + (R - 18) * Math.sqrt(Math.min(d, maxDays) / maxDays);
  const span = 360 / Math.max(cats.length, 1);
  const sectors = cats.map((c, i) => ({
    cat: c,
    from: i * span,
    to: (i + 1) * span,
  }));
  const rings = DAY_RINGS.filter(([d]) => d <= maxDays).map(([d, l]) => [
    scale(d),
    l,
  ]);
  const blips = pts.map((it) => {
    const sec = sectors.find((x) => x.cat === it.category);
    return {
      it,
      angle: sec.from + span * (0.12 + 0.76 * unit(it.id)),
      r: scale(it.daysAhead) + (unit(`${it.id}r`) - 0.5) * 10,
    };
  });
  return { rings, sectors, blips };
}
