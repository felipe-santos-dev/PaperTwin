import type { LabResult, LabSpec } from '../../api/fixtures';
import type { ReelView } from '../../api/process';
import { valueAt, type Point } from '../../ui/chart/series';

/**
 * As contas da tela de Laboratório.
 *
 * Os ensaios são dado fixo; as bobinas, os horários e o QCS são reais. As
 * contas não sabem disso — quem marca o que é fixo é a tela.
 */

export type CellState = 'dentro' | 'limite' | 'fora' | 'atrasado' | 'não programado';

/** "No limite" = nos últimos 10 % da faixa de especificação, de qualquer lado. */
export const EDGE_FRACTION = 0.1;

export function stateOf(spec: LabSpec, value: number): 'dentro' | 'limite' | 'fora' {
  if (value < spec.lo || value > spec.hi) return 'fora';
  const edge = (spec.hi - spec.lo) * EDGE_FRACTION;
  return value < spec.lo + edge || value > spec.hi - edge ? 'limite' : 'dentro';
}

/** O ensaio é feito nesta bobina? Segue a frequência do ensaio. */
export function scheduled(spec: LabSpec, reel: ReelView): boolean {
  return reel.number % spec.everyReels === 0;
}

export interface Cell {
  readonly state: CellState;
  readonly result: LabResult | null;
}

export function cellOf(spec: LabSpec, reel: ReelView, results: readonly LabResult[]): Cell {
  const result = results.find((r) => r.tag === spec.tag && r.reelNumber === reel.number) ?? null;
  if (result) return { state: stateOf(spec, result.value), result };
  if (!scheduled(spec, reel)) return { state: 'não programado', result: null };
  return { state: 'atrasado', result: null };
}

export interface ControlChart {
  readonly points: readonly { readonly reel: number; readonly value: number }[];
  readonly mean: number;
  readonly sigma: number;
  readonly lcl: number;
  readonly ucl: number;
  readonly cpk: number | null;
  /** Bobinas da base dos limites de controle. */
  readonly base: readonly [number, number] | null;
}

/**
 * Carta de controle de um ensaio: média e ±3σ calculados numa base que deixa de
 * fora as últimas `recent` bobinas, para o que acabou de acontecer não puxar os
 * próprios limites. Cpk com a especificação, sobre a mesma base.
 */
export function controlChart(
  spec: LabSpec,
  results: readonly LabResult[],
  recent = 5,
): ControlChart | null {
  const points = results
    .filter((r) => r.tag === spec.tag)
    .map((r) => ({ reel: r.reelNumber, value: r.value }))
    .sort((a, b) => a.reel - b.reel);
  if (points.length < 3) return null;

  const baseCount = points.length - recent >= 8 ? points.length - recent : points.length;
  const base = points.slice(0, baseCount);
  const mean = base.reduce((t, p) => t + p.value, 0) / base.length;
  const sigma = Math.sqrt(
    base.reduce((t, p) => t + (p.value - mean) ** 2, 0) / Math.max(1, base.length - 1),
  );
  const cpk = sigma > 0 ? Math.min(spec.hi - mean, mean - spec.lo) / (3 * sigma) : null;
  const first = base[0];
  const last = base.at(-1);

  return {
    points,
    mean,
    sigma,
    lcl: mean - 3 * sigma,
    ucl: mean + 3 * sigma,
    cpk,
    base: first && last ? [first.reel, last.reel] : null,
  };
}

/** Duração típica de uma bobina (mediana das fechadas), em ms. */
export function typicalReelMs(reels: readonly ReelView[]): number | null {
  const durations = reels
    .filter((r) => r.endedAt !== null)
    .map((r) => Date.parse(r.endedAt ?? '') - Date.parse(r.startedAt))
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  return durations[Math.floor(durations.length / 2)] ?? null;
}

/**
 * Média de uma série na janela, amostrada em 60 pontos.
 *
 * O historiador arquiva só quando o valor muda; tirar a média das amostras
 * arquivadas pesaria mais os trechos agitados. Amostrar no tempo pesa cada
 * minuto igual. `null` quando a série não cobre a janela.
 */
export function meanIn(series: readonly Point[], from: number, to: number): number | null {
  let total = 0;
  let count = 0;
  for (let k = 0; k < 60; k += 1) {
    const v = valueAt(series, from + ((k + 0.5) / 60) * (to - from));
    if (v === null) continue;
    total += v;
    count += 1;
  }
  return count < 30 ? null : total / count;
}
