import type { SectionId } from '../asset';
import type { ProvenanceNote } from './provenance';

/**
 * A quebra de folha — o evento que a operação mais teme e menos entende.
 *
 * Da LISTA-BASE: início, fim, posição na máquina, causa provável e **os sinais
 * nos 10 min anteriores**. É esse último campo que faz a entidade valer: uma
 * lista de quebras com hora e causa é um livro de ocorrências; uma lista de
 * quebras com o que as tags fizeram antes é o começo de um diagnóstico.
 *
 * A causa é "provável" de propósito. Quem opera anota um palpite no calor do
 * momento, e o palpite às vezes é desmentido pelos sinais. O modelo guarda os
 * dois separados em vez de deduzir um do outro.
 */

/** A janela de sinais que precede a quebra, em segundos. Da LISTA-BASE: 10 min. */
export const PRECURSOR_WINDOW_S = 600;

/**
 * Um sinal observado antes da quebra.
 *
 * `leadTimeS` é quantos segundos antes da quebra o sinal apareceu, então
 * aparece contado para trás: 540 é nove minutos antes, 0 é no instante da
 * quebra. Contar para trás, e não como instante absoluto, é o que deixa duas
 * quebras comparáveis lado a lado.
 */
export interface BreakPrecursor {
  /** TAG do catálogo de processo. */
  readonly tag: string;
  /** O que a tag fez, em português: "caiu 12 kPa em 40 s". */
  readonly description: string;
  /** Segundos antes da quebra, entre 0 e `PRECURSOR_WINDOW_S`. */
  readonly leadTimeS: number;
  /** Valor da tag no início da janela. */
  readonly valueBefore: number;
  /** Valor da tag no instante do sinal. */
  readonly valueAtSignal: number;
}

/** Uma quebra de folha. */
export interface WebBreak {
  /** Id determinístico: `QB-<instante em segundos>`. */
  readonly id: string;
  readonly shiftId: string;
  readonly startedAt: string;
  /** Quando a folha voltou a passar; `null` enquanto a máquina está parada. */
  readonly endedAt: string | null;
  /** Onde a folha arrebentou. */
  readonly section: SectionId;
  readonly probableCause: string;
  /** Sinais da janela anterior, do mais antigo para o mais recente. */
  readonly precursors: readonly BreakPrecursor[];
}

/** Duração da parada, em segundos; `null` enquanto a quebra está aberta. */
export function breakDurationS(webBreak: WebBreak): number | null {
  if (webBreak.endedAt === null) return null;
  return (Date.parse(webBreak.endedAt) - Date.parse(webBreak.startedAt)) / 1000;
}

/**
 * Se os sinais estão todos dentro da janela de 10 min e em ordem.
 *
 * Um sinal com `leadTimeS` acima da janela não é precursor da quebra: é o que
 * estava acontecendo antes, e tratá-lo como precursor transformaria qualquer
 * ruído do turno em causa. A ordem é do mais antigo para o mais recente, que é
 * como a tela desenha a linha do tempo.
 */
export function precursorsAreWithinWindow(webBreak: WebBreak): boolean {
  let previous = PRECURSOR_WINDOW_S + 1;

  for (const precursor of webBreak.precursors) {
    if (precursor.leadTimeS < 0 || precursor.leadTimeS > PRECURSOR_WINDOW_S) return false;
    if (precursor.leadTimeS > previous) return false;
    previous = precursor.leadTimeS;
  }

  return true;
}

export const WEB_BREAK_PROVENANCE: ProvenanceNote = {
  source: 'B',
  note:
    'Campos da seção "Entidades de operação" da LISTA-BASE, inclusive a janela de 10 min dos ' +
    'sinais anteriores.',
};
