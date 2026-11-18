import { describe, expect, it } from 'vitest';

import type { ReelView } from '../process';
import { COBB_HELD, LAB_SPECS, labResults, reelHolds } from './lab';
import { fixedProcess, fixedTrend } from './process';
import { scenarioOf } from './scenario';

/** Doze bobinas fechadas de 53 min e uma em formação. */
function reels(): ReelView[] {
  const start = Date.parse('2026-06-15T09:00:00Z');
  const step = 53 * 60 * 1000;
  return Array.from({ length: 13 }, (_, i) => {
    const number = 1173 + i;
    const open = i === 12;
    return {
      number,
      shiftId: 'T',
      startedAt: new Date(start + i * step).toISOString(),
      endedAt: open ? null : new Date(start + (i + 1) * step).toISOString(),
      weightT: open ? null : 41.8,
      lengthM: open ? null : 69_600,
      finalDiameterMm: null,
      basisWeightGsm: 75.1,
      moisturePct: 4.8,
      caliperUm: 102,
      cdSpread: null,
      splices: 0,
      disposition: open ? null : 'aprovada',
      dispositionReason: null,
    };
  });
}

const NOW = new Date(Date.parse('2026-06-15T09:00:00Z') + 12.5 * 53 * 60 * 1000).toISOString();

/** A cola caiu durante a décima bobina: é o alarme que o simulador levanta. */
const AKD_SINCE = new Date(
  Date.parse('2026-06-15T09:00:00Z') + 10.2 * 53 * 60 * 1000,
).toISOString();

describe('dado fixo de laboratório', () => {
  it('só aponta para bobinas que existem e já fecharam', () => {
    const all = reels();
    const closed = new Set(all.filter((r) => r.endedAt).map((r) => r.number));
    for (const result of labResults(all, NOW, AKD_SINCE)) {
      expect(closed.has(result.reelNumber), String(result.reelNumber)).toBe(true);
    }
  });

  it('dá o mesmo número toda vez', () => {
    expect(labResults(reels(), NOW, AKD_SINCE)).toEqual(labResults(reels(), NOW, AKD_SINCE));
  });

  it('usa só ensaios conhecidos', () => {
    const known = new Set(LAB_SPECS.map((spec) => spec.tag));
    for (const result of labResults(reels(), NOW, AKD_SINCE)) {
      expect(known.has(result.tag)).toBe(true);
    }
  });

  it('põe o Cobb da última fechada fora da especificação e a retém', () => {
    const all = reels();
    const scenario = scenarioOf(all, AKD_SINCE);
    const cobb = labResults(all, NOW, AKD_SINCE).find(
      (r) => r.tag === 'LAB-1211' && r.reelNumber === scenario?.held.number,
    );
    expect(cobb?.value).toBe(COBB_HELD);

    const holds = reelHolds(all, AKD_SINCE);
    expect(holds.map((h) => [h.reelNumber, h.status])).toEqual([
      [1184, 'retida'],
      [1183, 'em avaliação'],
    ]);
  });

  /**
   * É esta a mudança da Fase 3: a retenção segue o alarme do simulador.
   *
   * Sem alarme de cola não há bobina retida — antes havia, porque o cenário
   * inventava o instante da queda e sempre o encontrava.
   */
  it('sem alarme de cola não há cenário nem retenção', () => {
    expect(scenarioOf(reels(), null)).toBeNull();
    expect(reelHolds(reels(), null)).toEqual([]);
  });

  it('sem duas bobinas fechadas depois da queda não há cenário', () => {
    expect(scenarioOf(reels().slice(-2), AKD_SINCE)).toBeNull();
    expect(reelHolds(reels().slice(-2), AKD_SINCE)).toEqual([]);
  });
});

describe('TAGs fixas do preparo', () => {
  /**
   * Sobrou uma.
   *
   * As outras seis — grau Schopper, carga e posição do refinador, cola AKD,
   * amido e nível do tanque — entraram no catálogo na Fase 3 e agora são
   * simuladas. O que este teste segura é que elas **não voltem** para cá.
   */
  it('é só o branqueador, e ele não alarma', () => {
    const fixed = fixedProcess(NOW);
    expect(fixed.values.map((v) => v.tag)).toEqual(['FIC-110']);
    expect(fixed.alarms).toEqual([]);
    expect(fixed.illustrative).toBe(true);
  });

  it('a tendência tem o formato da rota real e marca que é fixa', () => {
    const trend = fixedTrend('FIC-110', NOW, { buckets: 60 });
    expect(trend?.illustrative).toBe(true);
    expect(trend?.buckets).toHaveLength(60);
    expect(fixedTrend('PIC-513', NOW)).toBeNull();
  });
});
