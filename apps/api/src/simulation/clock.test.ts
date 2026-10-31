import { describe, expect, it } from 'vitest';

import {
  catchupRange,
  DEFAULT_SEED,
  MAX_CATCHUP_TICKS,
  SIM_EPOCH_MS,
  secondsToTicks,
  TICK_MS,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  tickAt,
  tickTime,
  ticksBetween,
  ticksToSeconds,
} from './clock';
import { correlatedNoise, gaussianNoise, streamOf, unitNoise } from './noise';

describe('grade de passos', () => {
  it('ancora o passo 0 no instante zero escrito', () => {
    expect(tickAt(new Date(SIM_EPOCH_MS))).toBe(0);
    expect(tickTime(0).getTime()).toBe(SIM_EPOCH_MS);
  });

  it('arredonda para baixo dentro do passo', () => {
    expect(tickAt(new Date(SIM_EPOCH_MS + TICK_MS - 1))).toBe(0);
    expect(tickAt(new Date(SIM_EPOCH_MS + TICK_MS))).toBe(1);
  });

  it('converte passos e tempo nos dois sentidos', () => {
    expect(ticksToSeconds(TICKS_PER_MINUTE)).toBe(60);
    expect(secondsToTicks(3600)).toBe(TICKS_PER_HOUR);
    expect(ticksBetween(tickTime(100), tickTime(250))).toBe(150);
  });

  it('não depende de onde a simulação começou', () => {
    // a mesma hora de parede dá o mesmo passo, hoje e num reinício qualquer
    const instante = new Date('2026-06-15T14:07:23Z');
    expect(tickAt(instante)).toBe(tickAt(new Date(instante.getTime())));
    expect(tickTime(tickAt(instante)).getTime()).toBeLessThanOrEqual(instante.getTime());
  });

  it('tem semente escrita, não sorteada', () => {
    expect(Number.isInteger(DEFAULT_SEED)).toBe(true);
  });
});

describe('retomada', () => {
  const agora = new Date(SIM_EPOCH_MS + 10 * 86_400_000);

  it('executa só o intervalo que faltou', () => {
    const trecho = catchupRange(tickAt(agora) - 500, agora);

    expect(trecho.ticks).toBe(500);
    expect(trecho.reanchored).toBe(false);
    expect(trecho.toTick).toBe(tickAt(agora));
  });

  it('não executa nada quando já está em dia', () => {
    const trecho = catchupRange(tickAt(agora), agora);
    expect(trecho.ticks).toBe(0);
    expect(trecho.reanchored).toBe(false);
  });

  it('não volta atrás quando o passo guardado é do futuro', () => {
    const trecho = catchupRange(tickAt(agora) + 100, agora);
    expect(trecho.ticks).toBe(0);
    expect(trecho.fromTick).toBe(trecho.toTick);
  });

  it('reancora quando nunca rodou', () => {
    const trecho = catchupRange(null, agora);

    expect(trecho.reanchored).toBe(true);
    expect(trecho.ticks).toBe(MAX_CATCHUP_TICKS);
  });

  it('reancora e avisa quando o intervalo passa do teto', () => {
    const trecho = catchupRange(tickAt(agora) - MAX_CATCHUP_TICKS * 30, agora);

    expect(trecho.reanchored).toBe(true);
    expect(trecho.ticks).toBe(MAX_CATCHUP_TICKS);
    expect(trecho.fromTick).toBe(tickAt(agora) - MAX_CATCHUP_TICKS);
  });

  it('aceita exatamente o teto sem reancorar', () => {
    const trecho = catchupRange(tickAt(agora) - MAX_CATCHUP_TICKS, agora);
    expect(trecho.reanchored).toBe(false);
    expect(trecho.ticks).toBe(MAX_CATCHUP_TICKS);
  });
});

describe('ruído por posição', () => {
  const canal = streamOf('PIC-514');

  it('dá o mesmo valor para a mesma posição, sempre', () => {
    expect(unitNoise(DEFAULT_SEED, 12_345, canal)).toBe(unitNoise(DEFAULT_SEED, 12_345, canal));
    expect(gaussianNoise(DEFAULT_SEED, 12_345, canal)).toBe(
      gaussianNoise(DEFAULT_SEED, 12_345, canal),
    );
  });

  /**
   * A propriedade que sustenta a retomada.
   *
   * Perguntar fora de ordem, ou perguntar a partir de outro ponto de partida,
   * não muda nada. Um gerador sequencial falharia aqui: o valor dele depende de
   * quantas vezes foi chamado antes.
   */
  it('não depende da ordem nem de quantas vezes foi chamado', () => {
    const emOrdem: number[] = [];
    for (let tick = 1000; tick < 1010; tick += 1) {
      emOrdem.push(gaussianNoise(DEFAULT_SEED, tick, canal));
    }

    const foraDeOrdem = [9, 3, 7, 0, 5, 1, 8, 2, 6, 4].map((offset) =>
      gaussianNoise(DEFAULT_SEED, 1000 + offset, canal),
    );
    const reordenado = [9, 3, 7, 0, 5, 1, 8, 2, 6, 4]
      .map((offset, i) => ({ offset, value: foraDeOrdem[i] ?? 0 }))
      .sort((a, b) => a.offset - b.offset)
      .map((item) => item.value);

    expect(reordenado).toEqual(emOrdem);
  });

  it('separa as tags', () => {
    const outro = streamOf('PIC-711');
    expect(canal).not.toBe(outro);
    expect(gaussianNoise(DEFAULT_SEED, 500, canal)).not.toBe(
      gaussianNoise(DEFAULT_SEED, 500, outro),
    );
  });

  it('separa as sementes', () => {
    expect(gaussianNoise(DEFAULT_SEED, 500, canal)).not.toBe(
      gaussianNoise(DEFAULT_SEED + 1, 500, canal),
    );
  });

  it('dá o mesmo canal para a mesma tag, entre execuções', () => {
    expect(streamOf('MP1-SEC-G4-CS23-MLA')).toBe(streamOf('MP1-SEC-G4-CS23-MLA'));
  });

  it('fica dentro de [0, 1) na uniforme', () => {
    for (let tick = 0; tick < 2000; tick += 1) {
      const value = unitNoise(DEFAULT_SEED, tick, canal);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('tem média ~0 e desvio ~1 na normal', () => {
    const amostras = Array.from({ length: 20_000 }, (_, tick) =>
      gaussianNoise(DEFAULT_SEED, tick, canal),
    );

    const média = amostras.reduce((a, b) => a + b, 0) / amostras.length;
    const variância = amostras.reduce((total, v) => total + (v - média) ** 2, 0) / amostras.length;

    expect(Math.abs(média)).toBeLessThan(0.05);
    expect(Math.sqrt(variância)).toBeGreaterThan(0.95);
    expect(Math.sqrt(variância)).toBeLessThan(1.05);
  });

  it('não produz cauda além de 3 desvios', () => {
    for (let tick = 0; tick < 5000; tick += 1) {
      expect(Math.abs(gaussianNoise(DEFAULT_SEED, tick, canal))).toBeLessThanOrEqual(3);
    }
  });
});

describe('ruído correlacionado', () => {
  const canal = streamOf('AIC-903');

  it('continua sendo função da posição', () => {
    expect(correlatedNoise(DEFAULT_SEED, 777, canal, 8)).toBe(
      correlatedNoise(DEFAULT_SEED, 777, canal, 8),
    );
  });

  it('mantém o desvio ~1 depois de normalizar', () => {
    const amostras = Array.from({ length: 20_000 }, (_, tick) =>
      correlatedNoise(DEFAULT_SEED, tick, canal, 10),
    );

    const média = amostras.reduce((a, b) => a + b, 0) / amostras.length;
    const desvio = Math.sqrt(
      amostras.reduce((total, v) => total + (v - média) ** 2, 0) / amostras.length,
    );

    expect(Math.abs(média)).toBeLessThan(0.1);
    expect(desvio).toBeGreaterThan(0.85);
    expect(desvio).toBeLessThan(1.15);
  });

  /** É o que distingue ruído de processo de erro de instrumento. */
  it('correlaciona passos vizinhos, ao contrário do branco', () => {
    const correlação = (amostras: readonly number[]): number => {
      const média = amostras.reduce((a, b) => a + b, 0) / amostras.length;
      let cov = 0;
      let varr = 0;
      for (let i = 0; i < amostras.length - 1; i += 1) {
        cov += ((amostras[i] ?? 0) - média) * ((amostras[i + 1] ?? 0) - média);
        varr += ((amostras[i] ?? 0) - média) ** 2;
      }
      return cov / varr;
    };

    const branco = Array.from({ length: 5000 }, (_, t) => gaussianNoise(DEFAULT_SEED, t, canal));
    const correlacionado = Array.from({ length: 5000 }, (_, t) =>
      correlatedNoise(DEFAULT_SEED, t, canal, 10),
    );

    expect(Math.abs(correlação(branco))).toBeLessThan(0.05);
    expect(correlação(correlacionado)).toBeGreaterThan(0.8);
  });

  it('com τ zero cai no ruído branco', () => {
    expect(correlatedNoise(DEFAULT_SEED, 42, canal, 0)).toBe(
      gaussianNoise(DEFAULT_SEED, 42, canal),
    );
  });
});
