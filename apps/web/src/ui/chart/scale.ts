/**
 * Escalas dos gráficos em SVG próprio.
 *
 * Os gráficos daqui são poucos e simples — linha, faixa, marca —, e uma
 * biblioteca de gráficos traria mais peso que todos eles juntos. O que eles
 * compartilham é esta conta.
 */

export interface Linear {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

/** Escala linear de `domain` para `range`. Domínio degenerado cai no meio. */
export function linear(
  domain: readonly [number, number],
  range: readonly [number, number],
): Linear {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const map = ((value: number) =>
    span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0)) as Linear;
  return Object.assign(map, { domain, range });
}

/** Limita um valor ao intervalo. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Posição de um valor numa faixa, de 0 a 1, limitada às pontas.
 *
 * É o que as barras usam: um valor fora da escala encosta na borda em vez de
 * sumir, e quem olha ainda vê para que lado ele saiu.
 */
export function fraction(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

/** Mínimo e máximo de uma série, ignorando o que não é número. */
export function extent(values: readonly number[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
  }
  return lo === Infinity ? null : [lo, hi];
}

/** Abre um intervalo em `pad` da sua largura, para a linha não encostar na borda. */
export function padded([lo, hi]: readonly [number, number], pad = 0.1): [number, number] {
  const width = hi - lo || Math.abs(hi) || 1;
  return [lo - width * pad, hi + width * pad];
}

/** Os pontos de uma polilinha SVG. */
export function polyline(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}
