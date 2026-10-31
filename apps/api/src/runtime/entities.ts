import {
  bearingTagsOf,
  classifyIsoZone,
  DRYER_BEARING_TAGS,
  DRYER_BEARING_ISO,
  historianPoint,
  isoLimitsOf,
  maintenanceNoteNumber,
  processVariable,
  shiftWindowAt,
  WEB_WIDTH_M,
  type Alarm,
  type BreakPrecursor,
  type GradeChange,
  type JumboReel,
  type LeakState,
  type MaintenanceNote,
  type NoiseLevel,
  type Round,
  type RoundPoint,
  type SetpointChange,
  type ShiftWindow,
  type WebBreak,
} from '@mp1/shared';

import type { Database } from '../db';
import type { StoredShift } from '../db/operations-queries';
import { SIM_EPOCH_MS, tickAt, tickTime } from '../simulation/clock';
import { unitNoise, streamOf } from '../simulation/noise';
import {
  nominalShiftProductionT,
  reelDiameterMm,
  reelWoundM,
  shiftPlan,
  UPSET_LEAD_S,
  type ShiftPlan,
} from '../simulation/scenarios';

/**
 * As entidades de operação, **derivadas do arquivo**.
 *
 * Esta é a decisão que define o módulo. A primeira versão acumulava médias em
 * memória ao longo dos passos, e isso não sobrevive ao desenho: uma bobina leva
 * 53 min e uma retomada pode ser de dez, então a bobina atravessa o corte e
 * nenhuma das duas execuções vê o todo. Acumuladores em memória teriam de ser
 * gravados também, e aí seriam uma segunda cópia do historiador.
 *
 * Agora a conta é a mesma que um sistema de verdade faz: **a gramatura média de
 * uma bobina é uma consulta ao historiador**, pela janela da bobina. O
 * historiador é o registro, e as entidades são leituras dele. Isso sai de graça
 * em idempotência — reexecutar um trecho recalcula as mesmas entidades, com os
 * mesmos ids — e tira um estado inteiro do caminho.
 *
 * ## Os ids são determinísticos
 *
 * Bobina pelo número, que vem da grade de passos; turno pelo dia e pela letra;
 * quebra, troca e ronda pelo passo em que começaram. Nada é sorteado, então o
 * `upsert` do repositório transforma uma reexecução em nada.
 */

/** O operador responsável, pela letra do turno. */
function operatorOf(shift: ShiftWindow): string {
  return `turno ${shift.letter}`;
}

/** A média de um ponto numa janela, ou `null` se não houver dado. */
async function averageOfTag(
  db: Database,
  tag: string,
  from: Date,
  to: Date,
): Promise<number | null> {
  const point = historianPoint(tag);
  if (!point) return null;
  return db.averageOf(point.pointId, from, to);
}

/** O valor de um ponto num instante, ou `null`. */
async function valueOfTag(db: Database, tag: string, at: Date): Promise<number | null> {
  const point = historianPoint(tag);
  if (!point) return null;
  return (await db.valueAt(point.pointId, at))?.v ?? null;
}

const round2 = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(2));

// ------------------------------------------------------------ bobina jumbo

/**
 * Peso da bobina, pela área de papel enrolada.
 *
 * `comprimento × largura × gramatura`, com a gramatura **medida** no período da
 * bobina e não o alvo: uma bobina enrolada durante uma troca de gramatura não
 * pesa o que o alvo diz. Dá ~40 t numa bobina de 75 g/m², que é o porte de uma
 * jumbo de máquina de embalagem.
 */
export function reelWeightT(lengthM: number, basisWeightGsm: number): number {
  return (lengthM * WEB_WIDTH_M * basisWeightGsm) / 1e6;
}

/** Tolerância da gramatura, do catálogo: metade da faixa entre `L` e `H`. */
function basisWeightTolerance(): number {
  const variable = processVariable('AIC-902');
  const low = variable?.limits.l;
  const high = variable?.limits.h;
  if (low === null || low === undefined || high === null || high === undefined) return 1.5;
  return (high - low) / 2;
}

interface ReelContext {
  readonly breaksInside: number;
  readonly gradeChangeInside: boolean;
}

async function buildReel(
  db: Database,
  shiftId: string,
  number: number,
  startTick: number,
  endTick: number,
  closed: boolean,
  context: ReelContext,
): Promise<JumboReel> {
  const from = tickTime(startTick);
  const to = tickTime(endTick);

  if (!closed) {
    return {
      number,
      shiftId,
      startedAt: from.toISOString(),
      endedAt: null,
      weightT: null,
      lengthM: null,
      finalDiameterMm: null,
      basisWeightGsm: null,
      moisturePct: null,
      caliperUm: null,
      cdSpread: null,
      splices: context.breaksInside,
      disposition: null,
      dispositionReason: null,
    };
  }

  const [basisWeight, moisture, caliper, cdBasis, cdMoisture, cdCaliper] = await Promise.all([
    averageOfTag(db, 'AIC-902', from, to),
    averageOfTag(db, 'AIC-903', from, to),
    averageOfTag(db, 'AIC-905', from, to),
    averageOfTag(db, 'AI-912', from, to),
    averageOfTag(db, 'AI-913', from, to),
    averageOfTag(db, 'AI-915', from, to),
  ]);

  const lengthM = reelWoundM(endTick, { number, startTick, endTick });
  const weightT = basisWeight === null ? null : reelWeightT(lengthM, basisWeight);

  /**
   * O destino sai do que aconteceu, não de um sorteio.
   *
   * Uma bobina que pegou uma quebra tem emenda e vai rebaixada; uma que pegou
   * uma troca de gramatura tem papel fora da especificação no meio. Fora disso,
   * a gramatura média fora da tolerância do catálogo também rebaixa. Nada disso
   * é opinião — são as três razões que a LISTA-BASE pede que a bobina diga.
   */
  const reasons: string[] = [];
  if (context.breaksInside > 0) {
    reasons.push(
      context.breaksInside === 1
        ? 'emenda de quebra de folha'
        : `${String(context.breaksInside)} emendas de quebra de folha`,
    );
  }
  if (context.gradeChangeInside) reasons.push('papel de transição de gramatura');
  if (
    basisWeight !== null &&
    Math.abs(basisWeight - (processVariable('AIC-902')?.target ?? 75)) > basisWeightTolerance()
  ) {
    reasons.push(`gramatura média em ${basisWeight.toFixed(1)} g/m², fora da tolerância`);
  }

  return {
    number,
    shiftId,
    startedAt: from.toISOString(),
    endedAt: to.toISOString(),
    weightT: round2(weightT),
    lengthM: Math.round(lengthM),
    finalDiameterMm: Math.round(reelDiameterMm(endTick, { number, startTick, endTick })),
    basisWeightGsm: round2(basisWeight),
    moisturePct: round2(moisture),
    caliperUm: round2(caliper),
    cdSpread:
      cdBasis === null || cdMoisture === null || cdCaliper === null
        ? null
        : {
            basisWeightGsm: cdBasis,
            moisturePct: cdMoisture,
            caliperUm: cdCaliper,
          },
    splices: context.breaksInside,
    disposition: reasons.length === 0 ? 'aprovada' : 'rebaixada',
    dispositionReason: reasons.length === 0 ? null : reasons.join('; '),
  };
}

// --------------------------------------------------------- quebra de folha

/**
 * As tags que a investigação de uma quebra olha.
 *
 * A malha perturbada entra sempre; as outras são o caminho por onde o efeito
 * desce até a folha. Só vale a pena olhar o que é ponto do historiador, porque é
 * de lá que os sinais são lidos.
 */
const DIAGNOSTIC_TAGS: readonly string[] = ['AIC-903', 'AIC-901', 'AI-407', 'SDIC-703', 'AIC-902'];

/**
 * Quantos desvios de exceção um sinal precisa andar para contar como precursor.
 *
 * **Suposição**, e com razão: o `excDev` é a banda em que o instrumento
 * tremelica, então três vezes ela é movimento que não é ruído. Um limiar
 * absoluto não serviria — a mesma régua teria de valer para umidade em % e
 * pressão em kPa.
 */
const PRECURSOR_SIGMAS = 3;

/** Descreve em português o que a tag fez. */
function describeMove(tag: string, before: number, at: number, leadS: number): string {
  const unit = processVariable(tag)?.unit ?? '';
  const delta = at - before;
  const direction = delta >= 0 ? 'subiu' : 'caiu';
  const minutes = Math.round(leadS / 60);

  return (
    `${direction} ${Math.abs(delta).toFixed(2)} ${unit} nos ${String(minutes)} min ` +
    'antes da quebra'
  );
}

/**
 * Os sinais dos 10 min anteriores, **lidos do arquivo**.
 *
 * Nada aqui é escrito à mão: o cenário perturbou uma malha e o processo
 * respondeu, e isto lê a resposta. É a diferença entre um gêmeo digital e uma
 * animação — se a rede de relações mudar, os sinais mudam com ela.
 */
async function precursorsOf(
  db: Database,
  upsetTag: string,
  breakTick: number,
): Promise<BreakPrecursor[]> {
  const breakAt = tickTime(breakTick);
  const from = tickTime(breakTick - UPSET_LEAD_S);

  const tags = [upsetTag, ...DIAGNOSTIC_TAGS.filter((tag) => tag !== upsetTag)];
  const found: BreakPrecursor[] = [];

  for (const tag of tags) {
    const point = historianPoint(tag);
    if (!point) continue;

    const threshold = (processVariable(tag)?.compression.excDev ?? 0) * PRECURSOR_SIGMAS;
    if (threshold <= 0) continue;

    const valueBefore = (await db.valueAt(point.pointId, from))?.v ?? null;
    if (valueBefore === null) continue;

    const samples = await db.archivedSamples({ pointId: point.pointId, from, to: breakAt });
    if (samples.length === 0) continue;

    // o instante em que o sinal passou do limiar pela primeira vez
    const crossed = samples.find((sample) => Math.abs(sample.v - valueBefore) > threshold);
    if (!crossed) continue;

    const leadTimeS = Math.round((breakAt.getTime() - crossed.t) / 1000);

    found.push({
      tag,
      description: describeMove(tag, valueBefore, crossed.v, leadTimeS),
      leadTimeS,
      valueBefore: Number(valueBefore.toFixed(3)),
      valueAtSignal: Number(crossed.v.toFixed(3)),
    });
  }

  // do mais antigo para o mais recente, que é como a tela desenha a linha do
  // tempo e como a restrição da tabela exige
  return found.sort((a, b) => b.leadTimeS - a.leadTimeS);
}

// ----------------------------------------------------------------- ronda

/**
 * O roteiro da ronda.
 *
 * Seis pontos: o mancal que o conceito de tela acompanha e cinco vizinhos do
 * mesmo grupo. **Suposição** — a ronda de verdade segue um roteiro da planta, e
 * este é escolhido para a tela de Rondas ter o que mostrar sem percorrer os 72
 * mancais da secagem.
 */
const ROUND_ROUTE: readonly string[] = [
  'MP1-SEC-G4-CS23-MLA',
  'MP1-SEC-G4-CS23-MLC',
  'MP1-SEC-G4-CS19-MLA',
  'MP1-SEC-G4-CS26-MLC',
  'MP1-SEC-G1-CS01-MLA',
  'MP1-SEC-G6-CS36-MLC',
];

/**
 * Quanto o pirômetro de campo lê abaixo do sensor do mancal, em °C.
 *
 * **Suposição.** O sensor está dentro da caixa e o pirômetro mede a carcaça por
 * fora, que é mais fria. Três graus é a diferença adotada, e é o que faz a
 * coluna "campo × online" da tela mostrar uma diferença pequena e constante em
 * operação normal — de modo que uma diferença grande signifique alguma coisa.
 */
const FIELD_PYROMETER_OFFSET_C = 3;

/** O que a ronda percebe num ponto, pela zona da vibração. */
function perceptionOf(
  rms: number | null,
  seed: number,
  tick: number,
  assetTag: string,
): { noise: NoiseLevel; leak: LeakState } {
  const zone = rms === null ? null : classifyIsoZone(rms, isoLimitsOf(DRYER_BEARING_ISO));
  const stream = streamOf(assetTag);

  const noise: NoiseLevel = zone === 'D' ? 'anormal' : zone === 'C' ? 'elevado' : 'normal';

  // vazamento é independente da vibração: um selo pinga sem o mancal vibrar
  const draw = unitNoise(seed, tick, stream, 7);
  const leak: LeakState = draw > 0.92 ? 'gotejamento' : draw > 0.99 ? 'jato' : 'nenhum';

  return { noise, leak };
}

async function buildRound(
  db: Database,
  seed: number,
  shiftId: string,
  plan: ShiftPlan,
): Promise<Round> {
  const at = tickTime(plan.round.endTick);
  const points: RoundPoint[] = [];

  for (const assetTag of ROUND_ROUTE) {
    const tags = bearingTagsOf(assetTag);
    if (!tags) continue;

    const [rms, bearingTemp] = await Promise.all([
      valueOfTag(db, tags.vibration, at),
      valueOfTag(db, tags.temperature, at),
    ]);

    const { noise, leak } = perceptionOf(rms, seed, plan.round.endTick, assetTag);
    const jitter = (unitNoise(seed, plan.round.endTick, streamOf(assetTag), 8) - 0.5) * 2;

    points.push({
      assetTag,
      fieldTempC:
        bearingTemp === null
          ? null
          : Number((bearingTemp - FIELD_PYROMETER_OFFSET_C + jitter).toFixed(1)),
      noise,
      leak,
      note:
        noise === 'normal' && leak === 'nenhum'
          ? null
          : [
              noise === 'anormal' ? 'ruído anormal, zunido constante' : null,
              noise === 'elevado' ? 'ruído acima do normal' : null,
              leak !== 'nenhum' ? `vazamento: ${leak}` : null,
            ]
              .filter((part) => part !== null)
              .join('; '),
      onlineTag: bearingTemp === null ? null : tags.temperature,
      onlineValue: bearingTemp === null ? null : Number(bearingTemp.toFixed(1)),
    });
  }

  return {
    id: `RD-${String(plan.round.startTick)}`,
    shiftId,
    startedAt: tickTime(plan.round.startTick).toISOString(),
    finishedAt: at.toISOString(),
    inspector: operatorOf(plan.shift),
    points,
  };
}

// ---------------------------------------------------- nota de manutenção

/**
 * O número da nota é simulado, e derivado do instante e do ativo.
 *
 * A LISTA-BASE já diz que o número é simulado. Derivá-lo em vez de contar numa
 * sequência é o que mantém a idempotência: reexecutar um trecho recria a mesma
 * nota com o mesmo número, e o `upsert` não duplica. O minuto do disparo e a
 * posição do mancal na lista entram no número, o que basta para não colidir na
 * prática — duas notas no mesmo minuto para mancais com a mesma unidade de
 * posição colidiriam, e aí a segunda sobrescreve a primeira em vez de criar uma
 * nota órfã.
 */
export function noteNumberFor(assetTag: string, raisedAt: string): string {
  const minute = Math.floor((Date.parse(raisedAt) - SIM_EPOCH_MS) / 60_000);
  const slot = DRYER_BEARING_TAGS.findIndex((item) => item.assetTag === assetTag);

  /**
   * O resto é **euclidiano**, e não o `%` de JavaScript.
   *
   * O minuto é medido a partir da época da simulação, então ele é negativo para
   * qualquer instante anterior a ela — e esses instantes existem: a semente
   * grava 72 h de histórico de mancal terminando *agora*, e se "agora" estiver
   * nos três primeiros dias da época, parte desse histórico cai antes dela. O
   * `%` de JavaScript devolve o sinal do dividendo, o número da nota saía
   * negativo e `maintenanceNoteNumber` recusava.
   *
   * Para todo instante a partir da época os dois restos são iguais, então nada
   * que já foi gerado muda de número.
   */
  const slotOfDay = ((minute % 90_000) + 90_000) % 90_000;

  return maintenanceNoteNumber(slotOfDay * 10 + (Math.max(0, slot) % 10) + 1);
}

/**
 * Notas abertas a partir dos alarmes de mancal.
 *
 * Só os de prioridade alta ou crítica, e só os de mancal: é o que o gêmeo sabe
 * diagnosticar. Um alarme de umidade pede ajuste de operação, não nota de
 * manutenção, e abrir nota para ele encheria a fila de trabalho da manutenção
 * com coisa que não é dela.
 */
export function notesFromAlarms(
  alarms: readonly Alarm[],
  roundId: string | null,
): MaintenanceNote[] {
  const notes = new Map<string, MaintenanceNote>();

  for (const alarm of alarms) {
    if (alarm.priority !== 'alta' && alarm.priority !== 'crítica') continue;

    const bearing = DRYER_BEARING_TAGS.find(
      (item) =>
        item.vibration === alarm.tag ||
        item.envelope === alarm.tag ||
        item.temperature === alarm.tag,
    );
    if (!bearing) continue;

    const number = noteNumberFor(bearing.assetTag, alarm.raisedAt);
    if (notes.has(number)) continue;

    const measurement =
      alarm.tag === bearing.vibration
        ? 'vibração'
        : alarm.tag === bearing.envelope
          ? 'envelope de aceleração'
          : 'temperatura do mancal';

    notes.set(number, {
      number,
      assetTag: bearing.assetTag,
      symptom:
        `${measurement} acima do limite ${alarm.limit} (${String(alarm.threshold)}), ` +
        `pior valor ${alarm.peakValue.toFixed(2)}`,
      priority: alarm.priority === 'crítica' ? 1 : 2,
      origin: 'alarme',
      originRef: alarm.id,
      status: 'aberta',
      requiresShutdown: alarm.priority === 'crítica',
      evidence: [
        { kind: 'alarme', ref: alarm.id, label: `alarme ${alarm.limit} de ${alarm.tag}` },
        { kind: 'tendência', ref: alarm.tag, label: 'tendência das últimas 72 h' },
        ...(roundId ? [{ kind: 'ronda' as const, ref: roundId, label: 'ponto da ronda' }] : []),
      ],
      createdAt: alarm.raisedAt,
      closedAt: null,
    });
  }

  return [...notes.values()];
}

// ----------------------------------------------------------------- colheita

export interface EntityHarvest {
  readonly shifts: readonly StoredShift[];
  readonly reels: readonly JumboReel[];
  readonly gradeChanges: readonly GradeChange[];
  readonly webBreaks: readonly WebBreak[];
  readonly rounds: readonly Round[];
  readonly notes: readonly MaintenanceNote[];
  readonly setpointChanges: readonly SetpointChange[];
}

/** Os turnos que uma janela de passos toca, do mais antigo ao mais recente. */
export function shiftsInRange(seed: number, fromTick: number, toTick: number): ShiftPlan[] {
  const plans: ShiftPlan[] = [];
  let cursor = shiftPlan(seed, shiftWindowAt(tickTime(fromTick)));

  while (cursor.startTick <= toTick) {
    plans.push(cursor);
    const next = tickTime(cursor.endTick + 1);
    cursor = shiftPlan(seed, shiftWindowAt(next));
    if (plans.length > 32) break; // trava: a janela nunca cobre 32 turnos
  }

  return plans;
}

/**
 * Colhe as entidades de operação da janela.
 *
 * Chamado **depois** de o arquivo ter sido gravado, porque é dele que as médias
 * saem. A ordem importa: colher antes de gravar daria bobinas sem gramatura.
 */
export async function harvestEntities(
  db: Database,
  seed: number,
  fromTick: number,
  toTick: number,
  alarms: readonly Alarm[],
): Promise<EntityHarvest> {
  const shifts: StoredShift[] = [];
  const reels: JumboReel[] = [];
  const gradeChanges: GradeChange[] = [];
  const webBreaks: WebBreak[] = [];
  const rounds: Round[] = [];
  const setpointChanges: SetpointChange[] = [];

  let lastRoundId: string | null = null;

  for (const plan of shiftsInRange(seed, fromTick, toTick)) {
    const shiftId = plan.shift.id;
    const shiftStart = tickTime(plan.startTick);
    const closedShift = plan.endTick <= toTick;
    const until = tickTime(Math.min(plan.endTick, toTick));

    // --- quebra de folha ---
    const quebra = plan.webBreak;
    const quebraComeçou = quebra !== null && quebra.startTick <= toTick;

    if (quebra && quebraComeçou) {
      webBreaks.push({
        id: `QB-${String(quebra.startTick)}`,
        shiftId,
        startedAt: tickTime(quebra.startTick).toISOString(),
        endedAt: quebra.endTick <= toTick ? tickTime(quebra.endTick).toISOString() : null,
        section: quebra.section,
        probableCause: quebra.probableCause,
        precursors: await precursorsOf(db, quebra.upsetTag, quebra.startTick),
      });
    }

    // --- troca de gramatura ---
    const troca = plan.gradeChange;
    if (troca && troca.startTick <= toTick) {
      const point = historianPoint('AIC-902');
      const tolerance = basisWeightTolerance();
      let stabilizedAt: string | null = null;

      if (point) {
        const samples = await db.archivedSamples({
          pointId: point.pointId,
          from: tickTime(troca.startTick),
          to: tickTime(Math.min(troca.startTick + 3600, toTick)),
        });
        const settled = samples.find((sample) => Math.abs(sample.v - troca.toGsm) <= tolerance);
        if (settled) stabilizedAt = new Date(settled.t).toISOString();
      }

      gradeChanges.push({
        id: `TG-${String(troca.startTick)}`,
        shiftId,
        fromGsm: troca.fromGsm,
        toGsm: troca.toGsm,
        startedAt: tickTime(troca.startTick).toISOString(),
        stabilizedAt,
        /**
         * As bobinas afetadas são as que estavam na Pope durante a transição.
         *
         * A comparação é toda em **passos**, e vale dizer por quê: a primeira
         * versão comparava `reel.startTick` com `Date.parse(stabilizedAt)` — um
         * passo contra milissegundos — e o teste passava por acidente, porque
         * milissegundos são sempre maiores. A unidade errada numa comparação é o
         * tipo de erro que não quebra nada e responde errado para sempre.
         *
         * E a bobina ainda sendo enrolada conta: ela pegou a transição tanto
         * quanto a que já fechou. O filtro é "começou antes de estabilizar e
         * terminou depois de começar a troca", mais "já existe no banco" — que é
         * o que a chave estrangeira exige.
         */
        affectedReels: plan.reels
          .filter((reel) => reel.startTick <= toTick)
          .filter(
            (reel) =>
              reel.endTick > troca.startTick &&
              reel.startTick < (stabilizedAt ? tickAt(new Date(stabilizedAt)) : Infinity),
          )
          .map((reel) => reel.number),
      });

      setpointChanges.push({
        id: `SP-${String(troca.startTick)}-AIC-902`,
        tag: 'AIC-902',
        previousValue: troca.fromGsm,
        newValue: troca.toGsm,
        unit: processVariable('AIC-902')?.unit ?? 'g/m²',
        changedBy: operatorOf(plan.shift),
        changedAt: tickTime(troca.startTick).toISOString(),
        reason: 'troca de gramatura programada',
      });
    }

    // --- ronda ---
    if (plan.round.endTick <= toTick) {
      const round = await buildRound(db, seed, shiftId, plan);
      rounds.push(round);
      lastRoundId = round.id;
    }

    // --- bobinas ---
    for (const reel of plan.reels) {
      if (reel.startTick > toTick) continue;

      const closed = reel.endTick <= toTick;
      const breaksInside =
        quebra && quebra.startTick >= reel.startTick && quebra.startTick < reel.endTick ? 1 : 0;
      const gradeChangeInside =
        troca !== null && troca.startTick >= reel.startTick && troca.startTick < reel.endTick;

      reels.push(
        await buildReel(db, shiftId, reel.number, reel.startTick, reel.endTick, closed, {
          breaksInside,
          gradeChangeInside,
        }),
      );
    }

    // --- turno ---
    const hours = (until.getTime() - shiftStart.getTime()) / 3_600_000;
    const avgProduction = await averageOfTag(db, 'XI-0001', shiftStart, until);
    const productionT = avgProduction === null ? 0 : avgProduction * hours;
    const nominal = nominalShiftProductionT(plan.shift) * (hours / 8);

    const handover: string[] = [];
    if (quebra && quebraComeçou) {
      handover.push(
        `quebra de folha em ${quebra.section} às ` +
          `${tickTime(quebra.startTick).toISOString().slice(11, 16)} UTC: ` +
          quebra.probableCause,
      );
    }
    if (troca && troca.startTick <= toTick) {
      handover.push(
        `troca de gramatura de ${String(troca.fromGsm)} para ${String(troca.toGsm)} g/m²`,
      );
    }
    const rebaixadas = reels.filter(
      (reel) => reel.shiftId === shiftId && reel.disposition === 'rebaixada',
    ).length;
    if (rebaixadas > 0) {
      handover.push(
        `${String(rebaixadas)} bobina${rebaixadas > 1 ? 's' : ''} rebaixada${
          rebaixadas > 1 ? 's' : ''
        }`,
      );
    }

    shifts.push({
      id: shiftId,
      letter: plan.shift.letter,
      operationDate: plan.shift.operationDate,
      startedAt: plan.shift.startedAt,
      endedAt: closedShift ? plan.shift.endedAt : null,
      operator: operatorOf(plan.shift),
      productionT: Number(productionT.toFixed(1)),
      efficiencyPct:
        nominal <= 0 ? 0 : Number(Math.min(100, (productionT / nominal) * 100).toFixed(1)),
      handover,
    });
  }

  return {
    shifts,
    reels,
    gradeChanges,
    webBreaks,
    rounds,
    notes: notesFromAlarms(alarms, lastRoundId),
    setpointChanges,
  };
}

/** Grava a colheita, na ordem que as chaves estrangeiras exigem. */
export async function persistHarvest(db: Database, harvest: EntityHarvest): Promise<void> {
  // turno primeiro: bobina, quebra, troca e ronda apontam para ele
  await db.upsertShifts(harvest.shifts);
  await db.upsertReels(harvest.reels);
  await db.upsertWebBreaks(harvest.webBreaks);
  // a troca aponta para as bobinas afetadas, que já estão gravadas
  await db.upsertGradeChanges(harvest.gradeChanges);
  await db.upsertRounds(harvest.rounds);
  // a nota aponta para a ronda pelo id, sem chave estrangeira, mas a ordem
  // mantém a referência válida para quem for seguir o link
  await db.upsertMaintenanceNotes(harvest.notes);

  for (const change of harvest.setpointChanges) {
    await db.insertSetpointChange(change);
  }
}
