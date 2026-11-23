import {
  calibrate,
  estimate,
  historianPoint,
  labReported,
  MD_TENSILE_SPEC,
  residualsOf,
  softSensorModel,
  SOFT_SENSOR_WINDOW,
  type LabResult,
  type SoftSensorCalibration,
  type SoftSensorInput,
  type SoftSensorModel,
} from '@mp1/shared';

import type { Database } from '../db';

/**
 * O sensor virtual sobre o arquivo: o que a API acrescenta à conta do `shared`.
 *
 * A conta mora no núcleo (`quality/soft-sensor.ts`) e não sabe de banco. O que
 * está aqui é o que só a API pode fazer: ler o arquivo para saber onde o
 * processo estava em cada instante, e montar a série que a tela desenha.
 *
 * ## A calibração é a de cada instante, não a de agora
 *
 * Cada ponto da série é estimado com os laudos que **já tinham chegado** até
 * ele. É o que faz a curva ter o degrau no instante em que um laudo entra —
 * desenhar a série inteira com o viés final apagaria exatamente a coisa que
 * esta tela existe para mostrar, e ainda faria o passado parecer mais certo do
 * que foi.
 */

/** Quantos laudos entram na conta: o dobro da janela, para a série do passado. */
const RESULTS_LIMIT = SOFT_SENSOR_WINDOW * 2;

/** Colunas da série quando a tela não pede um número. */
const DEFAULT_COLUMNS = 240;

export interface QualityQuery {
  readonly tag: string;
  readonly from: Date;
  readonly to: Date;
  readonly buckets?: number;
}

export interface QualityPoint {
  readonly t: string;
  /** A estimativa, com o viés daquele instante. */
  readonly value: number;
  readonly lo: number | null;
  readonly hi: number | null;
}

export interface QualityReport {
  readonly tag: string;
  readonly unit: string;
  readonly from: string;
  readonly to: string;
  readonly spec: { readonly lo: number; readonly hi: number; readonly target: number };
  readonly model: SoftSensorModel;
  readonly calibration: SoftSensorCalibration;
  /** A estimativa no fim da janela — o número grande da tela. */
  readonly now: QualityPoint | null;
  readonly points: readonly QualityPoint[];
  /** Os laudos já emitidos na janela, do mais antigo ao mais recente. */
  readonly results: readonly LabResult[];
  /** O laudo mais recente que já chegou, mesmo que seja de antes da janela. */
  readonly lastResult: LabResult | null;
}

/** As entradas do modelo num instante, lidas do arquivo. */
async function inputsAt(
  db: Database,
  model: SoftSensorModel,
  at: Date,
): Promise<SoftSensorInput[] | null> {
  const inputs: SoftSensorInput[] = [];

  for (const term of model.terms) {
    const point = historianPoint(term.tag);
    if (!point) return null;

    const sample = await db.valueAt(point.pointId, at);
    if (!sample) return null;

    inputs.push({ tag: term.tag, value: sample.v });
  }

  return inputs;
}

/**
 * O relatório de qualidade de um ensaio.
 *
 * `null` quando o ensaio não tem modelo — sem relação declarada não há ganho
 * medido, e sem ganho não há estimativa. É resposta de 404, não de estimativa
 * vazia.
 */
export async function qualityReport(
  db: Database,
  query: QualityQuery,
): Promise<QualityReport | null> {
  const model = softSensorModel(query.tag);
  if (!model) return null;

  const stored = await db.listLabResults({ tag: query.tag, to: query.to, limit: RESULTS_LIMIT });
  // do mais antigo para o mais recente: a conta e a tela leem na ordem do tempo
  const results = [...stored].reverse();

  /**
   * As entradas de cada laudo são lidas no **instante da amostra**.
   *
   * É o mesmo instante em que o corpo de prova foi cortado, e por isso o
   * resíduo compara coisas do mesmo momento. Usar a média da bobina misturaria
   * 45 min de processo com um pedaço de papel de um instante.
   */
  const inputsByResult = new Map<string, SoftSensorInput[]>();
  for (const result of results) {
    const inputs = await inputsAt(db, model, new Date(result.sampledAt));
    if (inputs) inputsByResult.set(result.id, inputs);
  }

  const residuals = residualsOf(model, results, (result) => inputsByResult.get(result.id) ?? null);

  /** A calibração como ela era num instante: só os laudos já emitidos. */
  const calibrationAt = (at: number): SoftSensorCalibration =>
    calibrate(residuals.filter((item) => labReported(item.result, at)));

  /**
   * A série é desenhada numa **grade fixa**, não nas colunas do arquivo.
   *
   * O arquivo tem uma coluna por mudança que passou do filtro de exceção, e
   * uma malha em regime produz quatro colunas em quatro horas. Desenhar a
   * estimativa só nelas esconderia o que esta tela existe para mostrar: o
   * degrau do viés não acontece quando a entrada muda, e sim quando um laudo
   * chega — num instante em que o arquivo não tem coluna nenhuma.
   *
   * Entre duas colunas o valor da entrada é o da última, que é exatamente o
   * que o historiador promete: enquanto não há coluna nova, o valor não saiu
   * da banda de exceção.
   */
  const columns = Math.min(Math.max(Math.trunc(query.buckets ?? DEFAULT_COLUMNS), 2), 1000);
  const stepMs = (query.to.getTime() - query.from.getTime()) / columns;

  const held = new Map<string, { at: number; v: number }[]>();

  for (const term of model.terms) {
    const point = historianPoint(term.tag);
    if (!point) continue;

    const trend = await db.trend({
      pointId: point.pointId,
      from: query.from,
      to: query.to,
      buckets: columns,
    });

    const série = trend.buckets.map((bucket) => ({
      at: Date.parse(bucket.bucketStart),
      v: bucket.last,
    }));
    // o último valor antes da janela é o que vale até a primeira coluna
    if (trend.before) série.unshift({ at: trend.before.t, v: trend.before.v });

    held.set(term.tag, série);
  }

  /** O valor segurado de uma entrada num instante. */
  const heldAt = (tag: string, at: number): number | null => {
    const série = held.get(tag);
    if (!série) return null;

    let value: number | null = null;
    for (const sample of série) {
      if (sample.at > at) break;
      value = sample.v;
    }
    return value;
  };

  const points: QualityPoint[] = [];

  for (let i = 1; i <= columns; i += 1) {
    const at = query.from.getTime() + i * stepMs;
    const inputs: SoftSensorInput[] = [];
    let completo = true;

    for (const term of model.terms) {
      const value = heldAt(term.tag, at);
      if (value === null) {
        completo = false;
        break;
      }
      inputs.push({ tag: term.tag, value });
    }
    if (!completo) continue;

    const previsão = estimate(model, inputs, calibrationAt(at));
    if (!previsão) continue;

    points.push({
      t: new Date(at).toISOString(),
      value: Number(previsão.value.toFixed(3)),
      lo: previsão.lo === null ? null : Number(previsão.lo.toFixed(3)),
      hi: previsão.hi === null ? null : Number(previsão.hi.toFixed(3)),
    });
  }

  const emitidos = results.filter((result) => labReported(result, query.to));

  return {
    tag: query.tag,
    unit: MD_TENSILE_SPEC.unit,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    spec: { lo: MD_TENSILE_SPEC.lo, hi: MD_TENSILE_SPEC.hi, target: MD_TENSILE_SPEC.target },
    model,
    calibration: calibrationAt(query.to.getTime()),
    now: points.at(-1) ?? null,
    points,
    results: emitidos.filter((result) => Date.parse(result.sampledAt) >= query.from.getTime()),
    lastResult: emitidos.at(-1) ?? null,
  };
}
