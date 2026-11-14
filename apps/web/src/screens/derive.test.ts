import { describe, expect, it } from 'vitest';
import type { WebBreak } from '@mp1/shared';

import type { ReelView } from '../api/process';
import { breakMarks, merge, outRuns } from './bobinas/derive';
import { cellOf, controlChart, stateOf } from './laboratorio/derive';
import { variablesFor } from './ProcessoScreen';
import { accumulate, lanes, production, scrap, type Point } from './turno/derive';

const T0 = Date.parse('2026-06-15T17:00:00Z');
const H = 3_600_000;

describe('produção acumulada', () => {
  it('integra a produção instantânea no tempo', () => {
    const series: Point[] = [
      { t: T0, v: 40 },
      { t: T0 + H, v: 40 },
      { t: T0 + 2 * H, v: 50 },
    ];
    // 1 h a 40 t/h + 1 h subindo de 40 a 50 = 40 + 45
    expect(accumulate(series, T0, T0 + 2 * H).at(-1)?.v).toBeCloseTo(85, 6);
  });

  it('anda dentro da bobina em curso: cada amostra sobe a curva', () => {
    const series: Point[] = [
      { t: T0, v: 45 },
      { t: T0 + H, v: 45 },
    ];
    const curve = accumulate(series, T0, T0 + H / 2);
    expect(curve.at(-1)?.v).toBeCloseTo(22.5, 6);
  });

  it('meta, ritmo e projeção saem do alvo de XI-0001 e da última hora', () => {
    const series: Point[] = [
      { t: T0, v: 45 },
      { t: T0 + 2 * H, v: 45 },
    ];
    const prod = production(series, { from: T0, to: T0 + 8 * H }, T0 + 2 * H);
    expect(prod.goalT).toBeCloseTo(360, 6);
    expect(prod.paceT).toBeCloseTo(90, 6);
    expect(prod.nowT).toBeCloseTo(90, 6);
    expect(prod.projectedT).toBeCloseTo(360, 6);
  });
});

describe('refugo', () => {
  const quebra: WebBreak = {
    id: 'Q1',
    shiftId: 'T',
    startedAt: new Date(T0 + H).toISOString(),
    endedAt: new Date(T0 + H + 20 * 60_000).toISOString(),
    section: 'press',
    probableCause: 'teste',
    precursors: [],
  } as unknown as WebBreak;

  it('soma segregadas e o papel das quebras sobre a produção bruta', () => {
    const series: Point[] = [
      { t: T0, v: 45 },
      { t: T0 + 3 * H, v: 45 },
    ];
    const reels = [
      { disposition: 'segregada', weightT: 9 },
      { disposition: 'rebaixada', weightT: 40 },
    ] as unknown as ReelView[];
    const result = scrap(reels, [quebra], series, 120, T0 + 3 * H);
    expect(result.segregatedT).toBe(9);
    expect(result.breakT).toBeCloseTo(15, 6); // 20 min × 45 t/h
    expect(result.pct).toBeCloseTo(((9 + 15) / 135) * 100, 6);
  });
});

describe('rótulos da linha do tempo', () => {
  it('desce para a linha seguinte quando o rótulo não cabe', () => {
    expect(
      lanes([
        { x: 0, width: 100 },
        { x: 50, width: 100 },
        { x: 300, width: 50 },
      ]),
    ).toEqual([0, 1, 0]);
  });
});

describe('trechos fora na bobina', () => {
  const span = { from: T0, to: T0 + H };

  it('acha o trecho em que a série saiu da tolerância', () => {
    const series: Point[] = [
      { t: T0, v: 75 },
      { t: T0 + 0.4 * H, v: 75 },
      { t: T0 + 0.41 * H, v: 78 },
      { t: T0 + 0.6 * H, v: 78 },
      { t: T0 + 0.61 * H, v: 75 },
      { t: T0 + H, v: 75 },
    ];
    const { runs, coverage } = outRuns(series, span, 73.5, 76.5);
    expect(coverage).toBe(1);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.from).toBeGreaterThan(0.39);
    expect(runs[0]?.to).toBeLessThan(0.62);
  });

  it('não inventa trecho onde o historiador não cobre', () => {
    const series: Point[] = [
      { t: T0 + 0.5 * H, v: 75 },
      { t: T0 + H, v: 75 },
    ];
    const { runs, coverage } = outRuns(series, span, 73.5, 76.5);
    expect(runs).toEqual([]);
    expect(coverage).toBeLessThan(0.6);
  });

  it('junta trechos sobrepostos e põe a quebra na posição do tempo', () => {
    expect(
      merge([
        { from: 0.5, to: 0.7 },
        { from: 0.1, to: 0.2 },
        { from: 0.6, to: 0.8 },
      ]),
    ).toEqual([
      { from: 0.1, to: 0.2 },
      { from: 0.5, to: 0.8 },
    ]);
    const quebra = { startedAt: new Date(T0 + H / 4).toISOString() } as WebBreak;
    expect(breakMarks([quebra], span)).toEqual([0.25]);
  });
});

describe('laboratório', () => {
  const spec = {
    tag: 'LAB-1211',
    label: 'Cobb',
    unit: 'g/m²',
    lo: 22,
    hi: 28,
    target: 25,
    everyReels: 1,
  };

  it('separa dentro, no limite e fora pela faixa da especificação', () => {
    expect(stateOf(spec, 25)).toBe('dentro');
    expect(stateOf(spec, 27.6)).toBe('limite');
    expect(stateOf(spec, 29.4)).toBe('fora');
  });

  it('diz atrasado só quando o ensaio era desta bobina', () => {
    const reel = { number: 1185 } as ReelView;
    expect(cellOf({ ...spec, everyReels: 5 }, reel, []).state).toBe('atrasado');
    expect(cellOf({ ...spec, everyReels: 2 }, reel, []).state).toBe('não programado');
  });

  it('calcula os limites de controle sem as últimas bobinas', () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      reelNumber: 1170 + i,
      tag: 'LAB-1211',
      value: i < 10 ? (i % 2 === 0 ? 24.8 : 25.2) : 29,
      unit: 'g/m²',
      analyzedAt: '',
    }));
    const chart = controlChart(spec, results);
    expect(chart?.base).toEqual([1170, 1179]);
    expect(chart?.mean).toBeCloseTo(25, 6);
    expect(chart?.ucl).toBeGreaterThan(25.5);
    expect(chart?.cpk).toBeGreaterThan(1);
  });
});

describe('seções do processo', () => {
  it('agrupa a pré-secagem por grupo de vapor e põe as fixas no preparo', () => {
    const pre = variablesFor('pré-secagem');
    expect(pre.slice(0, 3).map((v) => v.tag)).toEqual(['PIC-511', 'PDIC-521', 'LIC-531']);
    expect(pre.some((v) => v.tag === 'TIC-505')).toBe(true);
    expect(variablesFor('preparo').some((v) => v.tag === 'FIC-107')).toBe(true);
    expect(variablesFor('pré-secagem').some((v) => v.tag === 'FIC-107')).toBe(false);
  });
});
