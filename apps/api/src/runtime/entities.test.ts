import {
  allAssets,
  HISTORIAN_POINTS,
  MP1,
  PRECURSOR_WINDOW_S,
  precursorsAreWithinWindow,
  reelDispositionIsConsistent,
  noteOriginIsConsistent,
  noteStatusIsConsistent,
  shiftWindowAt,
  WEB_WIDTH_M,
  type Alarm,
} from '@mp1/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SqlExecutor } from '../db/executor';
import type { Database } from '../db/repository';
import { clearOperations, DRIVERS } from '../db/test-drivers';
import { tickTime, TICKS_PER_HOUR } from '../simulation/clock';
import { shiftPlan } from '../simulation/scenarios';
import { catchUp } from './catchup';
import { noteNumberFor, notesFromAlarms, reelWeightT, shiftsInRange } from './entities';

const SEED = 4242;

/** Um turno B inteiro: tem troca de gramatura, bobinas, ronda e talvez quebra. */
const TURNO_B = shiftWindowAt(new Date('2026-06-15T18:00:00Z'));
const PLANO = shiftPlan(SEED, TURNO_B);

const driver = DRIVERS[0];
if (!driver) throw new Error('nenhum driver de teste disponível');

const LENTO = 120_000;

describe('conta do peso da bobina', () => {
  it('sai do comprimento, da largura e da gramatura medida', () => {
    // 66.540 m × 8 m × 75 g/m² = ~39,9 t
    expect(reelWeightT(66_540, 75)).toBeCloseTo((66_540 * WEB_WIDTH_M * 75) / 1e6, 9);
    expect(reelWeightT(66_540, 75)).toBeGreaterThan(35);
    expect(reelWeightT(66_540, 75)).toBeLessThan(45);
  });

  it('pesa mais com gramatura maior', () => {
    expect(reelWeightT(66_540, 80)).toBeGreaterThan(reelWeightT(66_540, 75));
  });
});

describe('turnos que uma janela toca', () => {
  it('traz um turno quando a janela cabe nele', () => {
    const planos = shiftsInRange(SEED, PLANO.startTick + 60, PLANO.startTick + 120);
    expect(planos).toHaveLength(1);
    expect(planos[0]?.shift.id).toBe(TURNO_B.id);
  });

  it('traz os dois quando a janela atravessa a borda', () => {
    const planos = shiftsInRange(SEED, PLANO.endTick - 60, PLANO.endTick + 60);
    expect(planos).toHaveLength(2);
    expect(planos[1]?.shift.id).not.toBe(planos[0]?.shift.id);
  });

  it('não entra em laço infinito numa janela larga', () => {
    const planos = shiftsInRange(SEED, PLANO.startTick, PLANO.startTick + 40 * TICKS_PER_HOUR);
    expect(planos.length).toBeGreaterThan(4);
    expect(planos.length).toBeLessThanOrEqual(33);
  });
});

describe('número da nota', () => {
  it('é o mesmo para o mesmo alarme, para o upsert não duplicar', () => {
    const quando = '2026-06-15T18:30:00.000Z';
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', quando)).toBe(
      noteNumberFor('MP1-SEC-G4-CS23-MLA', quando),
    );
  });

  it('muda com o ativo e com o instante', () => {
    const quando = '2026-06-15T18:30:00.000Z';
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', quando)).not.toBe(
      noteNumberFor('MP1-SEC-G1-CS01-MLA', quando),
    );
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', quando)).not.toBe(
      noteNumberFor('MP1-SEC-G4-CS23-MLA', '2026-06-15T19:30:00.000Z'),
    );
  });

  it('existe também antes da época da simulação', () => {
    /**
     * Achado ao gerar o gabarito para o back-end Java.
     *
     * A semente grava 72 h de histórico de mancal terminando *agora*. Com
     * "agora" nos três primeiros dias de 2026, parte desse histórico cai antes
     * da época, o minuto sai negativo e o número da nota saía negativo junto —
     * `maintenanceNoteNumber` recusava e a retomada inteira quebrava.
     *
     * Em produção o relógio está meses à frente da época e isso nunca
     * acontecia, o que é justamente o que torna o caso fácil de não ver.
     */
    const antes = '2025-12-29T02:00:00.000Z';
    expect(() => noteNumberFor('MP1-SEC-G4-CS23-MLA', antes)).not.toThrow();
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', antes)).toMatch(/^NM-\d{6}$/);

    // e continua determinístico, que é o que o upsert exige
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', antes)).toBe(
      noteNumberFor('MP1-SEC-G4-CS23-MLA', antes),
    );
  });

  it('tem o formato que a LISTA-BASE pede', () => {
    expect(noteNumberFor('MP1-SEC-G4-CS23-MLA', '2026-06-15T18:30:00.000Z')).toMatch(/^NM-\d{6}$/);
  });
});

describe('notas a partir dos alarmes', () => {
  const alarme = (over: Partial<Alarm> = {}): Alarm => ({
    id: 'AL-1-VI-5123A-HH',
    tag: 'VI-5123A',
    limit: 'HH',
    threshold: 4.5,
    priority: 'alta',
    state: 'ativo',
    raisedAt: '2026-06-15T18:30:00.000Z',
    peakValue: 5.2,
    acknowledgedAt: null,
    acknowledgedBy: null,
    clearedAt: null,
    shelvedUntil: null,
    shelvedBy: null,
    ...over,
  });

  it('abre nota para alarme de mancal de prioridade alta', () => {
    const notas = notesFromAlarms([alarme()], null);

    expect(notas).toHaveLength(1);
    expect(notas[0]?.assetTag).toBe('MP1-SEC-G4-CS23-MLA');
    expect(notas[0]?.origin).toBe('alarme');
    expect(notas[0]?.originRef).toBe('AL-1-VI-5123A-HH');
    expect(notas[0]?.symptom).toMatch(/vibração/);
  });

  it('não abre nota para alarme que não é de mancal', () => {
    expect(notesFromAlarms([alarme({ tag: 'AIC-903', limit: 'H' })], null)).toEqual([]);
  });

  it('não abre nota para prioridade média ou baixa', () => {
    expect(notesFromAlarms([alarme({ priority: 'média' })], null)).toEqual([]);
  });

  it('exige parada só na prioridade crítica', () => {
    expect(notesFromAlarms([alarme()], null)[0]?.requiresShutdown).toBe(false);
    expect(notesFromAlarms([alarme({ priority: 'crítica' })], null)[0]?.requiresShutdown).toBe(
      true,
    );
  });

  it('nomeia a medição certa no sintoma', () => {
    expect(notesFromAlarms([alarme({ tag: 'VE-5123A' })], null)[0]?.symptom).toMatch(/envelope/);
    expect(notesFromAlarms([alarme({ tag: 'TI-5323A' })], null)[0]?.symptom).toMatch(/temperatura/);
  });

  it('liga a ronda à evidência quando há ronda', () => {
    const comRonda = notesFromAlarms([alarme()], 'RD-123')[0];
    expect(comRonda?.evidence.some((e) => e.kind === 'ronda')).toBe(true);

    const semRonda = notesFromAlarms([alarme()], null)[0];
    expect(semRonda?.evidence.some((e) => e.kind === 'ronda')).toBe(false);
  });

  it('não repete nota do mesmo mancal no mesmo minuto', () => {
    const notas = notesFromAlarms(
      [alarme(), alarme({ id: 'AL-2-VE-5123A-HH', tag: 'VE-5123A' })],
      null,
    );
    expect(notas).toHaveLength(1);
  });

  it('respeita as regras de consistência da entidade', () => {
    for (const nota of notesFromAlarms([alarme()], 'RD-123')) {
      expect(noteStatusIsConsistent(nota)).toBe(true);
      expect(noteOriginIsConsistent(nota)).toBe(true);
    }
  });
});

describe('colheita de ponta a ponta', () => {
  let db: Database;
  let sql: SqlExecutor;

  beforeAll(async () => {
    ({ db, sql } = await driver.openWithSql());
    await db.migrate();
  }, LENTO);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await clearOperations(sql);
    await sql.exec('delete from historian_point');
    await sql.exec('delete from sim_state');
    await db.replaceAssets(allAssets(MP1));
    await db.replaceHistorianPoints(HISTORIAN_POINTS);
  });

  /**
   * Uma retomada que cobre o começo do turno B e a troca de gramatura.
   *
   * Quatro horas é exatamente o teto da retomada, e o plano põe a troca três
   * horas depois do começo do turno. Então a janela contém o começo do turno,
   * quatro bobinas, a ronda, a transição inteira e o fechamento da bobina que
   * pegou a transição — que é o que faz o teste do rebaixamento ter o que ver.
   */
  const FIM = tickTime(PLANO.startTick + 4 * TICKS_PER_HOUR);

  it(
    'colhe turno, bobinas, troca, ronda e auditoria',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });

      const report = await catchUp(db, { seed: SEED, now: FIM });

      expect(report.entities.shifts).toBeGreaterThanOrEqual(1);
      expect(report.entities.reels).toBeGreaterThanOrEqual(3);
      expect(report.entities.rounds).toBe(1);
      expect(report.entities.gradeChanges).toBe(1);
    },
    LENTO,
  );

  it(
    'grava o turno com produção e eficiência plausíveis',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const turno = await db.findShift(TURNO_B.id);
      expect(turno).not.toBeNull();
      expect(turno?.operator).toBe('turno B');
      // 45 t/h nominal × 4 h = 180 t
      expect(turno?.productionT).toBeGreaterThan(140);
      expect(turno?.productionT).toBeLessThan(220);
      expect(turno?.efficiencyPct).toBeGreaterThan(80);
      expect(turno?.efficiencyPct).toBeLessThanOrEqual(100);
      // o turno não terminou: não tem fim
      expect(turno?.endedAt).toBeNull();
    },
    LENTO,
  );

  it(
    'fecha as bobinas com médias vindas do arquivo',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const bobinas = await db.listReels({ shiftId: TURNO_B.id });
      const fechadas = bobinas.filter((reel) => reel.endedAt !== null);

      expect(fechadas.length).toBeGreaterThanOrEqual(3);

      for (const bobina of fechadas) {
        expect(bobina.basisWeightGsm).not.toBeNull();
        expect(bobina.basisWeightGsm ?? 0).toBeGreaterThan(60);
        expect(bobina.basisWeightGsm ?? 0).toBeLessThan(100);
        expect(bobina.weightT ?? 0).toBeGreaterThan(20);
        expect(bobina.lengthM ?? 0).toBeGreaterThan(50_000);
        expect(bobina.finalDiameterMm).toBe(3000);
        expect(bobina.cdSpread).not.toBeNull();
        expect(reelDispositionIsConsistent(bobina)).toBe(true);
      }

      // a bobina em andamento não tem média nem destino
      const aberta = bobinas.find((reel) => reel.endedAt === null);
      expect(aberta?.basisWeightGsm).toBeNull();
      expect(aberta?.disposition).toBeNull();
    },
    LENTO,
  );

  /**
   * A bobina que pega a transição é rebaixada, e diz por quê.
   *
   * É o encontro de duas entidades: a troca de gramatura aponta a bobina
   * afetada, e a bobina afetada carrega o motivo.
   */
  it(
    'rebaixa a bobina que pegou a troca de gramatura',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const troca = (await db.listGradeChanges())[0];
      expect(troca).toBeDefined();
      expect(troca?.stabilizedAt).not.toBeNull();
      expect(troca?.affectedReels.length).toBeGreaterThan(0);

      // entre as afetadas, a que já fechou tem de estar rebaixada e dizer por quê
      const afetadas = await Promise.all(
        (troca?.affectedReels ?? []).map((number) => db.findReel(number)),
      );
      const fechada = afetadas.find((reel) => reel?.endedAt !== null && reel !== null);

      expect(fechada, 'nenhuma bobina afetada fechou dentro da janela').toBeDefined();
      expect(fechada?.disposition).toBe('rebaixada');
      expect(fechada?.dispositionReason).toMatch(/transição de gramatura|tolerância/);
    },
    LENTO,
  );

  it(
    'registra a auditoria da troca de setpoint',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const escritas = await db.listSetpointChanges({ tag: 'AIC-902' });
      expect(escritas).toHaveLength(1);
      expect(escritas[0]?.previousValue).toBe(PLANO.gradeChange?.fromGsm);
      expect(escritas[0]?.newValue).toBe(PLANO.gradeChange?.toGsm);
      expect(escritas[0]?.reason).toMatch(/troca de gramatura/);
    },
    LENTO,
  );

  it(
    'grava a ronda com o valor de campo ao lado do online',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const rondas = await db.listRounds({ shiftId: TURNO_B.id });
      expect(rondas).toHaveLength(1);

      const ronda = rondas[0];
      expect(ronda?.points.length).toBeGreaterThanOrEqual(5);
      expect(ronda?.inspector).toBe('turno B');

      for (const ponto of ronda?.points ?? []) {
        expect(ponto.onlineTag).toMatch(/^TI-53\d{2}[AB]$/);
        expect(ponto.onlineValue).not.toBeNull();
        expect(ponto.fieldTempC).not.toBeNull();
        // o pirômetro lê a carcaça por fora, mais fria que o sensor
        expect(ponto.fieldTempC ?? 0).toBeLessThan(ponto.onlineValue ?? 0);
      }
    },
    LENTO,
  );

  it(
    'é idempotente: reexecutar não duplica entidade',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const antes = {
        bobinas: (await db.listReels({ limit: 1000 })).length,
        trocas: (await db.listGradeChanges({ limit: 1000 })).length,
        rondas: (await db.listRounds({ limit: 1000 })).length,
        escritas: (await db.listSetpointChanges({ limit: 1000 })).length,
      };

      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      expect({
        bobinas: (await db.listReels({ limit: 1000 })).length,
        trocas: (await db.listGradeChanges({ limit: 1000 })).length,
        rondas: (await db.listRounds({ limit: 1000 })).length,
        escritas: (await db.listSetpointChanges({ limit: 1000 })).length,
      }).toEqual(antes);
    },
    LENTO,
  );

  /**
   * Os sinais da quebra são lidos do arquivo, não escritos à mão.
   *
   * O cenário perturbou uma malha dez minutos antes; o processo respondeu; e os
   * precursores são a resposta. Se a rede de relações mudar, os sinais mudam com
   * ela — é a diferença entre um gêmeo digital e uma animação.
   */
  it(
    'lê os sinais anteriores de uma quebra do próprio arquivo',
    async () => {
      // procura um dia cuja quebra caia no turno B, para a janela conter tudo
      let plano = PLANO;
      let dia = new Date('2026-06-15T18:00:00Z');
      for (let k = 0; k < 10 && !plano.webBreak; k += 1) {
        dia = new Date(dia.getTime() + 86_400_000);
        plano = shiftPlan(SEED, shiftWindowAt(dia));
      }

      const quebra = plano.webBreak;
      expect(quebra, 'nenhum turno B com quebra em dez dias').toBeDefined();
      if (!quebra) return;

      const inicio = quebra.upsetTick - 5 * 60;
      const fim = tickTime(quebra.startTick + 60);

      await db.saveSimState({ seed: SEED, lastTick: inicio, updatedAt: tickTime(inicio) });
      await catchUp(db, { seed: SEED, now: fim });

      const quebras = await db.listWebBreaks({ limit: 10 });
      expect(quebras).toHaveLength(1);

      const registrada = quebras[0];
      expect(registrada?.section).toBe(quebra.section);
      expect(registrada?.probableCause).toBe(quebra.probableCause);
      expect(registrada?.precursors.length).toBeGreaterThan(0);
      expect(precursorsAreWithinWindow(registrada!)).toBe(true);

      // a malha perturbada tem de estar entre os sinais
      expect(registrada?.precursors.map((p) => p.tag)).toContain(quebra.upsetTag);

      for (const sinal of registrada?.precursors ?? []) {
        expect(sinal.leadTimeS).toBeGreaterThanOrEqual(0);
        expect(sinal.leadTimeS).toBeLessThanOrEqual(PRECURSOR_WINDOW_S);
        expect(sinal.description.trim()).not.toBe('');
        expect(Math.abs(sinal.valueAtSignal - sinal.valueBefore)).toBeGreaterThan(0);
      }
    },
    LENTO,
  );

  it(
    'põe na passagem do turno o que aconteceu nele',
    async () => {
      await db.saveSimState({
        seed: SEED,
        lastTick: PLANO.startTick,
        updatedAt: tickTime(PLANO.startTick),
      });
      await catchUp(db, { seed: SEED, now: FIM });

      const turno = await db.findShift(TURNO_B.id);
      expect(turno?.handover.length).toBeGreaterThan(0);
      expect(turno?.handover.join(' ')).toMatch(/gramatura/);
    },
    LENTO,
  );
});
