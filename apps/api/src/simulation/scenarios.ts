import {
  plantOffsetSuffix,
  processVariable,
  REEL_CHANGE_DIAMETER_MM,
  shiftWindowAt,
  WEB_WIDTH_M,
  type SectionId,
  type ShiftWindow,
} from '@mp1/shared';

import { secondsToTicks, SIM_EPOCH_MS, TICK_MS, tickAt, tickTime, TICKS_PER_HOUR } from './clock';
import { streamOf, unitNoise } from './noise';
import { requireOperatingPoint } from './operating-point';

/**
 * Os cenários do turno: o que acontece, e quando, sem nada guardado.
 *
 * Tudo aqui é função de (semente, instante). Um plano de turno não é sorteado
 * ao vivo nem guardado em tabela: ele é **calculado** a partir do dia e da letra
 * do turno, então a API que dorme e acorda chega ao mesmo plano, e o
 * instantâneo do modo de demonstração conta a mesma história que a API ao vivo.
 *
 * O que o plano **não** faz é escrever o que as tags fizeram. A quebra de folha
 * declara qual malha foi perturbada e quando; os sinais dos 10 min anteriores
 * saem do que o processo de verdade fez com aquela perturbação. É a diferença
 * entre um gêmeo digital e uma animação.
 */

/**
 * Quanto papel cabe numa bobina, pela geometria.
 *
 * A área da seção do rolo cresce com o papel enrolado:
 * `π/4 · (d² − d₀²) = L · espessura`. Com o diâmetro de troca de 3.000 mm
 * (`ZI-1004`), o núcleo de 600 mm (o mínimo da mesma tag) e a espessura de
 * 102 µm (`AIC-905`), dá ~66,5 km de papel.
 *
 * **A pesquisa diz "~45 min" por bobina, e esta conta dá ~53 min a 1.250 m/min.**
 * Os dois números não cabem juntos, e o desempate é que um é prosa aproximada,
 * na coluna de frequência de amostragem do laboratório, e o outro sai de três
 * valores especificados que qualquer um pode conferir. Fica anotado como
 * pendência: se o núcleo da MP1 for maior que 600 mm, os 45 min voltam a
 * fechar — com 1,2 m de núcleo a conta dá 46 min.
 */
export function reelLengthM(
  coreDiameterMm = processVariable('ZI-1004')?.min ?? 600,
  finalDiameterMm = REEL_CHANGE_DIAMETER_MM,
  caliperUm = requireOperatingPoint('AIC-905'),
): number {
  const core = coreDiameterMm / 1000;
  const final = finalDiameterMm / 1000;
  const caliper = caliperUm / 1e6;

  return (Math.PI / 4) * ((final * final - core * core) / caliper);
}

/** Duração nominal de uma bobina, em segundos, à velocidade de operação. */
export function reelDurationS(): number {
  const speedMPerMin = requireOperatingPoint('SIC-1104');
  return (reelLengthM() / speedMPerMin) * 60;
}

/**
 * A grade das bobinas, em passos.
 *
 * É a duração **nominal**: a velocidade e a espessura variam, então a bobina
 * de verdade fecha um pouco antes ou depois. A grade existe para o nº da bobina
 * ser função do instante — sem ela, numerar bobinas exigiria um contador
 * guardado, e um contador guardado perde o fio quando o processo dorme.
 *
 * O que a bobina de verdade fez — peso, comprimento, médias — é registrado pela
 * entidade, acumulado ao longo dela. A grade só diz quando ela começa e termina.
 */
export const REEL_TICKS = secondsToTicks(reelDurationS());

/** O passo em que a simulação começa a contar bobinas. */
const REEL_EPOCH_TICK = tickAt(new Date(SIM_EPOCH_MS));

/** Uma bobina planejada. */
export interface ReelPlan {
  readonly number: number;
  readonly startTick: number;
  readonly endTick: number;
}

/** A bobina que está sendo enrolada num passo. */
export function reelAt(tick: number): ReelPlan {
  const index = Math.floor((tick - REEL_EPOCH_TICK) / REEL_TICKS);
  const startTick = REEL_EPOCH_TICK + index * REEL_TICKS;

  return { number: index + 1, startTick, endTick: startTick + REEL_TICKS };
}

/**
 * O diâmetro da bobina num passo, pela geometria.
 *
 * Cresce com a raiz do papel enrolado, e não em linha reta: as primeiras voltas
 * engrossam o rolo muito mais rápido que as últimas. É o que faz a curva de
 * diâmetro da Pope ter a forma que tem, e é por isso que a carga do nip é
 * programada por diâmetro (`WIC-1001`, "servo-válvulas por curva de diâmetro").
 */
export function reelDiameterMm(tick: number, plan = reelAt(tick)): number {
  const progress = Math.min(1, Math.max(0, (tick - plan.startTick) / REEL_TICKS));
  const core = processVariable('ZI-1004')?.min ?? 600;
  const final = REEL_CHANGE_DIAMETER_MM;

  return Math.sqrt(core * core + progress * (final * final - core * core));
}

/** O comprimento de papel enrolado até um passo, em metros. */
export function reelWoundM(tick: number, plan = reelAt(tick)): number {
  const progress = Math.min(1, Math.max(0, (tick - plan.startTick) / REEL_TICKS));
  return reelLengthM() * progress;
}

/**
 * A troca de gramatura: uma por dia de operação, no turno B.
 *
 * **Suposição.** A pesquisa não diz com que frequência a MP1 troca de
 * gramatura. Uma por dia é o que uma máquina de papel de embalagem costuma
 * fazer, e é frequente o bastante para a tela de Turno ter o que mostrar sem
 * virar uma máquina que nunca produz em regime.
 *
 * As duas gramaturas são as que o catálogo dá: 75 g/m² é o alvo da `AIC-902`, e
 * 80 está dentro da faixa 68–92. O sentido alterna por dia, para a máquina não
 * ficar subindo de gramatura para sempre.
 */
export const GRADE_CHANGE_SHIFT = 'B';
export const GRADE_CHANGE_HOUR_INTO_SHIFT = 3;
export const ALTERNATE_GSM = 80;

export interface GradeChangePlan {
  readonly startTick: number;
  readonly fromGsm: number;
  readonly toGsm: number;
}

/** Dias desde o início da simulação, para alternar o sentido da troca. */
function daysSinceEpoch(operationDate: string): number {
  return Math.round((Date.parse(`${operationDate}T00:00:00Z`) - SIM_EPOCH_MS) / 86_400_000);
}

/** A troca de gramatura do turno, ou `null` se este turno não tem. */
export function gradeChangeOf(shift: ShiftWindow): GradeChangePlan | null {
  if (shift.letter !== GRADE_CHANGE_SHIFT) return null;

  const base = requireOperatingPoint('AIC-902');
  const sobe = daysSinceEpoch(shift.operationDate) % 2 === 0;

  return {
    startTick: tickAt(new Date(shift.startedAt)) + GRADE_CHANGE_HOUR_INTO_SHIFT * TICKS_PER_HOUR,
    fromGsm: sobe ? base : ALTERNATE_GSM,
    toGsm: sobe ? ALTERNATE_GSM : base,
  };
}

/** O passo em que a troca de gramatura de um dia de operação acontece. */
function gradeChangeTickOf(operationDate: string): number {
  const shiftIndex = ['A', 'B', 'C'].indexOf(GRADE_CHANGE_SHIFT);
  const dayStart = tickAt(new Date(`${operationDate}T06:00:00${plantOffsetSuffix()}`));

  return dayStart + (shiftIndex * 8 + GRADE_CHANGE_HOUR_INTO_SHIFT) * TICKS_PER_HOUR;
}

/**
 * A gramatura que está valendo num passo.
 *
 * É preciso porque a troca de gramatura é **evento**, e um evento só move o
 * processo se o processo estiver no estado de antes dele. Sem isto, um motor
 * montado num dia em que a troca é de 80 para 75 arrancaria em 75 e a "troca"
 * não moveria nada — a tela mostraria uma transição que não aconteceu.
 *
 * A conta olha a troca de hoje e a de ontem, e pega a última que já passou:
 * como as trocas alternam de sentido por dia, o estado de agora é o destino da
 * última troca.
 */
export function gradeInEffectAt(tick: number): number {
  const base = requireOperatingPoint('AIC-902');
  const hoje = shiftWindowAt(tickTime(tick)).operationDate;
  const ontem = new Date(Date.parse(`${hoje}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

  let grade = base;
  for (const dia of [ontem, hoje]) {
    if (gradeChangeTickOf(dia) <= tick) {
      grade = daysSinceEpoch(dia) % 2 === 0 ? ALTERNATE_GSM : base;
    }
  }

  return grade;
}

/**
 * As quebras de folha que o cenário sabe produzir.
 *
 * Cada uma declara **qual malha é perturbada e para onde**, e é só isso: os
 * sinais dos 10 min anteriores não são escritos aqui, são o que o processo faz
 * com a perturbação. A causa provável é a frase que quem opera anotaria, e pode
 * não bater com os sinais — é o que acontece de verdade, e o modelo guarda as
 * duas coisas separadas.
 */
export interface BreakCause {
  readonly section: SectionId;
  readonly probableCause: string;
  /** A malha perturbada. */
  readonly upsetTag: string;
  /** Para onde o setpoint dela vai, na unidade da tag. */
  readonly upsetSetpoint: number;
}

const BREAK_CAUSES: readonly BreakCause[] = [
  {
    section: 'post-dryer',
    probableCause: 'descolamento na entrada da pós-secagem',
    // sifões alagando: o condensado não sai e a folha descola
    upsetTag: 'PDIC-721',
    upsetSetpoint: 26,
  },
  {
    section: 'pre-dryer',
    probableCause: 'folha presa no cilindro depois de alagamento de sifão',
    upsetTag: 'PDIC-524',
    upsetSetpoint: 17,
  },
  {
    section: 'press',
    probableCause: 'perda de vácuo na prensa de sapata',
    upsetTag: 'WIC-401',
    upsetSetpoint: 640,
  },
  {
    section: 'speed-sizer',
    probableCause: 'filme de amido irregular com a barra muito aberta',
    upsetTag: 'PIC-604A',
    upsetSetpoint: 0.9,
  },
];

/**
 * Quanto antes da quebra a perturbação começa, em segundos.
 *
 * Igual à janela de sinais da LISTA-BASE: os 10 min anteriores. Não é
 * coincidência — a janela existe porque é nela que os sinais aparecem, e o
 * cenário põe a perturbação exatamente onde quem investiga vai olhar.
 */
export const UPSET_LEAD_S = 600;

/** Quanto tempo a máquina fica parada numa quebra, em segundos. **Suposição**. */
export const BREAK_DURATION_S = 22 * 60;

/**
 * Uma quebra por dia de operação, no turno que o dia escolher.
 *
 * **Suposição.** Uma máquina de papel bem cuidada tem de uma a três quebras por
 * dia; uma por dia é conservador. O turno e o momento dentro dele saem do ruído
 * por posição, então variam entre dias e não entre execuções.
 */
export interface BreakPlan extends BreakCause {
  readonly startTick: number;
  readonly endTick: number;
  /** Quando a perturbação entra — `UPSET_LEAD_S` antes da quebra. */
  readonly upsetTick: number;
}

export function webBreakOf(seed: number, shift: ShiftWindow): BreakPlan | null {
  const stream = streamOf(shift.operationDate);
  const letterIndex = ['A', 'B', 'C'].indexOf(shift.letter);
  const chosen = Math.floor(unitNoise(seed, 0, stream, 1) * 3);
  if (chosen !== letterIndex) return null;

  const shiftStart = tickAt(new Date(shift.startedAt));
  const shiftTicks = tickAt(new Date(shift.endedAt)) - shiftStart;

  // a quebra fica na metade do meio do turno, longe das bordas: uma quebra
  // exatamente na troca de turno deixaria a passagem sem dono
  const offset = 0.25 + unitNoise(seed, 0, stream, 2) * 0.5;
  const startTick = shiftStart + Math.floor(shiftTicks * offset);

  const cause = BREAK_CAUSES[Math.floor(unitNoise(seed, 0, stream, 3) * BREAK_CAUSES.length)];
  if (!cause) throw new Error('A lista de causas de quebra está vazia.');

  return {
    ...cause,
    startTick,
    endTick: startTick + secondsToTicks(BREAK_DURATION_S),
    upsetTick: startTick - secondsToTicks(UPSET_LEAD_S),
  };
}

/**
 * A ronda: uma por turno, duas horas depois do começo.
 *
 * **Suposição** na frequência e no horário. Os pontos são os mancais do grupo
 * principal da secagem mais o que estiver em alarme — a ronda de verdade segue
 * um roteiro fixo e desvia para onde há notícia, e é isso que está imitado aqui.
 */
export const ROUND_HOUR_INTO_SHIFT = 2;
export const ROUND_DURATION_S = 40 * 60;

export interface RoundPlan {
  readonly startTick: number;
  readonly endTick: number;
}

export function roundOf(shift: ShiftWindow): RoundPlan {
  const startTick = tickAt(new Date(shift.startedAt)) + ROUND_HOUR_INTO_SHIFT * TICKS_PER_HOUR;
  return { startTick, endTick: startTick + secondsToTicks(ROUND_DURATION_S) };
}

/** Tudo que um turno tem planejado. */
export interface ShiftPlan {
  readonly shift: ShiftWindow;
  readonly startTick: number;
  readonly endTick: number;
  readonly reels: readonly ReelPlan[];
  readonly gradeChange: GradeChangePlan | null;
  readonly webBreak: BreakPlan | null;
  readonly round: RoundPlan;
}

/** O plano de um turno, calculado do dia e da letra. */
export function shiftPlan(seed: number, shift: ShiftWindow): ShiftPlan {
  const startTick = tickAt(new Date(shift.startedAt));
  const endTick = tickAt(new Date(shift.endedAt));

  const reels: ReelPlan[] = [];
  let cursor = reelAt(startTick);
  while (cursor.startTick < endTick) {
    reels.push(cursor);
    cursor = reelAt(cursor.endTick);
  }

  return {
    shift,
    startTick,
    endTick,
    reels,
    gradeChange: gradeChangeOf(shift),
    webBreak: webBreakOf(seed, shift),
    round: roundOf(shift),
  };
}

/** O plano do turno que contém um passo. */
export function planAt(seed: number, tick: number): ShiftPlan {
  return shiftPlan(seed, shiftWindowAt(tickTime(tick)));
}

/** Produção nominal de um turno, em toneladas, para a eficiência ter base. */
export function nominalShiftProductionT(shift: ShiftWindow): number {
  const hours = (Date.parse(shift.endedAt) - Date.parse(shift.startedAt)) / 3_600_000;
  const speed = requireOperatingPoint('SIC-1104');
  const basisWeight = requireOperatingPoint('AIC-902');

  return ((WEB_WIDTH_M * speed * basisWeight * 60) / 1e6) * hours;
}

/** O passo do fim da janela de um turno, para quem precisa fatiar a retomada. */
export const SHIFT_TICKS = 8 * TICKS_PER_HOUR;

/** Passos por milissegundo, para converter durações escritas em ms. */
export const TICKS_PER_MS = 1 / TICK_MS;
