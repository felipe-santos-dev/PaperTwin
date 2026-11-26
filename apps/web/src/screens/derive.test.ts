import { describe, expect, it } from 'vitest';
import type { WebBreak } from '@mp1/shared';

import type { ReelView } from '../api/process';
import { breakMarks, merge, outRuns } from './bobinas/derive';
import { cellOf, controlChart, stateOf } from './laboratorio/derive';
import { rank, visible, zoneOf } from './mancais/derive';
import { variablesFor } from './ProcessoScreen';
import { stateOfPoint } from './rondas/derive';
import {
  accumulate,
  coveredFrom,
  lanes,
  production,
  scrap,
  timeEfficiencyPct,
  type Point,
} from './turno/derive';

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

  /**
   * Sem linha livre, o rótulo não é mostrado.
   *
   * Empurrá-lo para a linha menos ocupada é o que punha um rótulo em cima do
   * outro: quatro alarmes no mesmo minuto davam quatro rótulos ilegíveis no
   * lugar de um. `null` quer dizer "só o símbolo".
   */
  it('devolve null quando nenhuma linha tem espaço', () => {
    const juntos = Array.from({ length: 6 }, (_, i) => ({ x: i * 4, width: 100 }));
    expect(lanes(juntos)).toEqual([0, 1, 2, 3, null, null]);
  });

  it('a linha volta a servir depois que o rótulo anterior termina', () => {
    expect(
      lanes(
        [
          { x: 0, width: 50 },
          { x: 10, width: 50 },
          { x: 200, width: 50 },
        ],
        2,
      ),
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

describe('ranking de mancais', () => {
  const limits = { aToB: 2.3, bToC: 4.5, cToD: 7.1 };
  const row = (tag: string, rms: number) => ({
    assetTag: tag,
    label: tag,
    side: 'LC',
    vibrationTag: null,
    temperatureTag: null,
    rms,
    temperature: null,
    limits,
    zone: zoneOf(rms, limits),
  });

  it('mostra sempre B, C e D e completa com os 10 de maior vibração', () => {
    const rows = rank([
      ...Array.from({ length: 20 }, (_, i) => row(`A${String(i)}`, 1 + i * 0.05)),
      row('C1', 5),
      row('B1', 3),
    ]);
    const shown = visible(rows);
    expect(shown[0]?.assetTag).toBe('C1');
    expect(shown[1]?.assetTag).toBe('B1');
    expect(shown).toHaveLength(10);
  });

  it('não esconde um mancal em B mesmo fora dos 10 primeiros', () => {
    const rows = rank([
      ...Array.from({ length: 12 }, (_, i) => row(`B${String(i)}`, 3 + i * 0.01)),
    ]);
    expect(visible(rows)).toHaveLength(12);
  });
});

describe('ronda', () => {
  const point = (field: number, online: number, noise: 'normal' | 'anormal' = 'normal') => ({
    assetTag: 'MP1-SEC-G4-CS23-MLC',
    fieldTempC: field,
    noise,
    leak: 'nenhum' as const,
    note: null,
    onlineTag: 'TI-5323B',
    onlineValue: online,
  });

  it('aceita a carcaça 3 °C mais fria que o sensor', () => {
    expect(stateOfPoint(point(63, 66))).toBe('feito');
    expect(stateOfPoint(point(64.5, 66))).toBe('feito');
  });

  it('acha divergência fora do esperado e ruído anormal', () => {
    expect(stateOfPoint(point(66, 66))).toBe('achado');
    expect(stateOfPoint(point(58, 66))).toBe('achado');
    expect(stateOfPoint(point(63, 66, 'anormal'))).toBe('achado');
  });
});

/**
 * O buraco de arquivo no começo do turno.
 *
 * A simulação retoma no máximo quatro horas. Num turno de 14:00 às 22:00 visto
 * às 20:00, o arquivo começa às 16:00 — e integrar de lá até agora chamando
 * isso de "produção do turno" cobrava do turno duas horas que ninguém gravou.
 */
describe('janela realmente coberta pelo arquivo', () => {
  const turno = { from: T0, to: T0 + 8 * H };

  it('é o início do turno quando a série cobre tudo', () => {
    const series: Point[] = [
      { t: T0, v: 45 },
      { t: T0 + 4 * H, v: 45 },
    ];
    expect(coveredFrom(series, turno)).toBe(T0);
  });

  it('é o primeiro instante arquivado quando falta o começo', () => {
    const series: Point[] = [
      { t: T0 + 2 * H, v: 45 },
      { t: T0 + 4 * H, v: 45 },
    ];
    expect(coveredFrom(series, turno)).toBe(T0 + 2 * H);
  });

  it('série vazia não cobre nada', () => {
    expect(coveredFrom([], turno)).toBe(turno.to);
  });

  /**
   * O ritmo cobra o tempo medido, não o tempo que passou.
   *
   * Com arquivo de duas horas num turno de seis horas decorridas, o acumulado
   * são duas horas de papel — e o ritmo da meta tem de ser o de duas horas. Era
   * aqui que o placar dizia "−85 t vs. ritmo" sobre um turno que não estava
   * atrasado.
   */
  it('o ritmo da meta cobra só a janela coberta', () => {
    const series: Point[] = [
      { t: T0 + 4 * H, v: 45 },
      { t: T0 + 6 * H, v: 45 },
    ];
    const prod = production(series, turno, T0 + 6 * H);

    expect(prod.coveredFrom).toBe(T0 + 4 * H);
    expect(prod.gapMs).toBe(4 * H);
    // duas horas medidas: o acumulado e o ritmo falam do mesmo tempo
    expect(prod.nowT).toBeCloseTo(90, 6);
    expect(prod.paceT / prod.nowT).toBeGreaterThan(0.9);
    expect(prod.paceT / prod.nowT).toBeLessThan(1.1);
    // a meta do turno continua sendo a das 8 h
    expect(prod.goalT).toBeGreaterThan(prod.paceT);
  });

  it('sem buraco, o ritmo cobra o turno decorrido', () => {
    const series: Point[] = [
      { t: T0, v: 45 },
      { t: T0 + 6 * H, v: 45 },
    ];
    const prod = production(series, turno, T0 + 6 * H);

    expect(prod.gapMs).toBe(0);
    expect(prod.coveredFrom).toBe(T0);
  });
});

/**
 * Eficiência **de tempo**, que é o que o painel sempre disse no título.
 *
 * O número que ele mostrava era `efficiencyPct` da API — produção sobre nominal,
 * presa em 100 por um `Math.min`. Com a máquina em regime isso dá 100,0 % e uma
 * quebra de 22 min não aparecia em lugar nenhum do placar.
 */
describe('eficiência de tempo', () => {
  it('desconta o tempo de folha quebrada', () => {
    // 22 min de quebra num turno de 8 h
    expect(timeEfficiencyPct(480, 22)).toBeCloseTo(95.42, 2);
    expect(timeEfficiencyPct(480, 0)).toBe(100);
    expect(timeEfficiencyPct(240, 24)).toBeCloseTo(90, 6);
  });

  it('não passa de 100 nem desce abaixo de zero', () => {
    expect(timeEfficiencyPct(480, -5)).toBe(100);
    expect(timeEfficiencyPct(480, 600)).toBe(0);
  });

  it('turno que não começou não tem eficiência', () => {
    expect(timeEfficiencyPct(0, 0)).toBe(0);
  });
});
