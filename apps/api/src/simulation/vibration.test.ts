import { describe, expect, it } from 'vitest';
import { classifyIsoZone, DRYER_BEARING_ISO, isoLimitsOf } from '@mp1/shared';
import { DEGRADING_TAG } from '../db/seed';
import { simulateVibration, type SimulationOptions } from './vibration';

const limits = isoLimitsOf(DRYER_BEARING_ISO); // 1,4 / 2,8 / 4,5

const from = new Date('2026-03-01T00:00:00Z');
const to = new Date('2026-03-04T00:00:00Z'); // 72 h

const options: SimulationOptions = {
  bearings: [{ tag: DEGRADING_TAG }, { tag: 'MP1-SEC-G1-CS01-MLA' }, { tag: 'MP1-POP-TBR-MLC' }],
  from,
  to,
  intervalMs: 15 * 60 * 1000,
  degradingTag: DEGRADING_TAG,
};

const series = simulateVibration(options);
const of = (tag: string) => series.filter((reading) => reading.assetTag === tag);

describe('simulateVibration', () => {
  it('gera uma amostra por intervalo, por mancal', () => {
    // 72 h a cada 15 min, com as duas pontas
    const esperado = (72 * 60) / 15 + 1;
    expect(of(DEGRADING_TAG)).toHaveLength(esperado);
    expect(series).toHaveLength(esperado * options.bearings.length);
  });

  it('é determinística: a mesma janela dá a mesma série', () => {
    expect(simulateVibration(options)).toEqual(series);
  });

  it('recusa janela invertida e intervalo não positivo', () => {
    expect(() => simulateVibration({ ...options, from: to, to: from })).toThrow(RangeError);
    expect(() => simulateVibration({ ...options, intervalMs: 0 })).toThrow(RangeError);
  });
});

describe('mancais saudáveis', () => {
  const saudáveis = series.filter((reading) => reading.assetTag !== DEGRADING_TAG);

  it('ficam nas zonas A e B o tempo todo', () => {
    for (const reading of saudáveis) {
      expect(['A', 'B']).toContain(classifyIsoZone(reading.rmsMmS, limits));
    }
  });

  it('não têm tendência: começam e terminam na mesma faixa', () => {
    const outro = of('MP1-SEC-G1-CS01-MLA');
    const primeiros = outro.slice(0, 10);
    const últimos = outro.slice(-10);
    const média = (xs: typeof outro) => xs.reduce((s, r) => s + r.rmsMmS, 0) / xs.length;

    expect(Math.abs(média(últimos) - média(primeiros))).toBeLessThan(0.1);
  });

  it('dá assinatura própria a cada mancal', () => {
    const a = of('MP1-SEC-G1-CS01-MLA')[0]?.rmsMmS ?? 0;
    const b = of('MP1-POP-TBR-MLC')[0]?.rmsMmS ?? 0;
    expect(a).not.toBeCloseTo(b, 2);
  });
});

describe('mancal em degradação', () => {
  const degradando = of(DEGRADING_TAG);
  const zonas = degradando.map((reading) => classifyIsoZone(reading.rmsMmS, limits));

  it('começa saudável', () => {
    expect(['A', 'B']).toContain(zonas[0]);
  });

  it('termina na zona D', () => {
    expect(zonas.at(-1)).toBe('D');
    expect(degradando.at(-1)?.rmsMmS).toBeGreaterThan(limits.cToD);
  });

  it('passa por todas as zonas no caminho, sem pular nenhuma', () => {
    expect(new Set(zonas)).toEqual(new Set(['A', 'B', 'C', 'D']));
  });

  it('cruza C→D uma vez só, e não fica oscilando na fronteira', () => {
    let cruzamentos = 0;
    for (let i = 1; i < zonas.length; i += 1) {
      if (zonas[i] === 'D' && zonas[i - 1] !== 'D') cruzamentos += 1;
    }
    expect(cruzamentos).toBe(1);
  });

  it('acelera: a segunda metade sobe mais que a primeira', () => {
    const meio = Math.floor(degradando.length / 2);
    const primeiro = degradando[0]?.rmsMmS ?? 0;
    const central = degradando[meio]?.rmsMmS ?? 0;
    const último = degradando.at(-1)?.rmsMmS ?? 0;

    expect(último - central).toBeGreaterThan(central - primeiro);
  });

  it('põe o envelope na frente da velocidade', () => {
    // é por isso que se mede envelope: ele acusa o defeito antes
    const início = degradando[0];
    const meio = degradando[Math.floor(degradando.length / 2)];
    if (!início || !meio) throw new Error('série curta demais');

    const avançoEnvelope = meio.envelopeGe / início.envelopeGe;
    const avançoRms = meio.rmsMmS / início.rmsMmS;

    expect(avançoEnvelope).toBeGreaterThan(avançoRms);
  });

  it('esquenta o mancal junto, mas bem menos que a vibração', () => {
    const início = degradando[0];
    const fim = degradando.at(-1);
    if (!início || !fim) throw new Error('série curta demais');

    expect(fim.tempC).toBeGreaterThan(início.tempC);
    expect(fim.tempC / início.tempC).toBeLessThan(fim.rmsMmS / início.rmsMmS);
  });
});
