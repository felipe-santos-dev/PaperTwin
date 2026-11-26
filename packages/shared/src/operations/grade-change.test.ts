import { describe, expect, it } from 'vitest';

import {
  GSM_TOLERANCE_FRACTION,
  gradeChangeStepGsm,
  gradeInForceAt,
  gsmTolerance,
  stabilizationS,
  type GradeChange,
} from './grade-change';

const troca = (over: Partial<GradeChange> = {}): GradeChange => ({
  id: 'TG-1',
  shiftId: 'T-2026-06-15-B',
  fromGsm: 75,
  toGsm: 80,
  startedAt: '2026-06-15T18:00:00.000Z',
  stabilizedAt: '2026-06-15T18:12:00.000Z',
  affectedReels: [412],
  ...over,
});

describe('a troca de gramatura', () => {
  it('diz quanto mudou e quanto levou', () => {
    expect(gradeChangeStepGsm(troca())).toBe(5);
    expect(stabilizationS(troca())).toBe(720);
    expect(stabilizationS(troca({ stabilizedAt: null }))).toBeNull();
  });
});

/**
 * A tolerância segue a gramatura em vigor.
 *
 * O catálogo traz `AIC-902` com L/H em 73,5–76,5, que é 75 ± 2 %. Depois de uma
 * troca para 80, a tela de Bobinas media a folha de 80 g/m² contra essa faixa e
 * mostrava a bobina inteira fora de uma tolerância que já não era a dela.
 */
describe('a tolerância da gramatura', () => {
  it('é o alvo mais ou menos 2 %', () => {
    expect(GSM_TOLERANCE_FRACTION).toBe(0.02);

    const [lo, hi] = gsmTolerance(75);
    expect(lo).toBeCloseTo(73.5, 9);
    expect(hi).toBeCloseTo(76.5, 9);
  });

  it('acompanha a gramatura nova', () => {
    const [lo, hi] = gsmTolerance(80);
    expect(lo).toBeCloseTo(78.4, 9);
    expect(hi).toBeCloseTo(81.6, 9);
  });
});

describe('a gramatura em vigor num instante', () => {
  const at = (iso: string) => Date.parse(iso);

  it('sem troca registrada, vale o alvo que quem chama tem', () => {
    expect(gradeInForceAt([], at('2026-06-15T19:00:00Z'), 75)).toBe(75);
  });

  it('antes da troca mais antiga, vale a gramatura de saída dela', () => {
    expect(gradeInForceAt([troca()], at('2026-06-15T17:00:00Z'), 999)).toBe(75);
  });

  /**
   * O corte é o **início** da troca, não a estabilização.
   *
   * A partir do momento em que o setpoint muda, a folha que sai é da gramatura
   * nova, ainda que leve minutos para entrar na faixa dela. É por isso que a
   * bobina que pega a transição é rebaixada em vez de medida contra a
   * tolerância antiga.
   */
  it('depois do início da troca, vale a gramatura de entrada', () => {
    expect(gradeInForceAt([troca()], at('2026-06-15T18:00:00Z'), 999)).toBe(80);
    expect(gradeInForceAt([troca()], at('2026-06-15T18:05:00Z'), 999)).toBe(80);
    expect(gradeInForceAt([troca()], at('2026-06-15T23:00:00Z'), 999)).toBe(80);
  });

  it('com várias trocas, vale a última que já começou', () => {
    const trocas = [
      troca({ id: 'TG-2', fromGsm: 80, toGsm: 90, startedAt: '2026-06-15T20:00:00.000Z' }),
      troca(),
    ];

    expect(gradeInForceAt(trocas, at('2026-06-15T19:00:00Z'), 999)).toBe(80);
    expect(gradeInForceAt(trocas, at('2026-06-15T21:00:00Z'), 999)).toBe(90);
  });
});
