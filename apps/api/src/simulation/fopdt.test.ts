import { PROCESS_RELATIONS, relation } from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import { cdKernel, cdSteadyState, spreadAcrossZones } from './cd-profile';
import {
  decayPerStep,
  delaySteps,
  type FopdtModel,
  fopdtRunner,
  simulateFopdt,
  stepResponse,
  superpose,
} from './fopdt';

/** 63,2 % — o quanto um sistema de primeira ordem anda em uma constante de tempo. */
const ONE_TAU = 1 - 1 / Math.E;

function modelOf(id: string): FopdtModel {
  const found = relation(id);
  if (!found) throw new Error(`Relação ${id} não existe`);
  return { kp: found.kp, deadTimeS: found.deadTimeS, tauS: found.tauS };
}

describe('resposta ao degrau', () => {
  // Relação 5: PIC-711 → AIC-903, kp −0,02 %/kPa, θ 14 s, τ 45 s.
  const model = modelOf('5');
  const dtS = 1;
  const step = 10;

  // 2.000 passos = ~44 τ depois do tempo morto, o bastante para o resíduo
  // exp(−t/τ) cair abaixo da precisão cobrada no estacionário.
  const response = stepResponse(model, step, dtS, 2000);

  it('fica em zero até o tempo morto', () => {
    for (let k = 0; k <= model.deadTimeS / dtS; k += 1) {
      expect(response[k], `t = ${String(k)} s`).toBe(0);
    }
  });

  it('sai de zero no passo seguinte ao tempo morto', () => {
    const first = response[model.deadTimeS / dtS + 1];

    expect(first).toBeDefined();
    expect(first).not.toBe(0);
  });

  it('anda 63,2 % do ganho em θ + τ', () => {
    const atOneTau = response[(model.deadTimeS + model.tauS) / dtS];
    const total = model.kp * step;

    // A discretização ZOH é exata nos instantes de amostragem, então isto não
    // é aproximação: é o valor fechado da resposta contínua.
    expect(atOneTau).toBeCloseTo(total * ONE_TAU, 10);
  });

  it('converge para kp × degrau no estacionário', () => {
    const settled = response.at(-1);

    expect(settled).toBeCloseTo(model.kp * step, 9);
    // kp é negativo: mais vapor, menos umidade.
    expect(settled).toBeLessThan(0);
  });

  it('não ultrapassa o ganho — primeira ordem não tem sobressinal', () => {
    const total = model.kp * step;

    for (const value of response) {
      expect(Math.abs(value)).toBeLessThanOrEqual(Math.abs(total) + 1e-12);
    }
  });
});

describe('estabilidade com dt grande', () => {
  // Relação 14: WIC-801 → AIC-905, τ 4,5 s — o τ mais curto do catálogo.
  const model = modelOf('14');

  it('não diverge com dt maior que 2τ, onde o Euler explodiria', () => {
    const dtS = 10;
    const step = 20;

    expect(dtS).toBeGreaterThan(2 * model.tauS);
    // O fator de Euler seria 1 − dt/τ = −1,22: módulo acima de 1, logo diverge.
    expect(Math.abs(1 - dtS / model.tauS)).toBeGreaterThan(1);
    // O do ZOH fica sempre dentro de (0, 1).
    expect(decayPerStep(model.tauS, dtS)).toBeGreaterThan(0);
    expect(decayPerStep(model.tauS, dtS)).toBeLessThan(1);

    const response = stepResponse(model, step, dtS, 200);
    const total = model.kp * step;

    for (const value of response) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThanOrEqual(Math.abs(total) + 1e-12);
    }
    expect(response.at(-1)).toBeCloseTo(total, 9);
  });

  it('chega no mesmo estacionário com dt fino e grosseiro', () => {
    const step = 20;
    const fine = stepResponse(model, step, 0.1, 20_000).at(-1);
    const coarse = stepResponse(model, step, 10, 200).at(-1);

    expect(fine).toBeCloseTo(model.kp * step, 9);
    expect(coarse).toBeCloseTo(model.kp * step, 9);
  });

  it('recusa dt e τ inúteis', () => {
    expect(() => fopdtRunner(model, 0)).toThrow(/dt precisa ser maior que zero/);
    expect(() => fopdtRunner({ ...model, tauS: 0 }, 1)).toThrow(/τ precisa ser maior que zero/);
    expect(() => fopdtRunner({ ...model, deadTimeS: -1 }, 1)).toThrow(/não pode ser negativo/);
  });
});

describe('tempo morto', () => {
  it('conta os passos arredondando', () => {
    expect(delaySteps(14, 1)).toBe(14);
    expect(delaySteps(62, 10)).toBe(6);
    expect(delaySteps(0, 1)).toBe(0);
  });

  it('responde no mesmo passo quando não há atraso', () => {
    const response = stepResponse({ kp: 2, deadTimeS: 0, tauS: 10 }, 1, 1, 5);

    expect(response[0]).toBe(0);
    expect(response[1]).toBeGreaterThan(0);
  });

  it('atrasa a entrada, não a saída já acumulada', () => {
    // Pulso de um passo: a saída sobe depois do atraso e volta a decair.
    const model = { kp: 1, deadTimeS: 3, tauS: 5 };
    const response = simulateFopdt(model, [1, 0, 0, 0, 0, 0, 0, 0], 1);

    expect(response.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(response[4]).toBeGreaterThan(0);
    expect(response[5]).toBeLessThan(response[4] ?? 0);
  });
});

describe('superposição', () => {
  it('soma as quatro relações que chegam na gramatura', () => {
    const dtS = 1;
    // A mais lenta destas quatro tem τ 32 s e θ 80 s; 3.000 passos deixam
    // todas assentadas com folga.
    const samples = 3000;

    // Degraus de referência de cada relação que move a AIC-902.
    const inputs = PROCESS_RELATIONS.filter((item) => item.output === 'AIC-902');
    expect(inputs).toHaveLength(4);

    const responses = inputs.map((item) =>
      stepResponse(
        { kp: item.kp, deadTimeS: item.deadTimeS, tauS: item.tauS },
        item.step.value,
        dtS,
        samples,
      ),
    );

    const total = superpose(responses);
    const expected = inputs.reduce((sum, item) => sum + item.kp * item.step.value, 0);

    expect(total.at(-1)).toBeCloseTo(expected, 6);
    expect(total[0]).toBe(0);
  });

  it('recusa séries de comprimentos diferentes', () => {
    expect(() => superpose([[0, 1], [0]])).toThrow(/mesmo comprimento/);
  });

  it('devolve vazio sem nenhuma série', () => {
    expect(superpose([])).toEqual([]);
  });
});

describe('perfil CD', () => {
  const zoned = relation('11');

  it('tem pico 1 e decai até 3σ', () => {
    const kernel = cdKernel();

    // `cdKernel` é METADE do kernel: o índice é o afastamento em zonas, de 0 a
    // 3σ. Com σ ≈ 0,79 zona, 3σ = 2,36 zonas, então o alcance é ±2 e o meio
    // kernel tem 3 elementos — o espalhamento inteiro cobre 5 zonas.
    expect(kernel[0]).toBe(1);
    expect(kernel).toHaveLength(3);
    expect(kernel[1]).toBeCloseTo(Math.exp(-0.5 / 0.7875 ** 2), 10);
    for (let i = 1; i < kernel.length; i += 1) {
      expect(kernel[i]).toBeLessThan(kernel[i - 1] ?? 0);
    }
  });

  it('espalha por 5 zonas: a corrigida e duas de cada lado', () => {
    const affected = spreadAcrossZones(70)
      .map((weight, zone) => ({ zone, weight }))
      .filter(({ weight }) => weight !== 0);

    // Afirmado pelo índice, e não só pela ordem de grandeza: sem isto, um
    // alcance que caísse para ±1 deixaria as zonas 68 e 72 em zero e as
    // comparações de magnitude abaixo continuariam passando.
    expect(affected.map(({ zone }) => zone)).toEqual([68, 69, 70, 71, 72]);
  });

  it('dá kp × degrau na zona corrigida', () => {
    const step = 10;
    const profile = cdSteadyState(zoned?.kp ?? 0, step, 70);

    // Normalizado pelo pico: a zona corrigida recebe o ganho medido inteiro.
    expect(profile[70]).toBeCloseTo((zoned?.kp ?? 0) * step, 12);
    expect(profile[70]).toBeCloseTo(-0.8, 12);
  });

  it('decai simetricamente nos vizinhos', () => {
    const profile = cdSteadyState(zoned?.kp ?? 0, 10, 70);

    expect(profile[69]).toBeCloseTo(profile[71] ?? 0, 12);
    expect(profile[68]).toBeCloseTo(profile[72] ?? 0, 12);
    // Não zero: a vizinha mais distante ainda sente ~4 % do ganho.
    expect(Math.abs(profile[68] ?? 0)).toBeGreaterThan(0);
    expect(Math.abs(profile[69] ?? 0)).toBeLessThan(Math.abs(profile[70] ?? 0));
    expect(Math.abs(profile[68] ?? 0)).toBeLessThan(Math.abs(profile[69] ?? 0));
    // toBeCloseTo, e não toBe(0): fora do alcance o peso é 0, e 0 × kp
    // negativo dá −0, que o Object.is do toBe distingue de +0.
    expect(profile[67]).toBeCloseTo(0, 12);
    expect(profile[73]).toBeCloseTo(0, 12);
    expect(spreadAcrossZones(70)[67]).toBe(0);
  });

  it('trunca nas bordas sem erro', () => {
    const first = spreadAcrossZones(0);
    const last = spreadAcrossZones(139);

    expect(first[0]).toBe(1);
    expect(first[1]).toBeGreaterThan(0);
    expect(first).toHaveLength(140);

    expect(last[139]).toBe(1);
    expect(last[138]).toBeGreaterThan(0);
    expect(last).toHaveLength(140);

    // O que vazaria para fora da folha não é redistribuído: some.
    const middle = spreadAcrossZones(70);
    const sum = (weights: number[]) => weights.reduce((a, b) => a + b, 0);
    expect(sum(first)).toBeLessThan(sum(middle));
  });

  it('recusa zona fora da folha', () => {
    expect(() => spreadAcrossZones(-1)).toThrow(/fora da folha/);
    expect(() => spreadAcrossZones(140)).toThrow(/fora da folha/);
    expect(() => spreadAcrossZones(1.5)).toThrow(/fora da folha/);
  });
});
