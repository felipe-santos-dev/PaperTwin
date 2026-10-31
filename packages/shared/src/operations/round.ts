import type { AssetTag } from '../asset';
import type { ProvenanceNote } from './provenance';

/**
 * A ronda — o que a pessoa vê e o instrumento não vê.
 *
 * Da LISTA-BASE: horário, executante, pontos e, por ponto, temperatura de
 * campo, ruído, vazamento, observação e **o valor online no momento**.
 *
 * Esse último campo é o motivo de a ronda existir no gêmeo digital. Um mancal
 * com 2,1 mm/s no sistema e ruído anormal na ronda é um caso diferente de um
 * mancal com 2,1 mm/s e ronda limpa, e a diferença não está em nenhuma tag. A
 * ronda é onde o gêmeo admite que o instrumento não cobre tudo.
 *
 * O valor online é **guardado**, não recalculado na hora de mostrar. O
 * historiador devolveria o mesmo número, já que a simulação é determinística,
 * mas o par "o que o campo dizia / o que a tela dizia" é um registro daquele
 * instante: se a regra de agregação mudar, o registro não pode mudar com ela.
 */

/** Ruído percebido no ponto. Escala de três níveis, suposição nossa. */
export const NOISE_LEVELS = ['normal', 'elevado', 'anormal'] as const;

export type NoiseLevel = (typeof NOISE_LEVELS)[number];

/** Vazamento observado no ponto. Escala de três níveis, suposição nossa. */
export const LEAK_STATES = ['nenhum', 'gotejamento', 'jato'] as const;

export type LeakState = (typeof LEAK_STATES)[number];

/** Um ponto da ronda. */
export interface RoundPoint {
  /** Ativo inspecionado, do modelo da máquina. */
  readonly assetTag: AssetTag;
  /** Temperatura medida com pirômetro em campo, em °C; `null` se não mediu. */
  readonly fieldTempC: number | null;
  readonly noise: NoiseLevel;
  readonly leak: LeakState;
  /** Observação livre do executante; `null` quando não há. */
  readonly note: string | null;
  /** TAG do catálogo comparada em campo; `null` nos pontos sem instrumento. */
  readonly onlineTag: string | null;
  /** O valor que a tag mostrava no momento da ronda; `null` sem instrumento. */
  readonly onlineValue: number | null;
}

/** Uma ronda. */
export interface Round {
  /** Id determinístico: `RD-<instante em segundos>`. */
  readonly id: string;
  readonly shiftId: string;
  readonly startedAt: string;
  /** `null` enquanto a ronda está em andamento. */
  readonly finishedAt: string | null;
  /** Quem executou. */
  readonly inspector: string;
  /** Pontos na ordem em que foram percorridos. */
  readonly points: readonly RoundPoint[];
}

/** Um ponto com algo a relatar — é o que vira nota de manutenção. */
export function pointNeedsAttention(point: RoundPoint): boolean {
  return point.noise !== 'normal' || point.leak !== 'nenhum';
}

/** Os pontos da ronda que pedem atenção. */
export function pointsNeedingAttention(round: Round): RoundPoint[] {
  return round.points.filter(pointNeedsAttention);
}

/**
 * A diferença entre o campo e o online, em °C.
 *
 * `null` quando falta um dos dois — e a ausência importa: uma ronda sem
 * temperatura de campo não contradiz nem confirma o instrumento.
 */
export function fieldOnlineGapC(point: RoundPoint): number | null {
  if (point.fieldTempC === null || point.onlineValue === null) return null;
  return point.fieldTempC - point.onlineValue;
}

export const ROUND_PROVENANCE: ProvenanceNote = {
  source: 'B',
  note:
    'Campos da seção "Entidades de operação" da LISTA-BASE. As escalas de ruído e vazamento, de ' +
    'três níveis cada, são suposição nossa: a lista pede os campos e não a escala.',
};
