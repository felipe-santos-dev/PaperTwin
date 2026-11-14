import type { Alarm } from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import { alarmCounts, areaOfTag, PROCESS_AREAS, sectionStates } from './sections';

function alarme(partial: Partial<Alarm>): Alarm {
  return {
    id: `AL-${partial.tag ?? 'X'}-${partial.limit ?? 'H'}`,
    tag: 'PDIC-523',
    limit: 'L',
    threshold: 0.3,
    priority: 'média',
    state: 'ativo',
    raisedAt: '2026-06-15T21:12:00.000Z',
    peakValue: 0.24,
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
    shelvedUntil: null,
    shelvedBy: null,
    ...partial,
  };
}

describe('faixa do processo', () => {
  it('tem as dez seções do design, na ordem da máquina', () => {
    expect(PROCESS_AREAS.map((area) => area.label)).toEqual([
      'Preparo e refino',
      'Caixa de entrada',
      'Formação',
      'Prensas',
      'Pré-secagem',
      'Speed Sizer',
      'Pós-secagem',
      'Calandra',
      'QCS',
      'Enroladeira',
    ]);
  });

  it('põe a TAG do catálogo na área dela', () => {
    expect(areaOfTag('PDIC-523')).toBe('pré-secagem');
    expect(areaOfTag('JIC-101')).toBe('preparo');
    expect(areaOfTag('AIC-902')).toBe('qcs');
  });

  it('põe a medição de mancal na seção do cilindro, não na área de mancais', () => {
    expect(areaOfTag('VI-5123B')).toBe('pré-secagem');
    expect(areaOfTag('TI-5331A')).toBe('pós-secagem');
  });

  it('ignora TAG fora das dez seções', () => {
    expect(areaOfTag('SIC-1104')).toBeNull();
    expect(areaOfTag('NAO-EXISTE')).toBeNull();
  });

  it('conta uma TAG uma vez, pela pior prioridade, e ordena pela prioridade', () => {
    const states = sectionStates([
      alarme({ tag: 'VI-5123B', limit: 'H', priority: 'baixa' }),
      alarme({ tag: 'PDIC-523', limit: 'L', priority: 'média' }),
      alarme({ tag: 'PDIC-523', limit: 'LL', priority: 'baixa' }),
    ]);
    const pre = states.find((state) => state.id === 'pré-secagem');

    expect(pre?.out).toEqual([
      { tag: 'PDIC-523', priority: 2 },
      { tag: 'VI-5123B', priority: 3 },
    ]);
  });

  it('não conta alarme que já normalizou', () => {
    const states = sectionStates([
      alarme({ state: 'normalizado', clearedAt: '2026-06-15T21:20:00.000Z' }),
    ]);

    expect(states.every((state) => state.out.length === 0)).toBe(true);
  });

  it('conta os alarmes em pé por prioridade do design, com a crítica na 1', () => {
    expect(
      alarmCounts([
        alarme({ priority: 'crítica' }),
        alarme({ priority: 'média' }),
        alarme({ priority: 'média', state: 'reconhecido' }),
        alarme({ priority: 'baixa' }),
        alarme({ priority: 'alta', state: 'normalizado', clearedAt: '2026-06-15T21:30:00.000Z' }),
      ]),
    ).toEqual({ 1: 1, 2: 2, 3: 1 });
  });
});
