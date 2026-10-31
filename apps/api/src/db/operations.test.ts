import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  allAssets,
  ALARM_PRIORITIES,
  ALARM_STATES,
  EVIDENCE_KINDS,
  LEAK_STATES,
  MP1,
  NOISE_LEVELS,
  NOTE_ORIGINS,
  NOTE_STATUSES,
  PRECURSOR_WINDOW_S,
  REEL_DISPOSITIONS,
  SHIFT_LETTERS,
  needsOperatorAction,
  type Alarm,
  type GradeChange,
  type JumboReel,
  type MaintenanceNote,
  type Round,
  type SetpointChange,
  type Shift,
  type WebBreak,
} from '@mp1/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SqlExecutor } from './executor';
import type { Database } from './repository';
import { clearOperations, DRIVERS } from './test-drivers';

const assets = allAssets(MP1);

const BEARING = 'MP1-SEC-G4-CS23-MLA';
const OTHER_BEARING = 'MP1-SEC-G1-CS01-MLC';

const turno: Shift = {
  id: 'T-2026-10-31-A',
  letter: 'A',
  startedAt: '2026-10-31T06:00:00-03:00',
  endedAt: '2026-10-31T14:00:00-03:00',
  operator: 'turno A',
  productionT: 352.4,
  efficiencyPct: 97.9,
  handover: ['CS23 MLA em acompanhamento', 'selo da junta do CS08 trocado na próxima parada'],
};

const turnoSeguinte: Shift = {
  ...turno,
  id: 'T-2026-10-31-B',
  letter: 'B',
  startedAt: '2026-10-31T14:00:00-03:00',
  endedAt: '2026-10-31T22:00:00-03:00',
  operator: 'turno B',
  handover: [],
};

const bobina: JumboReel = {
  number: 412,
  shiftId: turno.id,
  startedAt: '2026-10-31T06:12:00-03:00',
  endedAt: '2026-10-31T06:57:00-03:00',
  weightT: 33.8,
  lengthM: 56_300,
  finalDiameterMm: 2980,
  basisWeightGsm: 75.1,
  moisturePct: 4.79,
  caliperUm: 101.8,
  cdSpread: { basisWeightGsm: 0.41, moisturePct: 0.24, caliperUm: 0.83 },
  splices: 0,
  disposition: 'aprovada',
  dispositionReason: null,
};

const bobinaAberta: JumboReel = {
  ...bobina,
  number: 413,
  startedAt: '2026-10-31T06:57:00-03:00',
  endedAt: null,
  weightT: null,
  lengthM: null,
  finalDiameterMm: null,
  basisWeightGsm: null,
  moisturePct: null,
  caliperUm: null,
  cdSpread: null,
  disposition: null,
  dispositionReason: null,
};

const quebra: WebBreak = {
  id: 'QB-1793000000',
  shiftId: turno.id,
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
    {
      tag: 'SDIC-703',
      description: 'draw oscilando',
      leadTimeS: 45,
      valueBefore: 0.2,
      valueAtSignal: 0.7,
    },
  ],
};

const troca: GradeChange = {
  id: 'TG-1793000000',
  shiftId: turno.id,
  fromGsm: 75,
  toGsm: 80,
  startedAt: '2026-10-31T10:00:00-03:00',
  stabilizedAt: '2026-10-31T10:07:30-03:00',
  affectedReels: [412, 413],
};

const ronda: Round = {
  id: 'RD-1793000000',
  shiftId: turno.id,
  startedAt: '2026-10-31T08:00:00-03:00',
  finishedAt: '2026-10-31T08:40:00-03:00',
  inspector: 'turno A',
  points: [
    {
      assetTag: BEARING,
      fieldTempC: 71,
      noise: 'elevado',
      leak: 'nenhum',
      note: 'zunido constante',
      onlineTag: 'TI-5323A',
      onlineValue: 66,
    },
    {
      assetTag: OTHER_BEARING,
      fieldTempC: 58,
      noise: 'normal',
      leak: 'nenhum',
      note: null,
      onlineTag: null,
      onlineValue: null,
    },
  ],
};

const nota: MaintenanceNote = {
  number: 'NM-000123',
  assetTag: BEARING,
  symptom: 'vibração acima da fronteira B/C com ruído na ronda',
  priority: 2,
  origin: 'ronda',
  originRef: ronda.id,
  status: 'aberta',
  requiresShutdown: false,
  evidence: [
    { kind: 'tendência', ref: 'VI-5123A', label: 'RMS das últimas 72 h' },
    { kind: 'ronda', ref: ronda.id, label: 'ponto do CS23 MLA' },
  ],
  createdAt: '2026-10-31T08:45:00-03:00',
  closedAt: null,
};

const escrita: SetpointChange = {
  id: 'SP-1793000000-PIC-514',
  tag: 'PIC-514',
  previousValue: 230,
  newValue: 240,
  unit: 'kPa rel',
  changedBy: 'turno A',
  changedAt: '2026-10-31T09:15:00-03:00',
  reason: 'umidade pré-colagem acima do alvo',
};

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

/** As duas pontas de uma data ISO comparável, sem depender do fuso escrito. */
const sameInstant = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : Date.parse(a) === Date.parse(b);

for (const driver of DRIVERS) {
  const suite = driver.enabled ? describe : describe.skip;

  suite(`entidades de operação · ${driver.name}`, () => {
    let db: Database;
    let sql: SqlExecutor;

    beforeAll(async () => {
      ({ db, sql } = await driver.openWithSql());
      await db.migrate();
    }, 60_000);

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      await clearOperations(sql);
      await db.replaceAssets(assets);
    });

    describe('turno', () => {
      it('grava e devolve o turno com a passagem na ordem escrita', async () => {
        expect(await db.upsertShifts([turno])).toBe(1);

        const stored = await db.findShift(turno.id);
        expect(stored?.letter).toBe('A');
        expect(stored?.operationDate).toBe('2026-10-31');
        expect(stored?.operator).toBe('turno A');
        expect(stored?.productionT).toBeCloseTo(352.4, 6);
        expect(stored?.handover).toEqual(turno.handover);
        expect(sameInstant(stored?.startedAt ?? null, turno.startedAt)).toBe(true);
      });

      it('deriva o dia de operação do id', async () => {
        await db.upsertShifts([{ ...turno, id: 'T-2026-11-01-C' }]);
        expect((await db.findShift('T-2026-11-01-C'))?.operationDate).toBe('2026-11-01');
      });

      it('recusa id de turno fora do padrão', async () => {
        await expect(db.upsertShifts([{ ...turno, id: 'turno-qualquer' }])).rejects.toThrow(
          /fora do padrão/,
        );
      });

      it('é idempotente: o mesmo turno duas vezes é um turno', async () => {
        await db.upsertShifts([turno]);
        await db.upsertShifts([turno]);

        const todos = await db.listShifts();
        expect(todos.filter((s) => s.id === turno.id)).toHaveLength(1);
        expect(todos[0]?.handover).toEqual(turno.handover);
      });

      it('lista do mais recente para o mais antigo', async () => {
        await db.upsertShifts([turno, turnoSeguinte]);
        expect((await db.listShifts()).map((s) => s.id)).toEqual([turnoSeguinte.id, turno.id]);
      });

      it('filtra por janela de tempo', async () => {
        await db.upsertShifts([turno, turnoSeguinte]);

        const tarde = await db.listShifts({ from: new Date('2026-10-31T16:00:00Z') });
        expect(tarde.map((s) => s.id)).toEqual([turnoSeguinte.id]);
      });

      it('aceita exatamente as letras do quadro', async () => {
        for (const letter of SHIFT_LETTERS) {
          await expect(
            db.upsertShifts([{ ...turno, id: `T-2026-10-31-${letter}`, letter }]),
          ).resolves.toBe(1);
        }

        await expect(
          db.upsertShifts([
            { ...turno, id: 'T-2026-10-31-D', letter: 'D' as (typeof SHIFT_LETTERS)[number] },
          ]),
        ).rejects.toThrow();
      });

      it('recusa turno que termina antes de começar', async () => {
        await expect(
          db.upsertShifts([{ ...turno, endedAt: '2026-10-31T05:00:00-03:00' }]),
        ).rejects.toThrow();
      });

      it('devolve null para turno que não existe', async () => {
        await expect(db.findShift('T-1900-01-01-A')).resolves.toBeNull();
      });
    });

    describe('bobina jumbo', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
      });

      it('devolve a bobina fechada exatamente como entrou', async () => {
        await db.upsertReels([bobina]);

        const stored = await db.findReel(bobina.number);
        expect(stored).toMatchObject({
          number: bobina.number,
          shiftId: turno.id,
          weightT: bobina.weightT,
          splices: 0,
          disposition: 'aprovada',
          dispositionReason: null,
        });
        expect(stored?.cdSpread).toEqual(bobina.cdSpread);
      });

      it('mantém nulo o que a bobina em andamento não tem', async () => {
        await db.upsertReels([bobinaAberta]);

        const stored = await db.findReel(bobinaAberta.number);
        expect(stored?.endedAt).toBeNull();
        expect(stored?.weightT).toBeNull();
        expect(stored?.cdSpread).toBeNull();
        expect(stored?.disposition).toBeNull();
      });

      it('exige motivo em bobina rebaixada', async () => {
        await expect(
          db.upsertReels([{ ...bobina, disposition: 'rebaixada', dispositionReason: null }]),
        ).rejects.toThrow();

        await expect(
          db.upsertReels([
            { ...bobina, disposition: 'segregada', dispositionReason: 'umidade fora da faixa' },
          ]),
        ).resolves.toBe(1);
      });

      /**
       * Pela interface isto é impossível: `CdSpread` exige os três números, e
       * `null` é a ausência do objeto inteiro. A restrição existe para o SQL
       * escrito à mão — uma correção de dado, uma carga vinda de fora — e é
       * assim que o teste chega nela.
       */
      it('recusa dispersão CD pela metade, mesmo por SQL direto', async () => {
        await expect(
          sql.rows(
            `insert into jumbo_reel
               (number, shift_id, started_at, splices, cd_basis_weight_gsm)
             values ($1, $2, $3::timestamptz, 0, 0.41)`,
            [900, turno.id, bobina.startedAt],
          ),
        ).rejects.toThrow();
      });

      it('aceita exatamente os destinos declarados', async () => {
        for (const disposition of REEL_DISPOSITIONS) {
          await expect(
            db.upsertReels([{ ...bobina, disposition, dispositionReason: 'motivo' }]),
          ).resolves.toBe(1);
        }

        await expect(
          db.upsertReels([
            {
              ...bobina,
              disposition: 'refugada' as (typeof REEL_DISPOSITIONS)[number],
              dispositionReason: 'motivo',
            },
          ]),
        ).rejects.toThrow();
      });

      it('recusa bobina de um turno que não existe', async () => {
        await expect(db.upsertReels([{ ...bobina, shiftId: 'T-1900-01-01-A' }])).rejects.toThrow();
      });

      it('lista da mais recente para a mais antiga e filtra por turno', async () => {
        await db.upsertShifts([turnoSeguinte]);
        await db.upsertReels([
          bobina,
          bobinaAberta,
          { ...bobina, number: 500, shiftId: turnoSeguinte.id },
        ]);

        expect((await db.listReels()).map((r) => r.number)).toEqual([500, 413, 412]);
        expect((await db.listReels({ shiftId: turno.id })).map((r) => r.number)).toEqual([
          413, 412,
        ]);
      });
    });

    describe('quebra de folha', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
      });

      it('devolve os sinais do mais antigo para o mais recente', async () => {
        expect(await db.upsertWebBreaks([quebra])).toBe(1);

        const [stored] = await db.listWebBreaks();
        expect(stored?.probableCause).toBe(quebra.probableCause);
        expect(stored?.precursors.map((p) => p.leadTimeS)).toEqual([540, 180, 45]);
        expect(stored?.precursors[0]).toEqual(quebra.precursors[0]);
      });

      it('reescreve os sinais em vez de somar', async () => {
        await db.upsertWebBreaks([quebra]);
        await db.upsertWebBreaks([{ ...quebra, precursors: quebra.precursors.slice(0, 1) }]);

        const [stored] = await db.listWebBreaks();
        expect(stored?.precursors).toHaveLength(1);
      });

      it('recusa sinal mais antigo que a janela da LISTA-BASE', async () => {
        await expect(
          db.upsertWebBreaks([
            {
              ...quebra,
              precursors: [{ ...quebra.precursors[0]!, leadTimeS: PRECURSOR_WINDOW_S + 1 }],
            },
          ]),
        ).rejects.toThrow();
      });

      it('aceita quebra ainda aberta', async () => {
        await db.upsertWebBreaks([{ ...quebra, endedAt: null }]);
        expect((await db.listWebBreaks())[0]?.endedAt).toBeNull();
      });
    });

    describe('troca de gramatura', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
        await db.upsertReels([bobina, bobinaAberta]);
      });

      it('devolve as bobinas afetadas', async () => {
        expect(await db.upsertGradeChanges([troca])).toBe(1);

        const [stored] = await db.listGradeChanges();
        expect(stored?.fromGsm).toBe(75);
        expect(stored?.toGsm).toBe(80);
        expect(stored?.affectedReels).toEqual([412, 413]);
      });

      it('recusa troca que não troca nada', async () => {
        await expect(db.upsertGradeChanges([{ ...troca, toGsm: 75 }])).rejects.toThrow();
      });

      it('recusa bobina afetada que não existe', async () => {
        await expect(db.upsertGradeChanges([{ ...troca, affectedReels: [999] }])).rejects.toThrow();
      });

      it('aceita transição ainda em curso', async () => {
        await db.upsertGradeChanges([{ ...troca, stabilizedAt: null, affectedReels: [] }]);
        const [stored] = await db.listGradeChanges();
        expect(stored?.stabilizedAt).toBeNull();
        expect(stored?.affectedReels).toEqual([]);
      });
    });

    describe('ronda', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
      });

      it('devolve os pontos na ordem percorrida', async () => {
        expect(await db.upsertRounds([ronda])).toBe(1);

        const stored = await db.findRound(ronda.id);
        expect(stored?.points.map((p) => p.assetTag)).toEqual([BEARING, OTHER_BEARING]);
        expect(stored?.points[0]).toEqual(ronda.points[0]);
      });

      it('guarda o valor online do momento ao lado do de campo', async () => {
        await db.upsertRounds([ronda]);

        const stored = await db.findRound(ronda.id);
        expect(stored?.points[0]?.fieldTempC).toBe(71);
        expect(stored?.points[0]?.onlineTag).toBe('TI-5323A');
        expect(stored?.points[0]?.onlineValue).toBe(66);
      });

      it('aceita ponto sem instrumento, com os dois campos nulos', async () => {
        await db.upsertRounds([ronda]);
        const stored = await db.findRound(ronda.id);
        expect(stored?.points[1]?.onlineTag).toBeNull();
        expect(stored?.points[1]?.onlineValue).toBeNull();
      });

      it('recusa ponto com tag online sem valor', async () => {
        await expect(
          db.upsertRounds([
            {
              ...ronda,
              points: [{ ...ronda.points[0]!, onlineValue: null }],
            },
          ]),
        ).rejects.toThrow();
      });

      it('aceita exatamente as escalas declaradas', async () => {
        for (const noise of NOISE_LEVELS) {
          for (const leak of LEAK_STATES) {
            await expect(
              db.upsertRounds([{ ...ronda, points: [{ ...ronda.points[1]!, noise, leak }] }]),
            ).resolves.toBe(1);
          }
        }

        await expect(
          db.upsertRounds([
            {
              ...ronda,
              points: [{ ...ronda.points[1]!, noise: 'estranho' as (typeof NOISE_LEVELS)[number] }],
            },
          ]),
        ).rejects.toThrow();
      });

      it('recusa ponto apontando para ativo que não existe', async () => {
        await expect(
          db.upsertRounds([
            { ...ronda, points: [{ ...ronda.points[1]!, assetTag: 'MP1-NAO-EXISTE' }] },
          ]),
        ).rejects.toThrow();
      });
    });

    describe('nota de manutenção', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
        await db.upsertRounds([ronda]);
      });

      it('devolve a nota com as evidências na ordem', async () => {
        expect(await db.upsertMaintenanceNotes([nota])).toBe(1);

        const stored = await db.findMaintenanceNote(nota.number);
        expect(stored?.symptom).toBe(nota.symptom);
        expect(stored?.priority).toBe(2);
        expect(stored?.evidence).toEqual(nota.evidence);
      });

      it('recusa nota encerrada sem data de encerramento', async () => {
        await expect(
          db.upsertMaintenanceNotes([{ ...nota, status: 'encerrada' }]),
        ).rejects.toThrow();
      });

      it('recusa nota não encerrada com data de encerramento', async () => {
        await expect(
          db.upsertMaintenanceNotes([{ ...nota, closedAt: '2026-11-02T14:00:00-03:00' }]),
        ).rejects.toThrow();
      });

      it('recusa nota de ronda sem referência', async () => {
        await expect(db.upsertMaintenanceNotes([{ ...nota, originRef: null }])).rejects.toThrow();
      });

      it('recusa nota de operação com referência', async () => {
        await expect(
          db.upsertMaintenanceNotes([{ ...nota, origin: 'operação' }]),
        ).rejects.toThrow();
      });

      it('recusa prioridade fora de 1 a 4', async () => {
        await expect(
          db.upsertMaintenanceNotes([{ ...nota, priority: 5 as (typeof nota)['priority'] }]),
        ).rejects.toThrow();
      });

      it('ordena a fila por prioridade e depois por data', async () => {
        await db.upsertMaintenanceNotes([
          nota,
          { ...nota, number: 'NM-000124', priority: 1, createdAt: '2026-10-30T08:00:00-03:00' },
          { ...nota, number: 'NM-000125', priority: 4, createdAt: '2026-10-31T23:00:00-03:00' },
        ]);

        expect((await db.listMaintenanceNotes()).map((n) => n.number)).toEqual([
          'NM-000124',
          'NM-000123',
          'NM-000125',
        ]);
      });

      it('filtra por situação e por ativo', async () => {
        await db.upsertMaintenanceNotes([
          nota,
          {
            ...nota,
            number: 'NM-000126',
            status: 'encerrada',
            closedAt: '2026-11-02T14:00:00-03:00',
          },
        ]);

        expect((await db.listMaintenanceNotes({ status: 'aberta' })).map((n) => n.number)).toEqual([
          'NM-000123',
        ]);
        expect(await db.listMaintenanceNotes({ assetTag: 'MP1-QCS-SC1' })).toEqual([]);
      });

      it('aceita exatamente as situações, origens e tipos de evidência declarados', async () => {
        for (const status of NOTE_STATUSES) {
          const closedAt = status === 'encerrada' ? '2026-11-02T14:00:00-03:00' : null;
          await expect(db.upsertMaintenanceNotes([{ ...nota, status, closedAt }])).resolves.toBe(1);
        }

        for (const origin of NOTE_ORIGINS) {
          const originRef = origin === 'operação' ? null : ronda.id;
          await expect(db.upsertMaintenanceNotes([{ ...nota, origin, originRef }])).resolves.toBe(
            1,
          );
        }

        for (const kind of EVIDENCE_KINDS) {
          await expect(
            db.upsertMaintenanceNotes([{ ...nota, evidence: [{ kind, ref: 'x', label: 'y' }] }]),
          ).resolves.toBe(1);
        }
      });
    });

    describe('alteração de setpoint', () => {
      it('grava a auditoria inteira', async () => {
        await db.insertSetpointChange(escrita);

        const [stored] = await db.listSetpointChanges();
        expect(stored).toMatchObject({
          tag: 'PIC-514',
          previousValue: 230,
          newValue: 240,
          unit: 'kPa rel',
          changedBy: 'turno A',
          reason: escrita.reason,
        });
      });

      it('não reescreve um registro de auditoria já gravado', async () => {
        await db.insertSetpointChange(escrita);
        await db.insertSetpointChange({ ...escrita, newValue: 999, reason: 'outro motivo' });

        const stored = await db.listSetpointChanges();
        expect(stored).toHaveLength(1);
        expect(stored[0]?.newValue).toBe(240);
      });

      it('recusa escrita sem motivo', async () => {
        await expect(
          db.insertSetpointChange({ ...escrita, id: 'SP-2', reason: '   ' }),
        ).rejects.toThrow();
      });

      it('aceita reafirmar o mesmo valor', async () => {
        await expect(
          db.insertSetpointChange({ ...escrita, id: 'SP-3', previousValue: 240, newValue: 240 }),
        ).resolves.toBeUndefined();
      });

      it('acha a última alteração de uma malha', async () => {
        await db.insertSetpointChange(escrita);
        await db.insertSetpointChange({
          ...escrita,
          id: 'SP-4',
          previousValue: 240,
          newValue: 250,
          changedAt: '2026-10-31T11:00:00-03:00',
        });

        expect((await db.latestSetpointChange('PIC-514'))?.newValue).toBe(250);
        expect(await db.latestSetpointChange('PIC-511')).toBeNull();
      });

      it('filtra por malha', async () => {
        await db.insertSetpointChange(escrita);
        await db.insertSetpointChange({ ...escrita, id: 'SP-5', tag: 'PIC-711' });

        expect((await db.listSetpointChanges({ tag: 'PIC-711' })).map((c) => c.id)).toEqual([
          'SP-5',
        ]);
      });
    });

    describe('alarme', () => {
      it('grava e devolve o alarme inteiro', async () => {
        expect(await db.upsertAlarms([alarme])).toBe(1);

        const stored = await db.findAlarm(alarme.id);
        expect(stored).toMatchObject({
          tag: 'PDIC-524',
          limit: 'LL',
          threshold: 18,
          priority: 'alta',
          state: 'ativo',
          peakValue: 14.2,
        });
        expect(stored?.acknowledgedAt).toBeNull();
      });

      it('reconhece um alarme ativo uma vez só', async () => {
        await db.upsertAlarms([alarme]);
        const quando = new Date('2026-10-31T10:25:00Z');

        const reconhecido = await db.acknowledgeAlarm(alarme.id, 'turno A', quando);
        expect(reconhecido?.state).toBe('reconhecido');
        expect(reconhecido?.acknowledgedBy).toBe('turno A');

        // o segundo clique não devolve linha: não foi ele que reconheceu
        expect(await db.acknowledgeAlarm(alarme.id, 'turno B', quando)).toBeNull();
        expect((await db.findAlarm(alarme.id))?.acknowledgedBy).toBe('turno A');
      });

      it('mantém normalizado o alarme que já havia voltado', async () => {
        await db.upsertAlarms([
          { ...alarme, state: 'normalizado', clearedAt: '2026-10-31T07:40:00-03:00' },
        ]);

        const reconhecido = await db.acknowledgeAlarm(
          alarme.id,
          'turno A',
          new Date('2026-10-31T11:00:00Z'),
        );
        expect(reconhecido?.state).toBe('normalizado');
        expect(reconhecido?.acknowledgedAt).not.toBeNull();
      });

      it('devolve null ao reconhecer alarme que não existe', async () => {
        await expect(
          db.acknowledgeAlarm('AL-NAO-EXISTE', 'turno A', new Date()),
        ).resolves.toBeNull();
      });

      it('engaveta e desengaveta', async () => {
        await db.upsertAlarms([alarme]);
        const até = new Date('2026-10-31T17:00:00Z');

        const engavetado = await db.shelveAlarm(alarme.id, 'turno A', até);
        expect(engavetado?.shelvedBy).toBe('turno A');
        expect(sameInstant(engavetado?.shelvedUntil ?? null, até.toISOString())).toBe(true);

        const livre = await db.unshelveAlarm(alarme.id);
        expect(livre?.shelvedUntil).toBeNull();
        expect(livre?.shelvedBy).toBeNull();
      });

      it('recusa hora de normalização em alarme que não normalizou', async () => {
        await expect(
          db.upsertAlarms([{ ...alarme, clearedAt: '2026-10-31T07:40:00-03:00' }]),
        ).rejects.toThrow();
      });

      it('recusa reconhecimento antes do disparo', async () => {
        await expect(
          db.upsertAlarms([
            {
              ...alarme,
              acknowledgedAt: '2026-10-31T07:00:00-03:00',
              acknowledgedBy: 'turno A',
            },
          ]),
        ).rejects.toThrow();
      });

      it('aceita exatamente os estados e prioridades declarados', async () => {
        for (const state of ALARM_STATES) {
          const clearedAt = state === 'normalizado' ? '2026-10-31T07:40:00-03:00' : null;
          await expect(db.upsertAlarms([{ ...alarme, state, clearedAt }])).resolves.toBe(1);
        }

        for (const priority of ALARM_PRIORITIES) {
          await expect(
            db.upsertAlarms([{ ...alarme, priority, state: 'ativo', clearedAt: null }]),
          ).resolves.toBe(1);
        }

        await expect(
          db.upsertAlarms([
            { ...alarme, priority: 'urgentíssima' as (typeof ALARM_PRIORITIES)[number] },
          ]),
        ).rejects.toThrow();
      });

      /**
       * O filtro `needsAction` do SQL e `needsOperatorAction` de `@mp1/shared`
       * precisam dizer a mesma coisa. São duas escritas da mesma regra — uma
       * para a lista vir filtrada do banco, outra para a tela decidir sem ir ao
       * banco — e este teste é o que as mantém juntas.
       */
      it('filtra o que pede ação igual à regra de @mp1/shared', async () => {
        const casos: Alarm[] = [
          { ...alarme, id: 'AL-1', state: 'ativo' },
          {
            ...alarme,
            id: 'AL-2',
            state: 'reconhecido',
            acknowledgedAt: '2026-10-31T07:25:00-03:00',
            acknowledgedBy: 'turno A',
          },
          {
            ...alarme,
            id: 'AL-3',
            state: 'normalizado',
            clearedAt: '2026-10-31T07:40:00-03:00',
          },
          {
            ...alarme,
            id: 'AL-4',
            state: 'normalizado',
            clearedAt: '2026-10-31T07:40:00-03:00',
            acknowledgedAt: '2026-10-31T07:25:00-03:00',
            acknowledgedBy: 'turno A',
          },
        ];
        await db.upsertAlarms(casos);

        const doBanco = (await db.listAlarms({ needsAction: true })).map((a) => a.id).sort();
        const daRegra = casos
          .filter(needsOperatorAction)
          .map((a) => a.id)
          .sort();

        expect(doBanco).toEqual(daRegra);
        // AL-2 foi reconhecido e saiu do estado ativo; AL-3 normalizou sozinho
        // sem ninguém reconhecer, e por isso continua na lista
        expect(doBanco).toEqual(['AL-1', 'AL-3']);
      });

      it('conta a janela de inundação por hora de disparo', async () => {
        const fim = new Date('2026-10-31T10:30:00Z');
        const dentro = Array.from({ length: 11 }, (_, i) => ({
          ...alarme,
          id: `AL-F${String(i)}`,
          raisedAt: new Date(fim.getTime() - i * 10_000).toISOString(),
        }));
        await db.upsertAlarms([
          ...dentro,
          { ...alarme, id: 'AL-VELHO', raisedAt: '2026-10-31T09:00:00Z' },
        ]);

        const inicio = new Date(fim.getTime() - 600_000);
        expect(await db.countAlarmsInWindow(inicio, fim)).toBe(11);
      });

      it('filtra por estado, prioridade e tag', async () => {
        await db.upsertAlarms([
          alarme,
          {
            ...alarme,
            id: 'AL-OUTRO',
            tag: 'TI-804',
            limit: 'HH',
            threshold: 92,
            priority: 'crítica',
          },
        ]);

        expect((await db.listAlarms({ tag: 'TI-804' })).map((a) => a.id)).toEqual(['AL-OUTRO']);
        expect((await db.listAlarms({ priority: 'crítica' })).map((a) => a.id)).toEqual([
          'AL-OUTRO',
        ]);
        expect((await db.listAlarms({ state: 'ativo' })).map((a) => a.id).sort()).toEqual([
          alarme.id,
          'AL-OUTRO',
        ]);
      });
    });

    describe('tetos das listas', () => {
      beforeEach(async () => {
        await db.upsertShifts([turno]);
      });

      it('não devolve lista aberta', async () => {
        const bobinas = Array.from({ length: 150 }, (_, i) => ({ ...bobina, number: 1000 + i }));
        await db.upsertReels(bobinas);

        // o padrão é DEFAULT_LIST_LIMIT
        expect(await db.listReels()).toHaveLength(100);
        expect(await db.listReels({ limit: 10 })).toHaveLength(10);
        // acima do teto absoluto, o teto vale
        expect((await db.listReels({ limit: 100_000 })).length).toBeLessThanOrEqual(1000);
      });
    });
  });
}

/**
 * As enumerações estão escritas duas vezes: como constante em `@mp1/shared` e
 * como `check` na migration. Isso é de propósito — o banco não pode depender do
 * código para recusar o que é inválido — mas é duplicação, e duplicação some de
 * vista.
 *
 * Este teste lê a migration e cobra que as duas listas sejam a mesma. Mudar a
 * constante sem mudar o SQL quebra aqui, e não em produção.
 */
describe('as enumerações do SQL batem com as de @mp1/shared', () => {
  const migration = fileURLToPath(new URL('./migrations/003_operations.sql', import.meta.url));

  const casos: readonly { readonly constraint: string; readonly values: readonly string[] }[] = [
    { constraint: 'shift_letter_valid', values: SHIFT_LETTERS },
    { constraint: 'reel_disposition_valid', values: REEL_DISPOSITIONS },
    { constraint: 'round_point_noise_valid', values: NOISE_LEVELS },
    { constraint: 'round_point_leak_valid', values: LEAK_STATES },
    { constraint: 'note_origin_valid', values: NOTE_ORIGINS },
    { constraint: 'note_status_valid', values: NOTE_STATUSES },
    { constraint: 'evidence_kind_valid', values: EVIDENCE_KINDS },
    { constraint: 'alarm_priority_valid', values: ALARM_PRIORITIES },
    { constraint: 'alarm_state_valid', values: ALARM_STATES },
  ];

  it.each(casos)('$constraint', async ({ constraint, values }) => {
    const sql = await readFile(migration, 'utf8');
    const bloco = new RegExp(`constraint ${constraint} check \\(([^)]*)\\)`, 's').exec(sql);

    expect(bloco, `restrição ${constraint} não encontrada na migration`).not.toBeNull();

    const noSql = [...(bloco?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect([...noSql].sort()).toEqual([...values].map(String).sort());
  });

  it('usa a janela de PRECURSOR_WINDOW_S no check dos sinais', async () => {
    const sql = await readFile(migration, 'utf8');
    expect(sql).toContain(`lead_time_s between 0 and ${String(PRECURSOR_WINDOW_S)}`);
  });
});
