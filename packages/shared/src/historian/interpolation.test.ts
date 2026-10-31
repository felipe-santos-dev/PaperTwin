import { describe, expect, it } from 'vitest';

import { interpolate, readAt, timeWeightedAverage } from './interpolation';
import type { Sample } from './types';

const s = (t: number, v: number): Sample => ({ t: t * 1000, v });

describe('interpolação linear', () => {
  it('anda proporcional ao tempo entre dois pontos', () => {
    expect(interpolate(s(0, 100), s(10, 200), 5000)).toBeCloseTo(150, 9);
    expect(interpolate(s(0, 100), s(10, 200), 2500)).toBeCloseTo(125, 9);
  });

  it('devolve as pontas nas pontas', () => {
    expect(interpolate(s(0, 100), s(10, 200), 0)).toBe(100);
    expect(interpolate(s(0, 100), s(10, 200), 10_000)).toBe(200);
  });

  it('com dois valores no mesmo instante, o mais recente vale', () => {
    expect(interpolate(s(5, 100), s(5, 200), 5000)).toBe(200);
  });
});

describe('leitura num instante', () => {
  it('é exata quando há ponto no instante', () => {
    expect(readAt(5000, s(5, 130), s(10, 140))).toEqual({ t: 5000, v: 130, kind: 'exata' });
  });

  it('é interpolada entre dois pontos', () => {
    const lida = readAt(5000, s(0, 100), s(10, 200));
    expect(lida?.kind).toBe('interpolada');
    expect(lida?.v).toBeCloseTo(150, 9);
  });

  /**
   * Fora do intervalo arquivado não há reta, e extrapolar seria inventar.
   *
   * O valor da borda é o último que se sabe, e vem marcado para quem lê não
   * confundir "o último valor conhecido" com "a medição daquele instante".
   */
  it('é extrapolada nas bordas, e diz que é', () => {
    expect(readAt(20_000, s(10, 140), null)).toEqual({
      t: 20_000,
      v: 140,
      kind: 'extrapolada',
    });
    expect(readAt(0, null, s(10, 140))).toEqual({ t: 0, v: 140, kind: 'extrapolada' });
  });

  it('não inventa leitura sem nenhuma âncora', () => {
    expect(readAt(5000, null, null)).toBeNull();
  });
});

describe('média no tempo', () => {
  it('é a média simples quando os pontos são igualmente espaçados', () => {
    const série = [s(0, 10), s(10, 20), s(20, 30)];
    // trapézio: (10+20)/2·10 + (20+30)/2·10 = 150+250 = 400, sobre 20 s = 20
    expect(timeWeightedAverage(série, 0, 20_000)).toBeCloseTo(20, 9);
  });

  /**
   * A diferença que justifica a média no tempo existir.
   *
   * A série abaixo fica em 10 por cem segundos e depois se agita entre 90 e 100
   * por dez segundos, com um ponto por segundo. A média dos **pontos** sairia
   * perto de 90, porque o trecho agitado tem dez vezes mais pontos. A média no
   * **tempo** sai perto de 17, que é onde o processo realmente passou o tempo.
   */
  it('não deixa o trecho agitado dominar a média', () => {
    const série: Sample[] = [s(0, 10), s(100, 10)];
    for (let k = 0; k <= 10; k += 1) série.push(s(100 + k, k % 2 === 0 ? 90 : 100));

    const noTempo = timeWeightedAverage(série, 0, 110_000) ?? 0;
    const dosPontos = série.reduce((total, p) => total + p.v, 0) / série.length;

    expect(noTempo).toBeGreaterThan(14);
    expect(noTempo).toBeLessThan(22);
    expect(dosPontos).toBeGreaterThan(70);
  });

  it('recorta o intervalo pedido, interpolando as pontas', () => {
    const série = [s(0, 0), s(100, 100)];
    // de 25 a 75 s, numa rampa de 0 a 100: média 50
    expect(timeWeightedAverage(série, 25_000, 75_000)).toBeCloseTo(50, 9);
  });

  it('usa a âncora de antes quando a janela começa sem ponto dentro', () => {
    const série = [s(0, 40), s(200, 40)];
    expect(timeWeightedAverage(série, 50_000, 100_000)).toBeCloseTo(40, 9);
  });

  it('não devolve média de janela vazia nem invertida', () => {
    expect(timeWeightedAverage([], 0, 10_000)).toBeNull();
    expect(timeWeightedAverage([s(0, 10)], 10_000, 0)).toBeNull();
  });

  it('dá o próprio valor quando a série é constante', () => {
    const série = [s(0, 230), s(37, 230), s(90, 230)];
    expect(timeWeightedAverage(série, 0, 90_000)).toBeCloseTo(230, 9);
  });
});
