import { describe, expect, it } from 'vitest';
import {
  classifyIsoZone,
  DRYER_BEARING_ISO,
  healthFromZone,
  isoLimitsFor,
  isoLimitsOf,
  ISO_20816_3_LIMITS,
  ISO_ZONES,
  type IsoLimits,
} from './iso20816';

const limits: IsoLimits = isoLimitsFor('group1', 'flexible'); // 3.5 / 7.1 / 11.0

describe('classifyIsoZone', () => {
  it('coloca uma máquina recém-comissionada na zona A', () => {
    expect(classifyIsoZone(0, limits)).toBe('A');
    expect(classifyIsoZone(1.8, limits)).toBe('A');
  });

  it('trata a fronteira como pertencente à zona melhor', () => {
    expect(classifyIsoZone(3.5, limits)).toBe('A');
    expect(classifyIsoZone(7.1, limits)).toBe('B');
    expect(classifyIsoZone(11.0, limits)).toBe('C');
  });

  it('sobe de zona logo acima da fronteira', () => {
    expect(classifyIsoZone(3.51, limits)).toBe('B');
    expect(classifyIsoZone(7.11, limits)).toBe('C');
    expect(classifyIsoZone(11.01, limits)).toBe('D');
  });

  it('põe o mancal do cilindro 23 em zona D com a classe padrão dos secadores', () => {
    // 7,8 mm/s no mancal LA do CS23 — a leitura que a tela de monitoramento mostra.
    // Com grupo 2 / apoio rígido (1,4 / 2,8 / 4,5) isso é zona D, não a zona C
    // que o conceito de tela rotula.
    expect(classifyIsoZone(7.8, isoLimitsOf(DRYER_BEARING_ISO))).toBe('D');
    expect(healthFromZone(classifyIsoZone(7.8, isoLimitsOf(DRYER_BEARING_ISO)))).toBe('critical');
  });

  it('é mais severo com fundação rígida que com flexível', () => {
    const rigid = isoLimitsFor('group1', 'rigid'); // 2.3 / 4.5 / 7.1
    expect(classifyIsoZone(5.0, rigid)).toBe('C');
    expect(classifyIsoZone(5.0, limits)).toBe('B');
  });

  it('recusa leituras que não são números finitos e não negativos', () => {
    expect(() => classifyIsoZone(-0.1, limits)).toThrow(RangeError);
    expect(() => classifyIsoZone(Number.NaN, limits)).toThrow(RangeError);
    expect(() => classifyIsoZone(Number.POSITIVE_INFINITY, limits)).toThrow(RangeError);
  });
});

describe('ISO_20816_3_LIMITS', () => {
  it('reproduz a tabela da norma, em mm/s RMS', () => {
    expect(ISO_20816_3_LIMITS).toEqual({
      group1: {
        rigid: { aToB: 2.3, bToC: 4.5, cToD: 7.1 },
        flexible: { aToB: 3.5, bToC: 7.1, cToD: 11.0 },
      },
      group2: {
        rigid: { aToB: 1.4, bToC: 2.8, cToD: 4.5 },
        flexible: { aToB: 2.3, bToC: 4.5, cToD: 7.1 },
      },
    });
  });

  it('usa grupo 2 com apoio rígido como padrão dos mancais dos secadores', () => {
    expect(DRYER_BEARING_ISO).toEqual({ group: 'group2', support: 'rigid' });
    expect(isoLimitsOf(DRYER_BEARING_ISO)).toEqual({ aToB: 1.4, bToC: 2.8, cToD: 4.5 });
  });
});

describe('isoLimitsFor', () => {
  it('mantém as fronteiras em ordem crescente em toda a tabela', () => {
    for (const group of ['group1', 'group2'] as const) {
      for (const support of ['rigid', 'flexible'] as const) {
        const l = isoLimitsFor(group, support);
        expect(l.aToB).toBeLessThan(l.bToC);
        expect(l.bToC).toBeLessThan(l.cToD);
      }
    }
  });

  it('é mais tolerante com máquinas grandes que com médias', () => {
    expect(isoLimitsFor('group1', 'rigid').cToD).toBeGreaterThan(
      isoLimitsFor('group2', 'rigid').cToD,
    );
  });
});

describe('healthFromZone', () => {
  it('cobre todas as zonas da norma', () => {
    for (const zone of ISO_ZONES) {
      expect(['normal', 'attention', 'critical']).toContain(healthFromZone(zone));
    }
  });

  it('só marca como crítico a zona de dano', () => {
    expect(healthFromZone('A')).toBe('normal');
    expect(healthFromZone('B')).toBe('normal');
    expect(healthFromZone('C')).toBe('attention');
    expect(healthFromZone('D')).toBe('critical');
  });
});
