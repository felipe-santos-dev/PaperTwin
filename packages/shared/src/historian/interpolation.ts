import type { ArchivedSample, Sample } from './types';

/**
 * Como ler um valor entre dois valores arquivados.
 *
 * O arquivo guarda pontos esparsos e irregulares — é o que a compressão faz —
 * então "qual era o valor às 14h07" quase nunca tem resposta direta. A resposta
 * é interpolada, e **como** se interpola é uma decisão, não um detalhe.
 *
 * Aqui é **linear**, e não degrau, porque é o que a porta oscilante promete: o
 * valor real estava a no máximo `2 · compDev` da reta entre dois pontos
 * arquivados. Ler em degrau — manter o último valor até o próximo — jogaria
 * essa garantia fora e desenharia escadas num processo que não dá saltos.
 *
 * A exceção é o que está **fora** do intervalo arquivado: antes do primeiro
 * ponto e depois do último não há reta, e extrapolar seria inventar. Aí a
 * resposta é o valor da borda, com a extrapolação marcada, para quem lê saber
 * que aquele número é o último que se sabe e não uma medição daquele instante.
 */

/** O valor lido num instante, e de onde ele veio. */
export interface ReadValue {
  readonly t: number;
  readonly v: number;
  /** `exata` quando havia ponto arquivado naquele instante. */
  readonly kind: 'exata' | 'interpolada' | 'extrapolada';
}

/**
 * Interpola linearmente entre dois pontos.
 *
 * Com `before` e `after` no mesmo instante, devolve o `after`: dois valores no
 * mesmo instante não definem reta, e o mais recente é o que vale.
 */
export function interpolate(before: Sample, after: Sample, t: number): number {
  const span = after.t - before.t;
  if (span <= 0) return after.v;

  const fraction = (t - before.t) / span;
  return before.v + (after.v - before.v) * fraction;
}

/**
 * O valor num instante, dadas as âncoras de cada lado.
 *
 * `before` é o último arquivado em `t` ou antes; `after` é o primeiro depois.
 * Qualquer um pode faltar — nas bordas do arquivo — e aí a leitura é
 * extrapolada.
 */
export function readAt(
  t: number,
  before: ArchivedSample | Sample | null,
  after: ArchivedSample | Sample | null,
): ReadValue | null {
  if (before && before.t === t) return { t, v: before.v, kind: 'exata' };
  if (after && after.t === t) return { t, v: after.v, kind: 'exata' };

  if (before && after) return { t, v: interpolate(before, after, t), kind: 'interpolada' };
  if (before) return { t, v: before.v, kind: 'extrapolada' };
  if (after) return { t, v: after.v, kind: 'extrapolada' };

  return null;
}

/**
 * A média no tempo de uma série arquivada, pela regra do trapézio.
 *
 * Esta é a diferença que separa uma média certa de uma errada num historiador
 * comprimido. Um `avg(valor)` do SQL dá a média **dos pontos**, e os pontos não
 * estão igualmente espaçados: um trecho agitado tem dezenas de pontos e um
 * trecho parado tem um. A média dos pontos pesaria o trecho agitado dezenas de
 * vezes mais, e a resposta sairia puxada para onde o processo se mexeu.
 *
 * A média no tempo pesa cada trecho pela duração dele, e usa o trapézio porque
 * a leitura entre dois pontos é linear — a mesma regra da interpolação. Com
 * degrau, a média de uma rampa sairia deslocada meio passo.
 *
 * O intervalo é recortado em `[from, to]`: as pontas são interpoladas, para a
 * média de 14h às 15h não depender de onde caiu o ponto arquivado mais próximo.
 */
export function timeWeightedAverage(
  samples: readonly Sample[],
  from: number,
  to: number,
): number | null {
  if (to <= from) return null;

  const inside = samples.filter((sample) => sample.t >= from && sample.t <= to);
  const before = samples.filter((sample) => sample.t < from).at(-1) ?? null;
  const after = samples.find((sample) => sample.t > to) ?? null;

  const atFrom = readAt(from, before, inside[0] ?? after);
  const atTo = readAt(to, inside.at(-1) ?? before, after);
  if (!atFrom || !atTo) return null;

  const path: Sample[] = [
    { t: from, v: atFrom.v },
    ...inside.filter((sample) => sample.t > from && sample.t < to),
    { t: to, v: atTo.v },
  ];

  let area = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    area += ((a.v + b.v) / 2) * (b.t - a.t);
  }

  return area / (to - from);
}
