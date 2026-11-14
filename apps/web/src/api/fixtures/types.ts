import type { Alarm, ProcessVariable } from '@mp1/shared';

import type { TagTrend, TagValue } from '../process';

/**
 * Os tipos das rotas que a API ainda não tem.
 *
 * Cada um é o corpo que uma rota de verdade devolveria, para a troca por ela
 * não mexer nas telas: hoje quem responde é `fixtures/`, amanhã é a API, e a
 * tela continua recebendo o mesmo formato. O `illustrative: true` em cada
 * resposta é o que a tela usa para pôr o selo — ele sai quando a rota for real.
 */

/** Um ensaio de laboratório numa bobina (`GET /lab/results`). */
export interface LabResult {
  readonly reelNumber: number;
  /** TAG do ensaio, de `LAB_VARIABLES`. */
  readonly tag: string;
  readonly value: number;
  readonly unit: string;
  /** Quando a amostra foi analisada. */
  readonly analyzedAt: string;
}

/** A especificação numérica de um ensaio: o que a tela compara. */
export interface LabSpec {
  readonly tag: string;
  /** Nome curto, como na coluna da matriz. */
  readonly label: string;
  readonly unit: string;
  readonly lo: number;
  readonly hi: number;
  readonly target: number | null;
  /** Quantas bobinas entre uma amostra e a próxima: 1 = toda bobina. */
  readonly everyReels: number;
}

export interface LabResults {
  readonly illustrative: true;
  readonly specs: readonly LabSpec[];
  readonly results: readonly LabResult[];
}

/** Uma bobina parada pela qualidade (`GET /reels/holds`). */
export interface ReelHold {
  readonly reelNumber: number;
  readonly status: 'retida' | 'em avaliação';
  /** O ensaio que segurou a bobina. */
  readonly tag: string;
  readonly value: number;
  readonly unit: string;
  readonly since: string;
  readonly reason: string;
}

export interface ReelHolds {
  readonly illustrative: true;
  readonly holds: readonly ReelHold[];
}

/**
 * As TAGs de processo que o catálogo não tem: variável, valor e alarme.
 *
 * Mesmo formato de `/process/tags/:tag`, `/process/values` e `/alarms`, para a
 * tela de Processo tratar uma linha fixa igual a uma real — com o selo.
 */
export interface FixedProcess {
  readonly illustrative: true;
  readonly ts: string;
  readonly variables: readonly ProcessVariable[];
  readonly values: readonly TagValue[];
  readonly alarms: readonly Alarm[];
}

export interface FixedTrend extends TagTrend {
  readonly illustrative: true;
}

/**
 * O mapa CD × MD de uma propriedade numa bobina (`GET /reels/:n/cd-map`).
 *
 * `values[cd][md]`: linhas do lado de comando (LC, índice 0) ao lado de
 * acionamento (LA); colunas do início ao fim da bobina.
 */
export interface CdMap {
  readonly illustrative: true;
  readonly reelNumber: number;
  readonly tag: string;
  readonly unit: string;
  readonly widthM: number;
  readonly lengthM: number;
  readonly values: readonly (readonly number[])[];
}
