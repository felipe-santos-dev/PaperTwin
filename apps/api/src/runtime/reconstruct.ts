import {
  autonomousBand,
  autonomousTruth,
  correlatedNoise,
  DEFAULT_SEED,
  instrumentNoiseSd,
  NOISE_TAU_TICKS,
  streamOf,
  tickAt,
  tickTime,
} from '@mp1/shared/simulation';
import {
  derivedVariable,
  historianPoint,
  processVariable,
  type ProcessVariable,
} from '@mp1/shared';

import type { Database } from '../db';
import type { PlotBucket } from '../db/historian-queries';
import type { Trend } from '../db/historian-store';

/**
 * A tendência de quem não grava no historiador.
 *
 * Duas famílias de variáveis não ocupam linha de arquivo: a **autônoma**, que é
 * função pura de (semente, passo, canal), e a **calculada na leitura**, que é
 * conta sobre quem já grava. Para o instante, o motor resolve as duas. Para o
 * gráfico, quem resolve é isto.
 *
 * O resultado tem a forma do que o banco devolveria, e por um motivo prático: a
 * tela não deveria saber de onde a série veio. Um gráfico que desenha diferente
 * conforme a origem do dado é um gráfico que ensina a desconfiar do dado certo.
 *
 * ## O que ele não finge
 *
 * `before`, `after` e `samples` vêm vazios ou em 1: não existe "amostra
 * anterior à janela" numa série que não foi gravada, e dizer que uma coluna tem
 * 300 amostras quando ela tem uma conta seria inventar precisão. O que existe é
 * o valor em cada instante pedido, e é isso que vai.
 */

/** Quantos pontos por coluna: o bastante para o mínimo e o máximo da coluna. */
const SAMPLES_PER_BUCKET = 4;

/**
 * Quatro casas, as mesmas da rota de valores.
 *
 * A conta sai em ponto flutuante e `224.99683033140063` não é mais verdadeiro
 * do que `224.9968`: o instrumento não tem essa resolução, a tela mostra uma
 * casa, e as treze casas extras só engordam o JSON — no instantâneo de
 * demonstração, por megabytes.
 */
const round = (value: number): number => Number(value.toFixed(4));

/** Teto de colunas, o mesmo da consulta ao banco. */
const MAX_BUCKETS = 2000;

export interface ReconstructOptions {
  readonly tag: string;
  readonly from: Date;
  readonly to: Date;
  readonly buckets?: number;
  readonly seed?: number;
}

/** Se a tendência desta tag precisa ser reconstruída em vez de lida. */
export function needsReconstruction(tag: string): boolean {
  return processVariable(tag) !== null && historianPoint(tag) === null;
}

/**
 * O valor **medido** de uma autônoma num passo.
 *
 * É a mesma conta do motor, nesta ordem: alvo, deriva, ruído de instrumento, e
 * a prisão na faixa. Repetir a ordem importa — o ruído entra sobre a deriva, e
 * a prisão é a última coisa, senão a autônoma voltaria a poder alarmar no
 * gráfico sem alarmar no instante.
 */
function autonomousMeasured(variable: ProcessVariable, tick: number, seed: number): number {
  const band = autonomousBand(variable);
  const truth = autonomousTruth(variable, band, seed, tick);
  const sd = instrumentNoiseSd(variable.tag);
  const read =
    sd === 0
      ? truth
      : truth + sd * correlatedNoise(seed, tick, streamOf(variable.tag), NOISE_TAU_TICKS);
  return Math.min(Math.max(read, band.low), band.high);
}

export async function reconstructTrend(
  db: Database,
  { tag, from, to, buckets = 240, seed = DEFAULT_SEED }: ReconstructOptions,
): Promise<Trend> {
  const columns = Math.min(Math.max(Math.trunc(buckets), 1), MAX_BUCKETS);
  const span = to.getTime() - from.getTime();
  const bucketMs = span / columns;

  /** Os instantes de cada amostra, achatados: `columns × SAMPLES_PER_BUCKET`. */
  const instants: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let k = 0; k < SAMPLES_PER_BUCKET; k += 1) {
      instants.push(from.getTime() + bucketMs * (column + k / (SAMPLES_PER_BUCKET - 1 || 1)));
    }
  }

  const series = await resolve(db, tag, instants, seed, new Map(), new Set());

  const plot: PlotBucket[] = [];
  for (let column = 0; column < columns; column += 1) {
    const slice = series.slice(column * SAMPLES_PER_BUCKET, (column + 1) * SAMPLES_PER_BUCKET);
    if (slice.length === 0) continue;
    plot.push({
      bucketStart: new Date(from.getTime() + bucketMs * column).toISOString(),
      samples: slice.length,
      min: round(Math.min(...slice)),
      max: round(Math.max(...slice)),
      first: round(slice[0] ?? 0),
      last: round(slice.at(-1) ?? 0),
    });
  }

  const average =
    series.length === 0 ? null : series.reduce((total, value) => total + value, 0) / series.length;

  return {
    pointId: -1,
    from: from.toISOString(),
    to: to.toISOString(),
    bucketS: bucketMs / 1000,
    buckets: plot,
    before: null,
    after: null,
    timeWeightedAverage: average,
  };
}

/**
 * O valor de uma tag nos instantes pedidos, venha ela de onde vier.
 *
 * Três caminhos, e a recursão termina sempre: arquivada vai ao banco, autônoma
 * se recalcula, calculada chama as entradas dela. O `visiting` existe para o
 * caso que não deveria acontecer — uma fórmula que dependa de si mesma —
 * falhar com o nome da tag em vez de estourar a pilha.
 */
async function resolve(
  db: Database,
  tag: string,
  instants: readonly number[],
  seed: number,
  cache: Map<string, number[]>,
  visiting: Set<string>,
): Promise<number[]> {
  const cached = cache.get(tag);
  if (cached) return cached;

  if (visiting.has(tag)) {
    throw new Error(`Ciclo ao reconstruir a tendência de ${tag}.`);
  }
  visiting.add(tag);

  const variable = processVariable(tag);
  if (!variable) throw new Error(`Tendência pedida para ${tag}, que não está no catálogo.`);

  let values: number[];

  const point = historianPoint(tag);
  if (point) {
    values = await archived(db, point.pointId, instants);
  } else if (variable.level === 'autônoma') {
    values = instants.map((instant) =>
      autonomousMeasured(variable, tickAt(new Date(instant)), seed),
    );
  } else if (variable.min === variable.max) {
    /**
     * A constante: uma linha reta é a série verdadeira dela.
     *
     * A largura da folha (`XI-0002`) não grava, não passeia e não tem fórmula —
     * ela vale 8 m ontem, hoje e na semana que vem. Antes isto era um 500, o
     * que fazia a tendência de uma TAG do catálogo falhar sem que nada
     * estivesse errado.
     */
    values = instants.map(() => variable.min);
  } else {
    const formula = derivedVariable(tag);
    if (!formula) {
      throw new Error(
        `${tag} não grava, não é autônoma e não tem fórmula: ninguém sabe dizer o valor dela.`,
      );
    }
    const inputs = new Map<string, number[]>();
    for (const input of formula.inputs) {
      inputs.set(input, await resolve(db, input, instants, seed, cache, visiting));
    }
    values = instants.map((_, index) =>
      formula.compute((input) => inputs.get(input)?.[index] ?? 0),
    );
  }

  visiting.delete(tag);
  cache.set(tag, values);
  return values;
}

/**
 * A série arquivada de uma entrada, amostrada nos mesmos instantes.
 *
 * Uma consulta só, na janela inteira, e depois a escada: o valor que vale num
 * instante é o último arquivado antes dele. É como o historiador desenha, e é o
 * que mantém a conta derivada coerente com a série de quem ela lê.
 */
async function archived(
  db: Database,
  pointId: number,
  instants: readonly number[],
): Promise<number[]> {
  const first = instants[0] ?? 0;
  const last = instants.at(-1) ?? first;
  const trend = await db.trend({
    pointId,
    from: new Date(first),
    to: new Date(last + 1),
    buckets: Math.min(MAX_BUCKETS, Math.max(1, instants.length)),
  });

  const marks = trend.buckets.map((bucket) => ({
    at: Date.parse(bucket.bucketStart),
    value: bucket.last,
  }));
  const fallback = trend.before?.v ?? marks[0]?.value ?? 0;

  let cursor = 0;
  return instants.map((instant) => {
    while (cursor + 1 < marks.length && (marks[cursor + 1]?.at ?? Infinity) <= instant) {
      cursor += 1;
    }
    const mark = marks[cursor];
    return mark && mark.at <= instant ? mark.value : fallback;
  });
}

/** O instante do passo, para quem precisa casar a grade com o relógio. */
export { tickTime };
