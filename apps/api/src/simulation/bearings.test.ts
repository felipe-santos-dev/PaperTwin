import {
  alarmThreshold,
  classifyIsoZone,
  DRYER_BEARING_ISO,
  hasCrossedLimit,
  hasReturnedToNormal,
  isoLimitsOf,
} from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import {
  bearingSampleAt,
  DEGRADED_PEAK_MM_S,
  degradationProgress,
  readingAt,
  signatureOf,
  simulateVibration,
  type DegradationScenario,
} from './bearings';
import { DEFAULT_SEED, TICKS_PER_HOUR, tickTime } from './clock';

const limits = isoLimitsOf(DRYER_BEARING_ISO);

const SAUDÁVEL = 'MP1-SEC-G1-CS01-MLA';
const DEGRADANDO = 'MP1-SEC-G4-CS23-MLA';

const START = 2_000_000;
const JANELA = 72 * TICKS_PER_HOUR;

const cenário: DegradationScenario = {
  assetTag: DEGRADANDO,
  fromTick: START,
  toTick: START + JANELA,
};

describe('progresso da degradação', () => {
  it('vai de 0 a 1 ao longo da janela', () => {
    expect(degradationProgress(cenário, START)).toBe(0);
    expect(degradationProgress(cenário, START + JANELA / 2)).toBeCloseTo(0.5, 6);
    expect(degradationProgress(cenário, START + JANELA)).toBe(1);
  });

  it('fica no valor da borda fora da janela', () => {
    expect(degradationProgress(cenário, START - 1000)).toBe(0);
    expect(degradationProgress(cenário, START + JANELA * 3)).toBe(1);
  });

  it('não divide por zero numa janela degenerada', () => {
    const instantâneo = { assetTag: DEGRADANDO, fromTick: START, toTick: START };
    expect(degradationProgress(instantâneo, START - 1)).toBe(0);
    expect(degradationProgress(instantâneo, START)).toBe(1);
  });
});

describe('amostra de mancal no passo', () => {
  it('é função da posição: perguntar duas vezes dá o mesmo', () => {
    expect(bearingSampleAt(DEFAULT_SEED, START + 77, SAUDÁVEL, null)).toEqual(
      bearingSampleAt(DEFAULT_SEED, START + 77, SAUDÁVEL, null),
    );
  });

  it('não depende da ordem das perguntas', () => {
    const emOrdem = [0, 1, 2, 3, 4].map((k) =>
      bearingSampleAt(DEFAULT_SEED, START + k, SAUDÁVEL, null),
    );
    const foraDeOrdem = [3, 0, 4, 1, 2].map((k) => ({
      k,
      sample: bearingSampleAt(DEFAULT_SEED, START + k, SAUDÁVEL, null),
    }));

    for (const { k, sample } of foraDeOrdem) expect(sample).toEqual(emOrdem[k]);
  });

  it('dá assinatura própria a cada mancal', () => {
    const a = signatureOf(SAUDÁVEL);
    const b = signatureOf('MP1-SEC-G1-CS01-MLC');

    expect(a.rmsBase).not.toBe(b.rmsBase);
    for (const assinatura of [a, b]) {
      expect(assinatura.rmsBase).toBeGreaterThanOrEqual(0.8);
      expect(assinatura.rmsBase).toBeLessThanOrEqual(2.0);
    }
  });

  it('deixa o mancal saudável nas zonas A e B, mesmo com cenário de outro', () => {
    for (let k = 0; k < 2000; k += 17) {
      const sample = bearingSampleAt(DEFAULT_SEED, START + k, SAUDÁVEL, cenário);
      expect(['A', 'B']).toContain(classifyIsoZone(sample.rmsMmS, limits));
    }
  });

  it('leva o mancal do cenário até a zona D', () => {
    const início = bearingSampleAt(DEFAULT_SEED, START, DEGRADANDO, cenário);
    const fim = bearingSampleAt(DEFAULT_SEED, START + JANELA, DEGRADANDO, cenário);

    expect(classifyIsoZone(início.rmsMmS, limits)).toBe('A');
    expect(classifyIsoZone(fim.rmsMmS, limits)).toBe('D');
    expect(fim.rmsMmS).toBeCloseTo(DEGRADED_PEAK_MM_S, 1);
  });

  /** O envelope pega impacto antes de a velocidade sair da faixa normal. */
  it('põe o envelope na frente da velocidade', () => {
    const meio = START + JANELA * 0.3;
    const sample = bearingSampleAt(DEFAULT_SEED, meio, DEGRADANDO, cenário);
    const base = signatureOf(DEGRADANDO);

    const fraçãoEnvelope = (sample.envelopeGe - base.envelopeBase) / 4.2;
    const fraçãoRms = (sample.rmsMmS - base.rmsBase) / (DEGRADED_PEAK_MM_S - base.rmsBase);

    expect(fraçãoEnvelope).toBeGreaterThan(fraçãoRms * 2);
  });

  it('esquenta o mancal junto, mas bem menos que a vibração', () => {
    const base = signatureOf(DEGRADANDO);
    const fim = bearingSampleAt(DEFAULT_SEED, START + JANELA, DEGRADANDO, cenário);

    const subidaRms = fim.rmsMmS - base.rmsBase;
    const subidaTemp = fim.tempC - base.tempBase;

    expect(subidaTemp).toBeGreaterThan(subidaRms);
    expect(subidaTemp).toBeLessThan(subidaRms * 6);
  });

  /**
   * Perto da fronteira, o valor cru pisca — e é para isso que existe a banda
   * morta do alarme.
   *
   * Na subida, a vibração atravessa os 4,5 mm/s da fronteira C→D devagar: o
   * sinal anda ~0,002 mm/s por minuto ali, contra um ruído de desvio 0,02. A
   * 1 s de resolução, o valor cru cruza a fronteira para os dois lados várias
   * vezes durante uns quinze minutos. Isso não é defeito da simulação, é o que
   * uma medição de verdade faz — e é exatamente a razão pela qual a ISA-18.2
   * exige banda morta.
   *
   * Então o que não pode piscar é o **alarme**, não o valor. Com a banda morta
   * de 1 % da faixa (0,11 mm/s na `VI-5123A`, cinco vezes o desvio do ruído), o
   * alarme de `HH` dispara uma vez e não volta.
   */
  it('o valor cru pisca na fronteira e o alarme, com banda morta, não', () => {
    const tagDeProcesso = 'VI-5123A';
    const fronteira = alarmThreshold(tagDeProcesso, 'HH');
    expect(fronteira).toBe(limits.cToD);

    let cruzamentosCrus = 0;
    let acimaAntes = false;
    let disparos = 0;
    let normalizações = 0;
    let emAlarme = false;

    for (let k = 0; k <= JANELA; k += 60) {
      const rms = bearingSampleAt(DEFAULT_SEED, START + k, DEGRADANDO, cenário).rmsMmS;

      const acima = rms >= (fronteira ?? 0);
      if (acima && !acimaAntes) cruzamentosCrus += 1;
      acimaAntes = acima;

      if (!emAlarme && hasCrossedLimit(tagDeProcesso, 'HH', rms)) {
        emAlarme = true;
        disparos += 1;
      } else if (emAlarme && hasReturnedToNormal(tagDeProcesso, 'HH', rms)) {
        emAlarme = false;
        normalizações += 1;
      }
    }

    expect(cruzamentosCrus).toBeGreaterThan(1);
    expect(disparos).toBe(1);
    expect(normalizações).toBe(0);
    expect(emAlarme).toBe(true);
  });

  it('monta a leitura com o instante do passo', () => {
    const leitura = readingAt(DEFAULT_SEED, START + 5, SAUDÁVEL, null);

    expect(leitura.assetTag).toBe(SAUDÁVEL);
    expect(leitura.ts).toBe(tickTime(START + 5).toISOString());
    expect(leitura.rmsMmS).toBe(bearingSampleAt(DEFAULT_SEED, START + 5, SAUDÁVEL, null).rmsMmS);
  });
});

describe('a série gravada e o valor ao vivo saem do mesmo modelo', () => {
  it('coincidem no passo em que se encontram', () => {
    const to = tickTime(START + JANELA);
    const from = tickTime(START);

    const série = simulateVibration({
      bearings: [{ tag: DEGRADANDO }],
      from,
      to,
      intervalMs: 15 * 60 * 1000,
      degradingTag: DEGRADANDO,
    });

    const última = série.at(-1);
    expect(última).toBeDefined();

    const aoVivo = bearingSampleAt(DEFAULT_SEED, START + JANELA, DEGRADANDO, {
      assetTag: DEGRADANDO,
      fromTick: START,
      toTick: START + JANELA,
    });

    expect(última?.rmsMmS).toBe(aoVivo.rmsMmS);
    expect(última?.envelopeGe).toBe(aoVivo.envelopeGe);
    expect(última?.tempC).toBe(aoVivo.tempC);
  });
});
