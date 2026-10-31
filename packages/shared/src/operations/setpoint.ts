import { processVariable } from '../process/catalog';
import { FROM_LISTA_BASE, type ProvenanceNote } from './provenance';

/**
 * A alteração de setpoint — a única escrita que o gêmeo aceita.
 *
 * Da LISTA-BASE: malha, valor anterior e novo, quem, quando, motivo.
 *
 * Os cinco campos juntos são a auditoria. Guardar só o valor novo daria um
 * histórico em que ninguém sabe de onde o processo veio; guardar sem motivo
 * daria um histórico que não serve para a reunião seguinte. O valor anterior é
 * gravado pelo servidor a partir do que estava valendo, e não enviado por quem
 * escreve: quem escreve não tem como saber se alguém mexeu entre a leitura da
 * tela e o clique.
 */

/** Uma alteração de setpoint, já aceita e registrada. */
export interface SetpointChange {
  /** Id determinístico: `SP-<instante em segundos>-<tag>`. */
  readonly id: string;
  /** TAG da malha, do catálogo, com `controlled` verdadeiro. */
  readonly tag: string;
  /** Valor que estava valendo, lido pelo servidor. */
  readonly previousValue: number;
  readonly newValue: number;
  /** Unidade, copiada do catálogo no momento da escrita. */
  readonly unit: string;
  readonly changedBy: string;
  readonly changedAt: string;
  readonly reason: string;
}

/** Por que uma escrita de setpoint foi recusada. */
export const SETPOINT_REJECTIONS = [
  'tag-desconhecida',
  'tag-nao-controlada',
  'fora-dos-limites',
  'sem-motivo',
  'valor-invalido',
] as const;

export type SetpointRejection = (typeof SETPOINT_REJECTIONS)[number];

export interface SetpointCheck {
  readonly ok: boolean;
  readonly rejection: SetpointRejection | null;
  /** O que dizer a quem escreveu, em português. */
  readonly message: string | null;
  /** Faixa de operação do catálogo, quando a tag existe. */
  readonly min: number | null;
  readonly max: number | null;
}

const ok: SetpointCheck = { ok: true, rejection: null, message: null, min: null, max: null };

/**
 * Se uma escrita de setpoint é aceitável, pelo catálogo.
 *
 * A faixa é a `min`–`max` do catálogo, que é a **faixa de operação normal** e
 * não a faixa física da malha. Recusar fora dela é conservador de propósito: um
 * gêmeo digital que aceita 400 kPa no grupo principal, onde o catálogo para em
 * 350, deixa de simular a MP1 e passa a simular outra máquina. Os limites de
 * alarme (`LL`/`L`/`H`/`HH`) não entram aqui — eles avisam, não impedem.
 *
 * O motivo é obrigatório porque é o campo que a LISTA-BASE pede e o único que
 * nenhum sistema consegue preencher depois.
 */
export function checkSetpoint(tag: string, value: number, reason: string): SetpointCheck {
  const variable = processVariable(tag);

  if (!variable) {
    return {
      ok: false,
      rejection: 'tag-desconhecida',
      message: `A tag ${tag} não existe no catálogo de processo.`,
      min: null,
      max: null,
    };
  }

  const range = { min: variable.min, max: variable.max };

  if (!variable.controlled) {
    return {
      ok: false,
      rejection: 'tag-nao-controlada',
      message: `${tag} é medição, não malha: não tem setpoint para escrever.`,
      ...range,
    };
  }

  if (!Number.isFinite(value)) {
    return {
      ok: false,
      rejection: 'valor-invalido',
      message: 'O valor precisa ser um número finito.',
      ...range,
    };
  }

  if (value < variable.min || value > variable.max) {
    return {
      ok: false,
      rejection: 'fora-dos-limites',
      message:
        `${String(value)} ${variable.unit} está fora da faixa de operação de ${tag}, que vai de ` +
        `${String(variable.min)} a ${String(variable.max)} ${variable.unit}.`,
      ...range,
    };
  }

  if (reason.trim() === '') {
    return {
      ok: false,
      rejection: 'sem-motivo',
      message: 'Toda alteração de setpoint precisa de motivo.',
      ...range,
    };
  }

  return { ...ok, ...range };
}

export const SETPOINT_CHANGE_PROVENANCE: ProvenanceNote = FROM_LISTA_BASE;
