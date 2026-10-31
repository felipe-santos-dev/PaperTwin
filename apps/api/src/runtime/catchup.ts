import {
  DRYER_BEARING_TAGS,
  HISTORIAN_POINTS,
  rawCutoff,
  type Alarm,
  type PointArchivedSample,
  type PointSample,
} from '@mp1/shared';

import type { Database } from '../db';
import { alarmEngine, type AlarmEngine } from '../simulation/alarm-engine';
import { bearingSampleAt, type DegradationScenario } from '../simulation/bearings';
import {
  catchupRange,
  DEFAULT_SEED,
  MAX_CATCHUP_TICKS,
  tickAt,
  tickTime,
  TICKS_PER_HOUR,
} from '../simulation/clock';
import { processEngine, type EngineState, type ProcessEngine } from '../simulation/process-engine';
import { gradeInEffectAt, planAt, type BreakPlan, type ShiftPlan } from '../simulation/scenarios';
import { harvestEntities, persistHarvest } from './entities';
import { HISTORIAN_SCAN_TICKS, historianRecorder, type RecorderStats } from './recorder';

/**
 * A retomada: o que roda quando a API acorda.
 *
 * Não existe processo de fundo. O host gratuito dorme sem tráfego, e quem
 * acorda a API é quem abriu a tela — então a simulação não é um laço que roda
 * sempre, é um trabalho que acontece **dentro de uma requisição**, reexecutando
 * o intervalo que faltou desde a última vez.
 *
 * Isso só é possível porque a simulação é determinística a partir de (semente,
 * passo): o relógio é uma grade ancorada num instante absoluto, o ruído é
 * função da posição e nenhum estágio guarda estado que dependa de onde a
 * execução começou. Reexecutar dá o mesmo que ter rodado contínuo, dentro do
 * teto de quatro horas que `MAX_CATCHUP_TICKS` documenta.
 *
 * ## A ordem dentro de um passo
 *
 * 1. os eventos do plano do turno entram (troca de gramatura, perturbação que
 *    precede a quebra);
 * 2. o motor de processo avança;
 * 3. de cinco em cinco passos, o historiador varre e os alarmes são avaliados.
 *
 * Os eventos entram **antes** do passo, e não depois, porque um setpoint escrito
 * depois de avançar só teria efeito no passo seguinte — e aí o instante
 * registrado na entidade não seria o instante em que o processo começou a se
 * mexer.
 */

/** O mancal que degrada, o mesmo do conceito de tela de monitoramento. */
export const DEGRADING_BEARING = 'MP1-SEC-G4-CS23-MLA';

/**
 * Quanto tempo a degradação do mancal leva, em horas.
 *
 * **Suposição.** 72 h é a janela da tela de tendência, e é o que faz a subida
 * caber inteira no gráfico que alguém vai olhar. Um defeito de rolamento de
 * verdade leva semanas; três dias é a escolha de apresentação, e está dita aqui
 * em vez de passar por propriedade do mancal.
 */
export const DEGRADATION_HOURS = 72;

/** Quantas linhas vão ao banco por ida. */
const WRITE_CHUNK = 5000;

export interface CatchupOptions {
  readonly seed?: number;
  /** O instante até onde simular. O padrão é agora. */
  readonly now?: Date;
  /** Passos entre varreduras do historiador. O padrão é `HISTORIAN_SCAN_TICKS`. */
  readonly scanTicks?: number;
}

export interface CatchupReport {
  readonly seed: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: number;
  /** `true` quando o intervalo passou do teto e o início foi cortado. */
  readonly reanchored: boolean;
  /** `true` quando a semente guardada era outra. */
  readonly seedChanged: boolean;
  /** `true` quando a rede continuou do estado gravado, sem reancorar. */
  readonly resumedFromState: boolean;
  readonly scans: number;
  readonly archived: number;
  readonly raw: number;
  readonly alarmsRaised: number;
  readonly alarmsCleared: number;
  /** Entidades de operação colhidas do arquivo depois de gravá-lo. */
  readonly entities: {
    readonly shifts: number;
    readonly reels: number;
    readonly gradeChanges: number;
    readonly webBreaks: number;
    readonly rounds: number;
    readonly notes: number;
  };
  readonly compression: RecorderStats;
  readonly durationMs: number;
}

/** O que a simulação produziu e ainda não foi gravado. */
interface Pending {
  archive: PointArchivedSample[];
  raw: PointSample[];
  alarms: Map<string, Alarm>;
}

async function writeArchive(db: Database, rows: readonly PointArchivedSample[]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await db.insertArchiveSamples(rows.slice(i, i + WRITE_CHUNK));
  }
}

async function writeRaw(db: Database, rows: readonly PointSample[]): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await db.insertRawSamples(rows.slice(i, i + WRITE_CHUNK));
  }
}

/**
 * O cenário de degradação do mancal, ancorado no instante pedido.
 *
 * A janela termina **agora** e começa `DEGRADATION_HOURS` antes, o que põe o
 * mancal em zona D no presente — é a mesma escolha da Fase 3, e é de
 * apresentação: o gêmeo precisa ter o que mostrar a quem abre a tela hoje.
 */
export function degradationScenarioAt(now: Date): DegradationScenario {
  const toTick = tickAt(now);
  return {
    assetTag: DEGRADING_BEARING,
    fromTick: toTick - DEGRADATION_HOURS * TICKS_PER_HOUR,
    toTick,
  };
}

/**
 * Os valores dos mancais num passo, nas tags do catálogo.
 *
 * O motor de processo não cuida dos mancais: ele para na área `mancais` do
 * catálogo de propósito, porque a dinâmica de um defeito de rolamento não é a
 * de uma malha de controle. Aqui as duas metades se juntam, pela ponte de tags.
 */
export function bearingValuesAt(
  seed: number,
  tick: number,
  scenario: DegradationScenario,
): Map<string, number> {
  const values = new Map<string, number>();

  for (const bearing of DRYER_BEARING_TAGS) {
    const sample = bearingSampleAt(seed, tick, bearing.assetTag, scenario);
    values.set(bearing.vibration, sample.rmsMmS);
    values.set(bearing.envelope, sample.envelopeGe);
    values.set(bearing.temperature, sample.tempC);
  }

  return values;
}

/** Aplica os eventos do plano que caem neste passo. */
function applyPlan(engine: ProcessEngine, plan: ShiftPlan, tick: number): void {
  if (plan.gradeChange?.startTick === tick) {
    engine.setSetpoint('AIC-902', plan.gradeChange.toGsm);
  }

  const quebra: BreakPlan | null = plan.webBreak;
  if (!quebra) return;

  // a perturbação entra 10 min antes da quebra e volta quando a folha volta
  if (quebra.upsetTick === tick) {
    engine.setSetpoint(quebra.upsetTag, quebra.upsetSetpoint);
  }
  // a folha volta: a malha perturbada é devolvida ao ponto de operação
  if (quebra.endTick === tick) engine.resetSetpoint(quebra.upsetTag);
}

/**
 * Roda o intervalo que faltou e grava.
 *
 * Devolve um relatório, e não `void`: quem chama precisa poder dizer no log e
 * no `/health` quanto foi reexecutado, qual foi a taxa de compressão medida e se
 * houve reancoragem. São os números que dizem se o desenho está aguentando.
 */
export async function catchUp(db: Database, options: CatchupOptions = {}): Promise<CatchupReport> {
  const started = performance.now();

  const seed = options.seed ?? DEFAULT_SEED;
  const now = options.now ?? new Date();
  const scanTicks = options.scanTicks ?? HISTORIAN_SCAN_TICKS;

  const saved = await db.findSimState();
  const seedChanged = saved !== null && saved.seed !== seed;
  const fromSaved = saved === null || seedChanged ? null : saved.lastTick;

  const range = catchupRange(fromSaved, now);

  /**
   * O estado gravado só serve se a retomada continuar exatamente de onde ele
   * é.
   *
   * Quando o intervalo passa do teto, `catchupRange` corta o início, e o estado
   * gravado passa a ser de um passo que a execução nem vai visitar — retomar
   * dele seria saltar horas de processo sem dizer. Aí a rede arranca em regime,
   * que é o que `reanchored` significa.
   */
  const restored =
    !range.reanchored && saved !== null && !seedChanged && saved.state !== null
      ? (saved.state as EngineState)
      : undefined;

  if (range.ticks === 0) {
    return {
      seed,
      fromTick: range.fromTick,
      toTick: range.toTick,
      ticks: 0,
      reanchored: false,
      seedChanged,
      resumedFromState: false,
      scans: 0,
      archived: 0,
      raw: 0,
      alarmsRaised: 0,
      alarmsCleared: 0,
      entities: {
        shifts: 0,
        reels: 0,
        gradeChanges: 0,
        webBreaks: 0,
        rounds: 0,
        notes: 0,
      },
      compression: { fed: 0, afterException: 0, archived: 0, raw: 0, ratio: 0 },
      durationMs: performance.now() - started,
    };
  }

  const engine = processEngine(range.fromTick, {
    seed,
    // a gramatura que está valendo, e não o alvo do catálogo: a troca é evento,
    // e um evento só move o processo se ele estiver no estado de antes dele.
    // Com estado gravado isto é redundante, porque o setpoint vem de lá — mas
    // é o que faz a reancoragem começar na gramatura certa.
    ...(restored ? {} : { setpoints: { 'AIC-902': gradeInEffectAt(range.fromTick) } }),
    ...(restored ? { state: restored } : {}),
  });
  const alarms: AlarmEngine = alarmEngine(await db.listAlarms({ limit: 1000 }));
  // o bruto só é coletado dentro da própria retenção dele: coletar quatro horas
  // para a poda apagar três e quarenta e cinco é trabalho e tráfego de banco
  // por nada
  const recorder = historianRecorder({ rawFrom: rawCutoff(now).getTime() });
  const scenario = degradationScenarioAt(now);

  const pending: Pending = { archive: [], raw: [], alarms: new Map() };
  let scans = 0;
  let raised = 0;
  let cleared = 0;

  let plan = planAt(seed, range.fromTick);

  for (let tick = range.fromTick + 1; tick <= range.toTick; tick += 1) {
    if (tick >= plan.endTick) plan = planAt(seed, tick);

    applyPlan(engine, plan, tick);
    engine.advance();

    /**
     * A varredura é ancorada na grade absoluta, não no início da retomada.
     *
     * Com `(tick - fromTick) % scanTicks`, duas retomadas que começassem em
     * passos diferentes varreriam instantes diferentes, e o `on conflict do
     * nothing` das amostras não reconheceria as repetições: um trecho
     * reexecutado entraria duas vezes no arquivo, deslocado em um ou dois
     * segundos. Com `tick % scanTicks`, o mesmo instante é sempre o mesmo
     * instante.
     */
    if (tick % scanTicks !== 0) continue;

    const values = engine.snapshot();
    for (const [tag, value] of bearingValuesAt(seed, tick, scenario)) {
      values.set(tag, value);
    }

    recorder.feed(tick, values);
    scans += 1;

    const scan = alarms.scan(values, tickTime(tick));
    for (const alarm of [...scan.raised, ...scan.cleared, ...scan.updated]) {
      pending.alarms.set(alarm.id, alarm);
    }
    raised += scan.raised.length;
    cleared += scan.cleared.length;

    const batch = recorder.drain();
    pending.archive.push(...batch.archive);
    pending.raw.push(...batch.raw);
  }

  pending.archive.push(...recorder.flush());

  // a semeadura dos pontos precisa estar feita antes das amostras; chamar aqui
  // é inócuo quando já está, e evita que uma retomada no primeiro arranque
  // falhe por chave estrangeira
  if ((await db.historianUsage()).points === 0) {
    await db.replaceHistorianPoints(HISTORIAN_POINTS);
  }

  await writeArchive(db, pending.archive);
  await writeRaw(db, pending.raw);
  if (pending.alarms.size > 0) await db.upsertAlarms([...pending.alarms.values()]);

  /**
   * As entidades são colhidas **depois** de o arquivo estar gravado.
   *
   * A gramatura média de uma bobina é uma consulta ao historiador, não um
   * acumulador em memória — colher antes de gravar daria bobinas sem gramatura.
   * E colher antes de podar: a poda corta pelo tempo, e uma bobina que acabou
   * de fechar está dentro da retenção de todo jeito.
   */
  const harvest = await harvestEntities(db, seed, range.fromTick, range.toTick, [
    ...pending.alarms.values(),
  ]);
  await persistHarvest(db, harvest);

  await db.pruneHistorian(now);
  await db.saveSimState({
    seed,
    lastTick: range.toTick,
    state: engine.snapshotState(),
    updatedAt: now,
  });

  return {
    seed,
    fromTick: range.fromTick,
    toTick: range.toTick,
    ticks: range.ticks,
    reanchored: range.reanchored,
    seedChanged,
    resumedFromState: restored !== undefined,
    scans,
    archived: pending.archive.length,
    raw: pending.raw.length,
    alarmsRaised: raised,
    alarmsCleared: cleared,
    entities: {
      shifts: harvest.shifts.length,
      reels: harvest.reels.length,
      gradeChanges: harvest.gradeChanges.length,
      webBreaks: harvest.webBreaks.length,
      rounds: harvest.rounds.length,
      notes: harvest.notes.length,
    },
    compression: recorder.stats(),
    durationMs: performance.now() - started,
  };
}

/** O teto da retomada em horas, para quem precisa explicar o buraco. */
export const MAX_CATCHUP_HOURS = MAX_CATCHUP_TICKS / TICKS_PER_HOUR;
