import { describe, expect, it } from 'vitest';
import { DRYER_BEARING_ISO, isoLimitsOf } from './iso20816';
import { estimateRemainingLife } from './rul';
import type { VibrationBucket } from './vibration';

const limits = isoLimitsOf(DRYER_BEARING_ISO); // C→D em 4,5 mm/s

const DAY = 24 * 60 * 60 * 1000;
const START = Date.parse('2026-03-01T00:00:00Z');

/** Monta janelas diárias com os valores médios dados. */
function buckets(values: readonly number[]): VibrationBucket[] {
  return values.map((rms, i) => ({
    bucketStart: new Date(START + i * DAY).toISOString(),
    samples: 96,
    rmsAvgMmS: rms,
    rmsMaxMmS: rms * 1.1,
    tempAvgC: 60,
    envelopeMaxGe: 0.5,
  }));
}

describe('estimateRemainingLife', () => {
  it('mede a inclinação em mm/s por dia', () => {
    const life = estimateRemainingLife(buckets([1, 1.5, 2, 2.5, 3]), limits);
    expect(life.trendMmSPerDay).toBeCloseTo(0.5, 6);
    expect(life.samples).toBe(5);
  });

  it('diz quantos dias faltam até a zona D', () => {
    // sai de 1,0 subindo 0,5/dia; o ajuste no último ponto dá 3,0
    // faltam (4,5 − 3,0) / 0,5 = 3 dias
    const life = estimateRemainingLife(buckets([1, 1.5, 2, 2.5, 3]), limits);
    expect(life.daysToZoneD).toBeCloseTo(3, 6);
  });

  it('devolve zero quando a tendência já passou da fronteira', () => {
    const life = estimateRemainingLife(buckets([4, 4.6, 5.2, 5.8]), limits);
    expect(life.daysToZoneD).toBe(0);
  });

  it('não estima nada com tendência plana', () => {
    const life = estimateRemainingLife(buckets([2, 2, 2, 2, 2]), limits);
    expect(life.daysToZoneD).toBeNull();
    expect(life.trendMmSPerDay).toBeCloseTo(0, 9);
  });

  it('não estima nada com tendência de queda', () => {
    const life = estimateRemainingLife(buckets([3, 2.5, 2, 1.5]), limits);
    expect(life.trendMmSPerDay).toBeLessThan(0);
    expect(life.daysToZoneD).toBeNull();
  });

  it('recusa ajuste com menos de três pontos', () => {
    expect(estimateRemainingLife(buckets([1, 2]), limits)).toEqual({
      trendMmSPerDay: 0,
      daysToZoneD: null,
      samples: 2,
    });
    expect(estimateRemainingLife([], limits).samples).toBe(0);
  });

  it('não deixa um pico isolado encurtar a previsão', () => {
    // a reta é a mesma; o que muda é só o último ponto estar fora dela
    const regular = estimateRemainingLife(buckets([1, 1.5, 2, 2.5, 3]), limits);
    const comPico = estimateRemainingLife(buckets([1, 1.5, 2, 2.5, 4.4]), limits);

    // o pico puxa a reta, mas a previsão não desaba para quase zero
    expect(comPico.daysToZoneD).toBeGreaterThan(0.5);
    expect(comPico.daysToZoneD).toBeLessThan(regular.daysToZoneD ?? Infinity);
  });

  it('ordena as janelas antes de ajustar', () => {
    const embaralhado = [...buckets([1, 1.5, 2, 2.5, 3])].reverse();
    expect(estimateRemainingLife(embaralhado, limits).trendMmSPerDay).toBeCloseTo(0.5, 6);
  });

  it('descarta janela com data inválida em vez de contaminar o ajuste', () => {
    const comLixo: VibrationBucket[] = [
      ...buckets([1, 1.5, 2, 2.5, 3]),
      {
        bucketStart: 'não é data',
        samples: 1,
        rmsAvgMmS: 99,
        rmsMaxMmS: 99,
        tempAvgC: 0,
        envelopeMaxGe: 0,
      },
    ];
    const life = estimateRemainingLife(comLixo, limits);
    expect(life.samples).toBe(5);
    expect(life.trendMmSPerDay).toBeCloseTo(0.5, 6);
  });

  it('é mais exigente com limites mais apertados', () => {
    const série = buckets([1, 1.5, 2, 2.5, 3]);
    const apertado = estimateRemainingLife(série, { aToB: 0.7, bToC: 1.4, cToD: 3.5 });
    const folgado = estimateRemainingLife(série, { aToB: 3.5, bToC: 7.1, cToD: 11 });

    expect(apertado.daysToZoneD).toBeLessThan(folgado.daysToZoneD ?? Infinity);
  });
});
