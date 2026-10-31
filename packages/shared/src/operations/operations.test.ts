import { describe, expect, it } from 'vitest';

import {
  ALARM_DEADBAND_FRACTION,
  ALARM_FLOOD_THRESHOLD,
  ALARM_FLOOD_WINDOW_S,
  type Alarm,
  alarmDeadband,
  alarmPriority,
  alarmPrioritySource,
  alarmThreshold,
  alarmsInFloodWindow,
  hasCrossedLimit,
  hasReturnedToNormal,
  isAlarmFlood,
  isShelved,
  needsOperatorAction,
  nextAlarmState,
} from './alarm';
import { type GradeChange, gradeChangeStepGsm, stabilizationS } from './grade-change';
import {
  type MaintenanceNote,
  maintenanceNoteNumber,
  noteOriginIsConsistent,
  noteStatusIsConsistent,
} from './maintenance';
import { type JumboReel, isReelClosed, reelDispositionIsConsistent } from './reel';
import { type Round, fieldOnlineGapC, pointsNeedingAttention } from './round';
import { checkSetpoint } from './setpoint';
import {
  FIRST_SHIFT_START_HOUR,
  SHIFT_HOURS,
  SHIFT_LETTERS,
  plantOffsetSuffix,
  shiftId,
  shiftWindowAt,
} from './shift';
import {
  PRECURSOR_WINDOW_S,
  type WebBreak,
  breakDurationS,
  precursorsAreWithinWindow,
} from './web-break';

/** 09:00 UTC = 06:00 na planta, a borda do turno A. */
const utc = (iso: string): Date => new Date(iso);

describe('quadro de turnos', () => {
  it('cobre as 24 h com as letras declaradas', () => {
    expect(SHIFT_LETTERS.length * SHIFT_HOURS).toBe(24);
  });

  it('escreve o deslocamento da planta como sufixo ISO', () => {
    expect(plantOffsetSuffix()).toBe('-03:00');
  });

  it('põe 06:00 local no turno A', () => {
    const janela = shiftWindowAt(utc('2026-10-31T09:00:00Z'));

    expect(janela.letter).toBe('A');
    expect(janela.operationDate).toBe('2026-10-31');
    expect(janela.id).toBe('T-2026-10-31-A');
    expect(janela.startedAt).toBe('2026-10-31T06:00:00-03:00');
    expect(janela.endedAt).toBe('2026-10-31T14:00:00-03:00');
  });

  it('troca de turno na hora cheia, sem sobreposição', () => {
    expect(shiftWindowAt(utc('2026-10-31T16:59:59Z')).letter).toBe('A');
    expect(shiftWindowAt(utc('2026-10-31T17:00:00Z')).letter).toBe('B');
    expect(shiftWindowAt(utc('2026-11-01T00:59:59Z')).letter).toBe('B');
    expect(shiftWindowAt(utc('2026-11-01T01:00:00Z')).letter).toBe('C');
  });

  it('mantém a madrugada no dia de operação em que o turno começou', () => {
    // 02:00 local de 1º de novembro: quem está na máquina é o turno C de 31/10.
    const janela = shiftWindowAt(utc('2026-11-01T05:00:00Z'));

    expect(janela.letter).toBe('C');
    expect(janela.operationDate).toBe('2026-10-31');
    expect(janela.startedAt).toBe('2026-10-31T22:00:00-03:00');
    expect(janela.endedAt).toBe('2026-11-01T06:00:00-03:00');
  });

  it('começa o dia de operação na hora declarada', () => {
    const janela = shiftWindowAt(utc('2026-10-31T09:00:01Z'));
    expect(janela.startedAt.slice(11, 13)).toBe(String(FIRST_SHIFT_START_HOUR).padStart(2, '0'));
  });

  it('monta o id a partir do dia e da letra', () => {
    expect(shiftId('2026-10-31', 'B')).toBe('T-2026-10-31-B');
  });
});

describe('bobina jumbo', () => {
  const base: JumboReel = {
    number: 412,
    shiftId: 'T-2026-10-31-A',
    startedAt: '2026-10-31T06:12:00-03:00',
    endedAt: null,
    weightT: null,
    lengthM: null,
    finalDiameterMm: null,
    basisWeightGsm: null,
    moisturePct: null,
    caliperUm: null,
    cdSpread: null,
    splices: 0,
    disposition: null,
    dispositionReason: null,
  };

  it('não considera fechada a bobina ainda na Pope', () => {
    expect(isReelClosed(base)).toBe(false);
    expect(reelDispositionIsConsistent(base)).toBe(true);
  });

  it('considera fechada a que tem fim e destino', () => {
    const fechada: JumboReel = {
      ...base,
      endedAt: '2026-10-31T06:57:00-03:00',
      disposition: 'aprovada',
    };
    expect(isReelClosed(fechada)).toBe(true);
  });

  it('exige motivo em bobina rebaixada ou segregada', () => {
    for (const disposition of ['rebaixada', 'segregada'] as const) {
      expect(reelDispositionIsConsistent({ ...base, disposition, dispositionReason: null })).toBe(
        false,
      );
      expect(
        reelDispositionIsConsistent({
          ...base,
          disposition,
          dispositionReason: 'umidade fora da faixa na troca de gramatura',
        }),
      ).toBe(true);
    }
  });

  it('não aceita motivo em bobina sem destino', () => {
    expect(reelDispositionIsConsistent({ ...base, dispositionReason: 'qualquer' })).toBe(false);
  });
});

describe('quebra de folha', () => {
  const quebra: WebBreak = {
    id: 'QB-1793000000',
    shiftId: 'T-2026-10-31-A',
    startedAt: '2026-10-31T07:30:00-03:00',
    endedAt: '2026-10-31T07:52:00-03:00',
    section: 'post-dryer',
    probableCause: 'descolamento na entrada da pós-secagem',
    precursors: [
      {
        tag: 'PDIC-721',
        description: 'caiu 12 kPa em 40 s',
        leadTimeS: 540,
        valueBefore: 38,
        valueAtSignal: 26,
      },
      {
        tag: 'AIC-903',
        description: 'subiu 0,6 % acima do alvo',
        leadTimeS: 180,
        valueBefore: 4.8,
        valueAtSignal: 5.4,
      },
    ],
  };

  it('mede a parada em segundos', () => {
    expect(breakDurationS(quebra)).toBe(22 * 60);
  });

  it('não mede a parada de uma quebra aberta', () => {
    expect(breakDurationS({ ...quebra, endedAt: null })).toBeNull();
  });

  it('aceita sinais dentro da janela de 10 min, do mais antigo ao mais recente', () => {
    expect(precursorsAreWithinWindow(quebra)).toBe(true);
  });

  it('recusa sinal mais antigo que a janela', () => {
    expect(
      precursorsAreWithinWindow({
        ...quebra,
        precursors: [{ ...quebra.precursors[0]!, leadTimeS: PRECURSOR_WINDOW_S + 1 }],
      }),
    ).toBe(false);
  });

  it('recusa sinais fora de ordem', () => {
    expect(
      precursorsAreWithinWindow({ ...quebra, precursors: [...quebra.precursors].reverse() }),
    ).toBe(false);
  });

  it('aceita quebra sem sinal nenhum', () => {
    expect(precursorsAreWithinWindow({ ...quebra, precursors: [] })).toBe(true);
  });
});

describe('troca de gramatura', () => {
  const troca: GradeChange = {
    id: 'TG-1793000000',
    shiftId: 'T-2026-10-31-A',
    fromGsm: 75,
    toGsm: 80,
    startedAt: '2026-10-31T10:00:00-03:00',
    stabilizedAt: '2026-10-31T10:07:30-03:00',
    affectedReels: [412, 413],
  };

  it('mede o degrau e o tempo de estabilização', () => {
    expect(gradeChangeStepGsm(troca)).toBe(5);
    expect(stabilizationS(troca)).toBe(450);
  });

  it('dá degrau negativo quando a folha fica mais leve', () => {
    expect(gradeChangeStepGsm({ ...troca, fromGsm: 80, toGsm: 75 })).toBe(-5);
  });

  it('não mede estabilização de transição em curso', () => {
    expect(stabilizationS({ ...troca, stabilizedAt: null })).toBeNull();
  });
});

describe('ronda', () => {
  const ronda: Round = {
    id: 'RD-1793000000',
    shiftId: 'T-2026-10-31-A',
    startedAt: '2026-10-31T08:00:00-03:00',
    finishedAt: '2026-10-31T08:40:00-03:00',
    inspector: 'turno A',
    points: [
      {
        assetTag: 'MP1-SEC-G4-CS23-MLA',
        fieldTempC: 71,
        noise: 'elevado',
        leak: 'nenhum',
        note: 'zunido constante',
        onlineTag: 'TI-5323A',
        onlineValue: 66,
      },
      {
        assetTag: 'MP1-SEC-G1-CS01-MLC',
        fieldTempC: 58,
        noise: 'normal',
        leak: 'nenhum',
        note: null,
        onlineTag: 'TI-5301B',
        onlineValue: 59,
      },
      {
        assetTag: 'MP1-SEC-G2-CS08-MLA',
        fieldTempC: null,
        noise: 'normal',
        leak: 'gotejamento',
        note: 'selo da junta rotativa',
        onlineTag: null,
        onlineValue: null,
      },
    ],
  };

  it('separa os pontos que pedem atenção', () => {
    expect(pointsNeedingAttention(ronda).map((p) => p.assetTag)).toEqual([
      'MP1-SEC-G4-CS23-MLA',
      'MP1-SEC-G2-CS08-MLA',
    ]);
  });

  it('mede a diferença entre o campo e o online', () => {
    expect(fieldOnlineGapC(ronda.points[0]!)).toBe(5);
    expect(fieldOnlineGapC(ronda.points[1]!)).toBe(-1);
  });

  it('não inventa diferença quando falta um dos dois', () => {
    expect(fieldOnlineGapC(ronda.points[2]!)).toBeNull();
  });
});

describe('nota de manutenção', () => {
  const nota: MaintenanceNote = {
    number: 'NM-000123',
    assetTag: 'MP1-SEC-G4-CS23-MLA',
    symptom: 'vibração acima da fronteira B/C com ruído na ronda',
    priority: 2,
    origin: 'alarme',
    originRef: 'AL-1793000000-VI-5123A-H',
    status: 'aberta',
    requiresShutdown: false,
    evidence: [{ kind: 'tendência', ref: 'VI-5123A', label: 'RMS das últimas 72 h' }],
    createdAt: '2026-10-31T08:45:00-03:00',
    closedAt: null,
  };

  it('formata o número com seis dígitos', () => {
    expect(maintenanceNoteNumber(123)).toBe('NM-000123');
    expect(maintenanceNoteNumber(1)).toBe('NM-000001');
  });

  it('recusa sequencial que não é inteiro positivo', () => {
    expect(() => maintenanceNoteNumber(0)).toThrow(/inteiro positivo/);
    expect(() => maintenanceNoteNumber(1.5)).toThrow(/inteiro positivo/);
  });

  it('exige data de encerramento só na nota encerrada', () => {
    expect(noteStatusIsConsistent(nota)).toBe(true);
    expect(noteStatusIsConsistent({ ...nota, status: 'encerrada' })).toBe(false);
    expect(
      noteStatusIsConsistent({
        ...nota,
        status: 'encerrada',
        closedAt: '2026-11-02T14:00:00-03:00',
      }),
    ).toBe(true);
    expect(noteStatusIsConsistent({ ...nota, closedAt: '2026-11-02T14:00:00-03:00' })).toBe(false);
  });

  it('exige referência em nota de alarme ou de ronda', () => {
    expect(noteOriginIsConsistent(nota)).toBe(true);
    expect(noteOriginIsConsistent({ ...nota, originRef: null })).toBe(false);
    expect(noteOriginIsConsistent({ ...nota, origin: 'operação', originRef: null })).toBe(true);
    expect(noteOriginIsConsistent({ ...nota, origin: 'operação' })).toBe(false);
  });
});

describe('alteração de setpoint', () => {
  it('aceita valor dentro da faixa do catálogo, com motivo', () => {
    const check = checkSetpoint('PIC-514', 240, 'umidade pré-colagem acima do alvo');

    expect(check.ok).toBe(true);
    expect(check.rejection).toBeNull();
    expect(check.min).toBe(120);
    expect(check.max).toBe(350);
  });

  it('recusa tag que não está no catálogo', () => {
    expect(checkSetpoint('PIC-999', 100, 'motivo').rejection).toBe('tag-desconhecida');
  });

  it('recusa escrita em medição', () => {
    // AI-407 é sequidade na saída da prensa: medida, não malha.
    const check = checkSetpoint('AI-407', 51, 'motivo');

    expect(check.rejection).toBe('tag-nao-controlada');
    expect(check.message).toMatch(/medição, não malha/);
  });

  it('recusa valor fora da faixa de operação', () => {
    const check = checkSetpoint('PIC-514', 400, 'quero secar mais');

    expect(check.rejection).toBe('fora-dos-limites');
    expect(check.message).toMatch(/120 a 350 kPa rel/);
  });

  it('recusa escrita sem motivo', () => {
    expect(checkSetpoint('PIC-514', 240, '   ').rejection).toBe('sem-motivo');
  });

  it('recusa valor não finito', () => {
    expect(checkSetpoint('PIC-514', Number.NaN, 'motivo').rejection).toBe('valor-invalido');
  });

  it('aceita as pontas da faixa', () => {
    expect(checkSetpoint('PIC-514', 120, 'motivo').ok).toBe(true);
    expect(checkSetpoint('PIC-514', 350, 'motivo').ok).toBe(true);
  });
});

describe('alarme', () => {
  const alarme: Alarm = {
    id: 'AL-1793000000-PDIC-524-LL',
    tag: 'PDIC-524',
    limit: 'LL',
    threshold: 18,
    priority: 'alta',
    state: 'ativo',
    raisedAt: '2026-10-31T07:20:00-03:00',
    peakValue: 14.2,
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
    shelvedUntil: null,
    shelvedBy: null,
  };

  it('lê o limite do catálogo', () => {
    expect(alarmThreshold('PDIC-524', 'LL')).toBe(18);
    expect(alarmThreshold('AIC-903', 'H')).toBe(5.3);
    expect(alarmThreshold('PDIC-524', 'HH')).toBeNull();
    expect(alarmThreshold('PIC-999', 'H')).toBeNull();
  });

  it('usa a prioridade que a pesquisa nomeia, quando ela nomeia', () => {
    expect(alarmPriority('TI-804', 'HH')).toBe('crítica');
    expect(alarmPrioritySource('TI-804', 'HH').source).toBe('B');
    expect(alarmPriority('FIC-1105', 'LL')).toBe('crítica');
  });

  it('cai na regra padrão nas demais', () => {
    expect(alarmPriority('AIC-902', 'H')).toBe('média');
    expect(alarmPriority('AIC-902', 'HH')).toBe('alta');
    expect(alarmPrioritySource('AIC-902', 'H').source).toBe('assumed');
  });

  it('tira a banda morta da faixa de operação', () => {
    // PDIC-524 vai de 25 a 55 kPa: 1 % de 30 = 0,3.
    expect(alarmDeadband('PDIC-524')).toBeCloseTo(30 * ALARM_DEADBAND_FRACTION, 10);
    expect(alarmDeadband('PIC-999')).toBeNull();
  });

  it('dispara no limite exato, sem banda morta', () => {
    expect(hasCrossedLimit('PDIC-524', 'LL', 18)).toBe(true);
    expect(hasCrossedLimit('PDIC-524', 'LL', 18.01)).toBe(false);
    expect(hasCrossedLimit('AIC-903', 'H', 5.3)).toBe(true);
    expect(hasCrossedLimit('AIC-903', 'H', 5.29)).toBe(false);
  });

  it('normaliza só depois da banda morta, para dentro da faixa', () => {
    expect(hasReturnedToNormal('PDIC-524', 'LL', 18.2)).toBe(false);
    expect(hasReturnedToNormal('PDIC-524', 'LL', 18.4)).toBe(true);
    expect(hasReturnedToNormal('AIC-903', 'H', 5.29)).toBe(false);
    expect(hasReturnedToNormal('AIC-903', 'H', 5.2)).toBe(true);
  });

  it('reconhece um alarme ativo e mantém o normalizado normalizado', () => {
    expect(nextAlarmState('ativo', 'reconhecer')).toBe('reconhecido');
    expect(nextAlarmState('normalizado', 'reconhecer')).toBe('normalizado');
    expect(nextAlarmState('reconhecido', 'normalizar')).toBe('normalizado');
    expect(nextAlarmState('normalizado', 'reativar')).toBe('ativo');
  });

  it('mantém na lista o alarme que normalizou sem ninguém reconhecer', () => {
    expect(needsOperatorAction({ ...alarme, state: 'normalizado' })).toBe(true);
    expect(
      needsOperatorAction({
        ...alarme,
        state: 'normalizado',
        acknowledgedAt: '2026-10-31T07:25:00-03:00',
        acknowledgedBy: 'turno A',
      }),
    ).toBe(false);
  });

  it('mantém na lista o ativo já reconhecido', () => {
    expect(
      needsOperatorAction({
        ...alarme,
        acknowledgedAt: '2026-10-31T07:25:00-03:00',
        acknowledgedBy: 'turno A',
      }),
    ).toBe(true);
  });

  it('respeita o prazo da gaveta', () => {
    const engavetado: Alarm = {
      ...alarme,
      shelvedUntil: '2026-10-31T08:00:00-03:00',
      shelvedBy: 'turno A',
    };

    expect(isShelved(engavetado, utc('2026-10-31T10:30:00Z'))).toBe(true);
    expect(isShelved(engavetado, utc('2026-10-31T11:30:00Z'))).toBe(false);
    expect(isShelved(alarme, utc('2026-10-31T10:30:00Z'))).toBe(false);
  });

  it('conta inundação na janela de 10 min da ISA-18.2', () => {
    const at = utc('2026-10-31T10:30:00Z');
    const dentro = (segundos: number): Alarm => ({
      ...alarme,
      id: `AL-${String(segundos)}`,
      raisedAt: new Date(at.getTime() - segundos * 1000).toISOString(),
    });

    const onze = Array.from({ length: ALARM_FLOOD_THRESHOLD + 1 }, (_, i) => dentro(i * 10));
    expect(alarmsInFloodWindow(onze, at)).toHaveLength(ALARM_FLOOD_THRESHOLD + 1);
    expect(isAlarmFlood(onze, at)).toBe(true);

    const dez = onze.slice(0, ALARM_FLOOD_THRESHOLD);
    expect(isAlarmFlood(dez, at)).toBe(false);

    const antigo = [...dez, dentro(ALARM_FLOOD_WINDOW_S + 1)];
    expect(alarmsInFloodWindow(antigo, at)).toHaveLength(ALARM_FLOOD_THRESHOLD);
    expect(isAlarmFlood(antigo, at)).toBe(false);
  });
});
