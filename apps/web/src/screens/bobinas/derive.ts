import type { WebBreak } from '@mp1/shared';

import type { ReelView } from '../../api/process';
import { valueAt, type Point } from '../../ui/chart/series';

/**
 * As contas da tela de Bobinas.
 *
 * A posição ao longo da bobina sai do tempo: a bobina enrola a uma velocidade
 * quase constante, e o instante `t` dentro da janela dela vira a fração
 * `(t − início) / (fim − início)` do comprimento. É a mesma aproximação que o
 * QCS faz para pôr um trecho no mapa da bobina.
 */

export interface Span {
  readonly from: number;
  readonly to: number;
}

/** A janela de tempo da bobina; a em formação vai até a leitura. */
export function reelSpan(reel: ReelView, now: number): Span {
  return { from: Date.parse(reel.startedAt), to: reel.endedAt ? Date.parse(reel.endedAt) : now };
}

/**
 * O comprimento da bobina em m.
 *
 * Fechada, o da API. Em formação, a API ainda não tem: vira o tempo enrolado
 * vezes a velocidade da máquina na leitura — conta de quem está na Pope.
 */
export function reelLength(reel: ReelView, now: number, speedMMin: number | null): number | null {
  if (reel.lengthM !== null && reel.lengthM > 0) return reel.lengthM;
  if (reel.endedAt !== null || speedMMin === null) return null;
  return ((now - Date.parse(reel.startedAt)) / 60_000) * speedMMin;
}

/** Quantos pontos a busca dos trechos fora examina em cada bobina. */
const STEPS = 240;

/**
 * Os trechos em que a série saiu da faixa `lo`–`hi`, como frações da bobina.
 *
 * A série é amostrada em `STEPS` pontos ao longo da janela; um trecho começa no
 * primeiro ponto fora e termina no primeiro dentro. Onde a série não cobre a
 * bobina (o historiador não tem aquele tempo) não há trecho — nem dentro, nem
 * fora: `coverage` diz quanto da bobina foi visto.
 */
export function outRuns(
  series: readonly Point[],
  span: Span,
  lo: number | null,
  hi: number | null,
): { runs: Span[]; coverage: number } {
  const runs: Span[] = [];
  let open: number | null = null;
  let seen = 0;
  const width = span.to - span.from;
  if (width <= 0) return { runs, coverage: 0 };

  for (let i = 0; i <= STEPS; i += 1) {
    const f = i / STEPS;
    const v = valueAt(series, span.from + f * width);
    if (v === null) {
      if (open !== null) runs.push({ from: open, to: f });
      open = null;
      continue;
    }
    seen += 1;
    const out = (lo !== null && v < lo) || (hi !== null && v > hi);
    if (out && open === null) open = f;
    if (!out && open !== null) {
      runs.push({ from: open, to: f });
      open = null;
    }
  }
  if (open !== null) runs.push({ from: open, to: 1 });
  return { runs, coverage: seen / (STEPS + 1) };
}

/** Junta trechos que se sobrepõem, para várias TAGs virarem uma faixa só. */
export function merge(runs: readonly Span[]): Span[] {
  const sorted = [...runs].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const run of sorted) {
    const last = out.at(-1);
    if (last && run.from <= last.to)
      out[out.length - 1] = { from: last.from, to: Math.max(last.to, run.to) };
    else out.push(run);
  }
  return out;
}

/** Onde as quebras caíram dentro da bobina, como fração do comprimento. */
export function breakMarks(breaks: readonly WebBreak[], span: Span): number[] {
  const width = span.to - span.from;
  return breaks
    .map((item) => Date.parse(item.startedAt))
    .filter((t) => t >= span.from && t <= span.to && width > 0)
    .map((t) => (t - span.from) / width);
}

/** Média e 2σ de uma lista de números. */
export function stats(values: readonly number[]): { mean: number; twoSigma: number } {
  if (values.length === 0) return { mean: Number.NaN, twoSigma: Number.NaN };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, twoSigma: 2 * Math.sqrt(variance) };
}
