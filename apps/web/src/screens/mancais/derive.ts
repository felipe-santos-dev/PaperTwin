import {
  classifyIsoZone,
  estimateRemainingLife,
  type IsoLimits,
  type IsoZone,
  type RemainingLife,
  type VibrationBucket,
} from '@mp1/shared';

/**
 * As contas da tela de Mancais.
 *
 * O ranking mostra sempre os mancais em zona B, C ou D e, além deles, os dez de
 * maior vibração; o resto fica atrás de "mostrar todos". A projeção usa o
 * `rul.ts` do `shared` — a mesma regressão, com o mesmo critério de
 * significância, que o servidor usa para a vida útil restante.
 */

export interface BearingRow {
  readonly assetTag: string;
  readonly label: string;
  readonly side: string | null;
  /** TAG de vibração no catálogo; `null` para mancal sem instrumento no DCS. */
  readonly vibrationTag: string | null;
  readonly temperatureTag: string | null;
  readonly rms: number | null;
  readonly temperature: number | null;
  readonly limits: IsoLimits | null;
  readonly zone: IsoZone | null;
}

export function zoneOf(rms: number | null, limits: IsoLimits | null): IsoZone | null {
  return rms === null || limits === null ? null : classifyIsoZone(rms, limits);
}

/** Do pior para o melhor: vibração em fração da fronteira C→D, que compara classes ISO diferentes. */
export function rank(rows: readonly BearingRow[]): BearingRow[] {
  const severity = (row: BearingRow) =>
    row.rms === null || row.limits === null ? -1 : row.rms / row.limits.cToD;
  return [...rows].sort((a, b) => severity(b) - severity(a));
}

export const TOP = 10;

/** Os visíveis sem "mostrar todos": zona B, C ou D, mais os `TOP` primeiros. */
export function visible(ranked: readonly BearingRow[]): BearingRow[] {
  return ranked.filter(
    (row, index) => index < TOP || row.zone === 'B' || row.zone === 'C' || row.zone === 'D',
  );
}

/** Temperatura de atenção e de alarme do mancal, em °C (as marcas da barra). */
export const TEMP_LIMITS = { attention: 80, alarm: 90 } as const;

/**
 * Projeção da temperatura até o limite de atenção.
 *
 * É a mesma regressão de `estimateRemainingLife`, aplicada às médias de
 * temperatura: a função recebe a série como se fosse vibração e o limite de
 * atenção no lugar da fronteira C→D. Assim a temperatura passa pelo mesmo
 * critério — uma reta que não é maior que o espalhamento não vira prazo.
 */
export function temperatureLife(buckets: readonly VibrationBucket[]): RemainingLife {
  const asVibration = buckets.map((bucket) => ({ ...bucket, rmsAvgMmS: bucket.tempAvgC }));
  return estimateRemainingLife(asVibration, {
    aToB: TEMP_LIMITS.attention,
    bToC: TEMP_LIMITS.attention,
    cToD: TEMP_LIMITS.attention,
  });
}
