import {
  BEARING_TEMP_LIMITS,
  classifyIsoZone,
  temperatureLife as temperatureLifeTo,
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

/**
 * Temperatura de atenção e de alarme do mancal, em °C (as marcas da barra).
 *
 * Saem do **catálogo**, pelos limites `H` e `HH` da tag `TI-53nn`. Estavam
 * escritas aqui à mão, em 80 e 90, enquanto o alarme dispara em 85 e 95 — a
 * barra marcava um número e o alarme outro, na mesma tela. Agora é uma régua
 * só, a mesma que a regra da nota sugerida usa.
 */
export const TEMP_LIMITS = BEARING_TEMP_LIMITS;

/**
 * Projeção da temperatura até o limite de atenção.
 *
 * A conta mora no `shared`, junto da regra que vira sugestão: a tela e a regra
 * não podem projetar a temperatura de dois jeitos, senão o cartão diria um
 * prazo e o gráfico ao lado dele outro.
 */
export function temperatureLife(buckets: readonly VibrationBucket[]): RemainingLife {
  return temperatureLifeTo(buckets, TEMP_LIMITS.attention);
}
