import type { TagTrend } from '../../api/process';

/** Um ponto de série: instante em ms e valor. */
export interface Point {
  readonly t: number;
  readonly v: number;
}

/**
 * Os pontos de uma tendência, na ordem do tempo.
 *
 * A tendência vem em colunas com primeiro, mínimo, máximo e último. Uma coluna
 * de uma amostra vira um ponto; uma de várias vira quatro, com o mínimo e o
 * máximo no meio na ordem em que a linha passa por eles — é o que mantém uma
 * queda de velocidade visível mesmo numa coluna larga. Depois da última amostra
 * o valor fica onde estava até `until` (o instante da leitura): o historiador
 * só arquiva quando o valor muda, então "nada arquivado" quer dizer "não mudou".
 */
export function seriesOf(trend: TagTrend, until: number): Point[] {
  const out: Point[] = [];
  if (trend.before) out.push({ t: trend.before.t, v: trend.before.v });

  const width = trend.bucketS * 1000;
  for (const bucket of trend.buckets) {
    const start = Date.parse(bucket.bucketStart);
    if (bucket.samples <= 1) {
      out.push({ t: start, v: bucket.last });
      continue;
    }
    const falling = bucket.first >= bucket.last;
    out.push({ t: start, v: bucket.first });
    out.push({ t: start + width / 3, v: falling ? bucket.max : bucket.min });
    out.push({ t: start + (2 * width) / 3, v: falling ? bucket.min : bucket.max });
    out.push({ t: start + width * 0.999, v: bucket.last });
  }

  const last = out.at(-1);
  if (last && last.t < until) out.push({ t: until, v: last.v });
  return out.sort((a, b) => a.t - b.t);
}

/** O valor da série no instante `t`, interpolando entre os pontos. */
export function valueAt(series: readonly Point[], t: number): number | null {
  const first = series[0];
  if (!first || t < first.t) return null;
  for (let i = 1; i < series.length; i += 1) {
    const b = series[i];
    const a = series[i - 1];
    if (!a || !b) continue;
    if (t <= b.t) return b.t === a.t ? b.v : a.v + ((t - a.t) / (b.t - a.t)) * (b.v - a.v);
  }
  return series.at(-1)?.v ?? null;
}
