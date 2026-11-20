import { describe, expect, it } from 'vitest';

import { processVariable } from '../process/catalog';
import { dependsOn, upstreamOf } from '../process/graph';
import { historianPoint } from '../historian/points';
import {
  BREAK_WATCH_TAGS,
  DEVIATION_SIGMAS,
  diagnoseBreak,
  type ReplaySample,
  type TagWindow,
} from './break-replay';

/**
 * O replay tem de responder "o que se mexeu primeiro" sem inventar.
 *
 * Os dois testes que importam são opostos: uma quebra com uma perturbação
 * conhecida tem de apontar aquela malha, e uma quebra sem perturbação nenhuma
 * tem de dizer que não sabe. O segundo é o que impede o primeiro de ser um
 * gerador de culpados.
 */

const QUEBRA = Date.parse('2026-06-15T18:00:00Z');
const JANELA_S = 600;

/** Uma série parada no valor base, com o ruído que a régua da tag permite. */
function parada(tag: string, base: number, passoS = 10): TagWindow {
  const exc = processVariable(tag)?.compression.excDev ?? 0.1;
  const amostra = (t: number, k: number): ReplaySample => ({
    t,
    // meio excDev de tremor: dentro da régua, longe do limiar
    v: base + (k % 2 === 0 ? exc * 0.5 : -exc * 0.5),
  });

  const baseline: ReplaySample[] = [];
  for (let k = 0; k * passoS < 3600; k += 1) {
    baseline.push(amostra(QUEBRA - 3600_000 - JANELA_S * 1000 + k * passoS * 1000, k));
  }

  const window: ReplaySample[] = [];
  for (let k = 0; k * passoS < JANELA_S; k += 1) {
    window.push(amostra(QUEBRA - JANELA_S * 1000 + k * passoS * 1000, k));
  }

  return { tag, baseline, window };
}

/** A mesma série, com um degrau que entra `antesS` segundos antes da quebra. */
function comDegrau(tag: string, base: number, degrau: number, antesS: number): TagWindow {
  const série = parada(tag, base);
  const início = QUEBRA - antesS * 1000;

  return {
    ...série,
    window: série.window.map((amostra) =>
      amostra.t >= início ? { ...amostra, v: amostra.v + degrau } : amostra,
    ),
  };
}

/** Um degrau que passa folgado da régua da tag. */
function degrauDe(tag: string): number {
  const exc = processVariable(tag)?.compression.excDev ?? 0.1;
  return exc * DEVIATION_SIGMAS * 4;
}

const BASE: Readonly<Record<string, number>> = {
  'SIC-1104': 1250,
  'AIC-902': 75,
  'AIC-901': 8,
  'AIC-903': 4.8,
  'AI-407': 42,
  'WIC-401': 720,
  'PDIC-524': 20,
  'PDIC-721': 30,
  'PIC-604A': 1.2,
  'SDIC-703': 1.5,
};

/** Todas paradas, menos as que o caso mandar mexer. */
function cenário(
  mexidas: Readonly<Record<string, { degrau: number; antesS: number }>>,
): TagWindow[] {
  return BREAK_WATCH_TAGS.map((tag) => {
    const base = BASE[tag] ?? 1;
    const mexida = mexidas[tag];
    return mexida ? comDegrau(tag, base, mexida.degrau, mexida.antesS) : parada(tag, base);
  });
}

describe('a quebra com perturbação conhecida', () => {
  /** Uma por causa de cenário: o replay tem de apontar a malha perturbada. */
  for (const tag of ['PDIC-721', 'PDIC-524', 'WIC-401', 'PIC-604A']) {
    it(`aponta ${tag}, que foi a malha perturbada`, () => {
      const replay = diagnoseBreak({
        breakAt: QUEBRA,
        series: cenário({ [tag]: { degrau: degrauDe(tag), antesS: 540 } }),
      });

      expect(replay.first?.tag, 'o primeiro desvio não é a malha perturbada').toBe(tag);
      expect(replay.deviations[0]?.tag).toBe(tag);
      expect(replay.deviations[0]?.leadTimeS).toBeGreaterThanOrEqual(530);
      expect(replay.deviations[0]?.consequenceOf).toBeNull();
    });
  }

  it('diz a direção e o tamanho do desvio', () => {
    const degrau = degrauDe('WIC-401');
    const replay = diagnoseBreak({
      breakAt: QUEBRA,
      series: cenário({ 'WIC-401': { degrau: -degrau, antesS: 300 } }),
    });

    const carga = replay.deviations.find((item) => item.tag === 'WIC-401');
    expect(carga?.direction).toBe('caiu');
    expect(Math.abs(carga?.size ?? 0)).toBeGreaterThan(degrau * 0.5);
    expect(carga?.sigmas ?? 0).toBeGreaterThan(DEVIATION_SIGMAS);
  });
});

describe('a quebra sem perturbação', () => {
  /**
   * O teste que impede o resto de virar um gerador de culpados: com todas as
   * tags paradas dentro da régua, a resposta tem de ser "ninguém se mexeu".
   */
  it('não inventa culpado', () => {
    const replay = diagnoseBreak({ breakAt: QUEBRA, series: cenário({}) });

    expect(replay.deviations).toEqual([]);
    expect(replay.first).toBeNull();
    expect(replay.quiet.length).toBeGreaterThan(0);
  });

  it('tremor dentro da régua não é desvio', () => {
    const exc = processVariable('AIC-902')?.compression.excDev ?? 0.1;
    const replay = diagnoseBreak({
      breakAt: QUEBRA,
      // duas vezes a banda: ainda abaixo das três que contam
      series: cenário({ 'AIC-902': { degrau: exc * 2, antesS: 400 } }),
    });

    expect(replay.first).toBeNull();
  });
});

describe('origem e consequência', () => {
  /**
   * A gramatura se mexer depois da velocidade é a velocidade chegando na
   * gramatura. Chamar isso de dois problemas seria pior do que não dizer nada.
   */
  it('quem desvia depois de quem o move é consequência, não origem', () => {
    expect(dependsOn('AIC-902', 'SIC-1104'), 'o grafo mudou e o teste parou de valer').toBe(true);

    const replay = diagnoseBreak({
      breakAt: QUEBRA,
      series: cenário({
        'SIC-1104': { degrau: degrauDe('SIC-1104'), antesS: 540 },
        'AIC-902': { degrau: degrauDe('AIC-902'), antesS: 300 },
      }),
    });

    const gramatura = replay.deviations.find((item) => item.tag === 'AIC-902');
    expect(gramatura?.consequenceOf).toBe('SIC-1104');
    expect(replay.first?.tag).toBe('SIC-1104');
  });

  it('quem desvia antes de quem o move continua sendo origem', () => {
    const replay = diagnoseBreak({
      breakAt: QUEBRA,
      series: cenário({
        'AIC-902': { degrau: degrauDe('AIC-902'), antesS: 540 },
        'SIC-1104': { degrau: degrauDe('SIC-1104'), antesS: 300 },
      }),
    });

    const gramatura = replay.deviations.find((item) => item.tag === 'AIC-902');
    expect(gramatura?.consequenceOf).toBeNull();
    expect(replay.first?.tag).toBe('AIC-902');
  });

  it('duas malhas sem parentesco são duas origens', () => {
    expect(dependsOn('PDIC-721', 'PIC-604A')).toBe(false);
    expect(dependsOn('PIC-604A', 'PDIC-721')).toBe(false);

    const replay = diagnoseBreak({
      breakAt: QUEBRA,
      series: cenário({
        'PDIC-721': { degrau: degrauDe('PDIC-721'), antesS: 540 },
        'PIC-604A': { degrau: degrauDe('PIC-604A'), antesS: 300 },
      }),
    });

    for (const item of replay.deviations) expect(item.consequenceOf).toBeNull();
    expect(replay.first?.tag).toBe('PDIC-721');
  });
});

describe('a régua', () => {
  /**
   * Uma tag que já andava muito na hora anterior precisa andar mais para
   * contar. Sem isso, o `excDev` sozinho faria de toda tag agitada uma
   * precursora de tudo.
   */
  it('a dispersão da base manda quando é maior que o excDev', () => {
    const tag = 'AIC-902';
    const exc = processVariable(tag)?.compression.excDev ?? 0.1;
    const agitada = parada(tag, 75);

    // a base passa a oscilar dez vezes mais que a banda do instrumento
    const inquieta: TagWindow = {
      ...agitada,
      baseline: agitada.baseline.map((amostra, k) => ({
        ...amostra,
        v: 75 + (k % 2 === 0 ? exc * 10 : -exc * 10),
      })),
      window: agitada.window.map((amostra) => ({ ...amostra, v: amostra.v + exc * 5 })),
    };

    const comExcDevSó = diagnoseBreak({ breakAt: QUEBRA, series: [agitada] });
    const comBaseAgitada = diagnoseBreak({ breakAt: QUEBRA, series: [inquieta] });

    // o mesmo passo de 5 excDev: desvio numa base parada, ruído numa base agitada
    expect(
      diagnoseBreak({
        breakAt: QUEBRA,
        series: [
          {
            ...agitada,
            window: agitada.window.map((a) => ({ ...a, v: a.v + exc * 5 })),
          },
        ],
      }).first?.tag,
    ).toBe(tag);
    expect(comBaseAgitada.first).toBeNull();
    expect(comExcDevSó.first).toBeNull();
  });
});

describe('o grafo da investigação', () => {
  it('anda para trás, e não inclui a própria tag', () => {
    const antes = upstreamOf('AIC-902');
    expect(antes.has('SIC-1104')).toBe(true);
    expect(antes.has('AIC-902')).toBe(false);
  });

  it('as tags observadas estão todas no catálogo', () => {
    for (const tag of BREAK_WATCH_TAGS) {
      expect(processVariable(tag), `${tag} saiu do catálogo`).not.toBeNull();
    }
  });

  /**
   * O replay lê do arquivo. Uma tag observada que não grava seria uma linha
   * vazia na tela da investigação — pior do que não observá-la.
   */
  it('as tags observadas gravam no historiador', () => {
    for (const tag of BREAK_WATCH_TAGS) {
      expect(historianPoint(tag), `${tag} não é ponto do historiador`).not.toBeNull();
    }
  });

  /** Sem `excDev` não há régua mínima, e a conta dependeria só da base. */
  it('as tags observadas têm banda de exceção no catálogo', () => {
    for (const tag of BREAK_WATCH_TAGS) {
      expect(processVariable(tag)?.compression.excDev ?? 0, tag).toBeGreaterThan(0);
    }
  });
});
