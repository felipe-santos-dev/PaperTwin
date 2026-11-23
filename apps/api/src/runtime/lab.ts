import {
  labResultId,
  labWithinSpec,
  LAB_ANALYSIS_MINUTES,
  MD_TENSILE_SPEC,
  type LabResult,
} from '@mp1/shared';
import { streamOf, tickTime, unitNoise } from '@mp1/shared/simulation';

/**
 * O laboratório como evento: a amostra, o atraso e o laudo.
 *
 * ## De onde sai o valor
 *
 * Da **verdade** do motor no instante em que a amostra é cortada, não da média
 * da bobina e não da medida com ruído de instrumento. São três escolhas, e cada
 * uma tem razão:
 *
 * - **Um instante, não uma janela.** O corpo de prova é um pedaço de papel
 *   cortado quando a bobina fecha; ele não tem como ser a média de 45 min de
 *   produção. É também o que faz a colheita dar o mesmo resultado reexecutada
 *   em pedaços: o instante da amostra é o mesmo nos dois caminhos.
 * - **A verdade, não a medida.** O ruído de `snapshot()` é do instrumento de
 *   campo; o laboratório tem o ruído **dele**, que é outro e entra aqui.
 * - **Com repetibilidade própria.** Dois corpos de prova da mesma bobina não
 *   dão o mesmo número, e é essa diferença que o sensor virtual nunca vai
 *   conseguir prever — ela é parte do que a faixa dele mede.
 */

/** A tag que vira evento nesta fase: a tração MD. */
export const LAB_TENSILE_TAG = MD_TENSILE_SPEC.tag;

/**
 * Repetibilidade do ensaio de tração, em kN/m.
 *
 * **Suposição.** 0,08 kN/m é cerca de 1,5 % do alvo — a ordem de grandeza que a
 * ISO 1924-2 espera entre corpos de prova da mesma amostra. É deliberadamente
 * pequena perto do que a dinâmica do processo provoca: a maior parte do
 * resíduo do sensor virtual tem de vir do processo, não da bancada.
 */
export const LAB_REPEATABILITY_KN_M = 0.08;

/** Uma leitura da verdade do motor, guardada durante a varredura. */
export interface TruthSample {
  readonly tick: number;
  readonly v: number;
}

/** A bobina, como o plano do turno a descreve. */
export interface SampledReel {
  readonly number: number;
  readonly startTick: number;
  readonly endTick: number;
}

/**
 * O valor da verdade no instante da amostra.
 *
 * A varredura grava de cinco em cinco passos, então o instante exato do fim da
 * bobina quase nunca é um dos gravados: vale o último gravado **até** ele,
 * dentro de um minuto. Mais longe que isso não é a amostra daquela bobina.
 */
const MAX_SAMPLE_LAG_TICKS = 60;

export function truthAt(series: readonly TruthSample[], tick: number): number | null {
  let best: TruthSample | null = null;

  for (const sample of series) {
    if (sample.tick > tick) continue;
    if (best === null || sample.tick > best.tick) best = sample;
  }

  if (best === null || tick - best.tick > MAX_SAMPLE_LAG_TICKS) return null;
  return best.v;
}

/**
 * Os laudos das bobinas que fecharam na janela.
 *
 * Uma bobina sem leitura da verdade no fim dela fica de fora — é o caso da
 * bobina que fechou antes do trecho que esta retomada reexecutou, e o laudo
 * dela já está gravado desde a retomada que a viu fechar.
 */
export function labResultsFor(
  reels: readonly SampledReel[],
  series: readonly TruthSample[],
  seed: number,
): LabResult[] {
  const results: LabResult[] = [];

  for (const reel of reels) {
    const truth = truthAt(series, reel.endTick);
    if (truth === null) continue;

    // repetibilidade da bancada: função do passo e da bobina, como todo o resto
    const draw = unitNoise(seed, reel.endTick, streamOf(`${LAB_TENSILE_TAG}-${reel.number}`), 3);
    const value = Number((truth + (draw - 0.5) * 2 * LAB_REPEATABILITY_KN_M).toFixed(3));

    const sampled = tickTime(reel.endTick);
    const reported = new Date(sampled.getTime() + LAB_ANALYSIS_MINUTES * 60_000);

    results.push({
      id: labResultId(reel.number, LAB_TENSILE_TAG),
      tag: LAB_TENSILE_TAG,
      reelNumber: reel.number,
      value,
      unit: MD_TENSILE_SPEC.unit,
      sampledAt: sampled.toISOString(),
      reportedAt: reported.toISOString(),
      withinSpec: labWithinSpec(LAB_TENSILE_TAG, value),
    });
  }

  return results;
}
