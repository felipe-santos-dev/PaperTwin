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

describe('dado fixo de laboratório', () => {
  it('só aponta para bobinas que existem e já fecharam', () => {
    const all = reels();
    const closed = new Set(all.filter((r) => r.endedAt).map((r) => r.number));
    for (const result of labResults(all, NOW)) {
      expect(closed.has(result.reelNumber), String(result.reelNumber)).toBe(true);
    }
  });

  it('dá o mesmo número toda vez', () => {
    expect(labResults(reels(), NOW)).toEqual(labResults(reels(), NOW));
  });

  it('usa só ensaios conhecidos', () => {
    const known = new Set(LAB_SPECS.map((spec) => spec.tag));
    for (const result of labResults(reels(), NOW)) expect(known.has(result.tag)).toBe(true);
  });

  it('põe o Cobb da última fechada fora da especificação e a retém', () => {
    const all = reels();
    const scenario = scenarioOf(all);
    const cobb = labResults(all, NOW).find(
      (r) => r.tag === 'LAB-1211' && r.reelNumber === scenario?.held.number,
    );
    expect(cobb?.value).toBe(COBB_HELD);

    const holds = reelHolds(all);
    expect(holds.map((h) => [h.reelNumber, h.status])).toEqual([
      [1184, 'retida'],
      [1183, 'em avaliação'],
    ]);
  });

  it('sem duas bobinas fechadas não há cenário', () => {
    expect(scenarioOf(reels().slice(-2))).toBeNull();
    expect(reelHolds(reels().slice(-2))).toEqual([]);
  });
});

describe('TAGs fixas do preparo', () => {
  it('a cola fica abaixo de L e alarma depois da queda', () => {
    const fixed = fixedProcess(reels(), NOW);
    const akd = fixed.values.find((v) => v.tag === 'FIC-107');
    expect(akd?.value).toBeLessThan(1.2);
    expect(fixed.alarms.map((a) => a.tag)).toEqual(['FIC-107']);
  });

  it('antes da queda a cola está no SP e não há alarme', () => {
    const scenario = scenarioOf(reels());
    const before = new Date(Date.parse(scenario?.akdSince ?? NOW) - 60_000).toISOString();
    const fixed = fixedProcess(reels(), before);
    expect(fixed.values.find((v) => v.tag === 'FIC-107')?.value).toBeCloseTo(1.4, 1);
    expect(fixed.alarms).toEqual([]);
  });

  it('a tendência tem o formato da rota real e marca que é fixa', () => {
    const trend = fixedTrend(reels(), 'FIC-107', NOW, { buckets: 60 });
    expect(trend?.illustrative).toBe(true);
    expect(trend?.buckets).toHaveLength(60);
    expect(fixedTrend(reels(), 'PIC-513', NOW)).toBeNull();
  });
});
