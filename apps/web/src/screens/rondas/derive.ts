import type { MaintenanceNote, Round, RoundPoint } from '@mp1/shared';

import { signedNum } from '../../ui/format';

/**
 * As contas da tela de Rondas.
 *
 * Campo × online só na temperatura do mancal: é a única grandeza que o coletor
 * e o DCS medem os dois. O pirômetro de campo mede a carcaça por fora, que é
 * mais fria que o sensor dentro da caixa — a simulação assume 3 °C
 * (`FIELD_PYROMETER_OFFSET_C` na API), e a tela usa a mesma suposição como o
 * desvio esperado. Passar de ±2 °C em torno dele é achado (**suposição** desta
 * tela, o dobro do ruído da leitura de campo), junto com ruído e vazamento.
 */

/** Campo − online esperado em operação normal, em °C. */
export const EXPECTED_OFFSET_C = -3;
export const TEMP_TOLERANCE_C = 2;

/** Fora do esperado: |Δ − desvio esperado| acima da tolerância. */
export function divergent(delta: number | null): boolean {
  return delta !== null && Math.abs(delta - EXPECTED_OFFSET_C) > TEMP_TOLERANCE_C;
}

export type PointState = 'feito' | 'achado';

export function deltaOf(point: RoundPoint): number | null {
  return point.fieldTempC === null || point.onlineValue === null
    ? null
    : point.fieldTempC - point.onlineValue;
}

/** O que o ponto tem a relatar, em português; vazio quando nada. */
export function findings(point: RoundPoint): string[] {
  const out: string[] = [];
  if (point.noise !== 'normal') out.push(`ruído ${point.noise}`);
  if (point.leak !== 'nenhum') out.push(`vazamento ${point.leak}`);
  const delta = deltaOf(point);
  if (delta !== null && divergent(delta)) {
    // o sinal sai do número arredondado, no `format.ts`: nunca "−0,0"
    out.push(`campo × online ${signedNum(delta, 1)} °C`);
  }
  return out;
}

export function stateOfPoint(point: RoundPoint): PointState {
  return findings(point).length > 0 ? 'achado' : 'feito';
}

/** A nota que nasceu deste ponto: mesmo ativo e a ronda entre as evidências. */
export function noteOf(
  round: Round,
  point: RoundPoint,
  notes: readonly MaintenanceNote[],
): MaintenanceNote | null {
  return (
    notes.find(
      (note) =>
        note.assetTag === point.assetTag &&
        (note.originRef === round.id ||
          note.evidence.some((e) => e.kind === 'ronda' && e.ref === round.id)),
    ) ?? null
  );
}
