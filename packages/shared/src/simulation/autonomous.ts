import { type ProcessVariable } from '../process/types';

import { streamOf } from './noise';
import { instrumentNoiseSd } from './operating-point';

/**
 * A deriva lenta das variáveis autônomas.
 *
 * Autônoma é a variável que o simulador não sabe explicar: o vácuo de uma caixa,
 * a tensão de um feltro, o nível de óleo de uma unidade hidráulica. Elas não
 * têm relação com nada no modelo, e fingir que têm seria pior do que admitir
 * que não têm.
 *
 * O que elas têm é **vida**: num turno inteiro, nenhuma delas fica parada no
 * alvo. Então o valor é alvo + ruído de instrumento + uma deriva de horas — e a
 * deriva, como o ruído, é **função pura de (semente, passo, canal)**. Nada de
 * estado: recalcular um trecho dá exatamente o que rodar contínuo deu, que é a
 * regra que sustenta a retomada e, agora, a reconstrução da tendência de quem
 * não grava no historiador.
 *
 * ## Por que a deriva é presa dentro de L–H
 *
 * Porque uma variável sem física não pode disparar alarme. Um vácuo que
 * passeia até o limite inferior acenderia um alarme que ninguém sabe explicar,
 * e que não some até ele passear de volta — ruído com cara de evento. A
 * amplitude é calculada para caber entre os limites **com folga para o ruído**,
 * e a medida ainda é presa à faixa no fim: é a única exceção à regra de que a
 * medida não se prende, e ela existe para que só um cenário consiga tirar uma
 * autônoma do lugar.
 */

/** Períodos das duas ondas, em passos de 1 s: ~4 h e ~11 h. */
const SLOW_PERIOD_TICKS = 14_400;
const SLOWER_PERIOD_TICKS = 39_600;

/** Quanto da folga até o limite a deriva pode ocupar. */
const ROOM_SHARE = 0.6;

/** Desvios de ruído que ficam reservados dentro da folga. */
const NOISE_SIGMAS = 4;

export interface AutonomousBand {
  /** O valor em torno do qual ela passeia. */
  readonly base: number;
  /** Amplitude da deriva, já descontada a folga do ruído. */
  readonly amplitude: number;
  /** Onde a medida é presa, para a autônoma não alarmar sozinha. */
  readonly low: number;
  readonly high: number;
}

/**
 * A faixa em que uma autônoma pode passear.
 *
 * Sem alvo não há deriva: o diâmetro da bobina jumbo não tem valor de operação
 * — ele cresce e volta —, e passear em torno do meio da faixa seria inventar um
 * comportamento no lugar de outro.
 */
export function autonomousBand(variable: ProcessVariable): AutonomousBand {
  const low = variable.limits.l ?? variable.min;
  const high = variable.limits.h ?? variable.max;
  const base = variable.target ?? (low + high) / 2;
  const sd = instrumentNoiseSd(variable.tag);

  const room = Math.max(0, Math.min(base - low, high - base) - NOISE_SIGMAS * sd);
  const amplitude = variable.target === null ? 0 : ROOM_SHARE * room;

  return { base, amplitude, low, high };
}

/**
 * Duas ondas de períodos incomensuráveis, para o passeio não ter cara de seno.
 *
 * A fase sai do canal da tag, então duas variáveis vizinhas não sobem juntas —
 * o que, num gráfico de quatro TAGs lado a lado, seria a primeira coisa a
 * entregar que ali não há processo nenhum.
 */
export function autonomousDrift(seed: number, tick: number, channel: number): number {
  const phase = (channel % 1000) / 1000;
  const slow = Math.sin(2 * Math.PI * (tick / SLOW_PERIOD_TICKS + phase));
  const slower = Math.sin(2 * Math.PI * (tick / SLOWER_PERIOD_TICKS + phase * 1.7 + seed * 1e-9));
  return 0.62 * slow + 0.38 * slower;
}

/** A verdade de uma autônoma no passo: alvo mais deriva. */
export function autonomousTruth(
  variable: ProcessVariable,
  band: AutonomousBand,
  seed: number,
  tick: number,
): number {
  if (band.amplitude === 0) return band.base;
  return band.base + band.amplitude * autonomousDrift(seed, tick, streamOf(variable.tag));
}
