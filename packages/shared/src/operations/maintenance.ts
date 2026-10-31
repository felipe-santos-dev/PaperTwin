import type { AssetTag } from '../asset';
import type { ProvenanceNote } from './provenance';

/**
 * A nota de manutenção — o que a operação pede e a manutenção executa.
 *
 * Da LISTA-BASE: número (simulado), equipamento, sintoma, prioridade 1–4,
 * origem (alarme / ronda / operação), situação, se exige parada e evidências
 * anexadas.
 *
 * A origem é campo de primeira classe porque muda o peso da nota: uma nota
 * aberta por alarme tem a hora e o limite registrados, uma aberta por ronda tem
 * a impressão de quem passou ali, e uma aberta por operação tem só a frase de
 * quem estava no painel. O `originRef` aponta para o registro de onde ela saiu,
 * quando há um.
 */

/**
 * Prioridade de 1 a 4, como a LISTA-BASE pede.
 *
 * O significado de cada nível é **suposição nossa** — a lista dá a escala e não
 * o que cada número quer dizer.
 */
export const NOTE_PRIORITIES = [1, 2, 3, 4] as const;

export type NotePriority = (typeof NOTE_PRIORITIES)[number];

/** O que cada prioridade quer dizer. **Suposição**. */
export const NOTE_PRIORITY_LABELS: Readonly<Record<NotePriority, string>> = {
  1: 'Parada imediata',
  2: 'Próxima parada programada',
  3: 'Parada de manutenção',
  4: 'Quando houver oportunidade',
};

/** De onde a nota saiu. */
export const NOTE_ORIGINS = ['alarme', 'ronda', 'operação'] as const;

export type NoteOrigin = (typeof NOTE_ORIGINS)[number];

/**
 * A situação em que a nota está.
 *
 * As quatro situações são **suposição nossa**: a LISTA-BASE pede o campo
 * "situação" e não enumera os valores. Quatro é o mínimo que distingue o que a
 * tela de Notas precisa mostrar — o que ninguém olhou ainda, o que já tem plano,
 * o que está sendo feito e o que acabou.
 */
export const NOTE_STATUSES = ['aberta', 'planejada', 'em execução', 'encerrada'] as const;

export type NoteStatus = (typeof NOTE_STATUSES)[number];

/**
 * Uma evidência anexada à nota.
 *
 * Não é arquivo. O gêmeo não guarda foto nem anexo — nem teria onde, nos 0,5 GB
 * do banco gratuito — e inventar um anexo que não abre seria pior que não ter.
 * A evidência é uma **referência ao que o gêmeo já tem**: uma janela de
 * tendência, um alarme, um ponto de ronda, uma medição. Clicar nela leva ao
 * registro, que é o que alguém faria com a foto de todo jeito.
 */
export const EVIDENCE_KINDS = ['tendência', 'alarme', 'ronda', 'medição'] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface NoteEvidence {
  readonly kind: EvidenceKind;
  /** Id do registro referido: id de alarme, id de ronda, TAG com janela. */
  readonly ref: string;
  /** O que a evidência mostra, em português. */
  readonly label: string;
}

/** Uma nota de manutenção. */
export interface MaintenanceNote {
  /** Número simulado, no formato `NM-000123`. */
  readonly number: string;
  /** Equipamento, pela tag do modelo da máquina. */
  readonly assetTag: AssetTag;
  readonly symptom: string;
  readonly priority: NotePriority;
  readonly origin: NoteOrigin;
  /** Id do alarme ou da ronda que originou; `null` quando veio da operação. */
  readonly originRef: string | null;
  readonly status: NoteStatus;
  readonly requiresShutdown: boolean;
  readonly evidence: readonly NoteEvidence[];
  readonly createdAt: string;
  /** `null` enquanto não encerrada. */
  readonly closedAt: string | null;
}

/** O número da nota a partir do sequencial: 123 → `NM-000123`. */
export function maintenanceNoteNumber(sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Sequencial de nota precisa ser inteiro positivo: ${String(sequence)}`);
  }
  return `NM-${String(sequence).padStart(6, '0')}`;
}

/** Se a nota está encerrada — situação e data combinam. */
export function noteIsClosed(note: MaintenanceNote): boolean {
  return note.status === 'encerrada' && note.closedAt !== null;
}

/**
 * Se a situação e a data de encerramento não se contradizem.
 *
 * Uma nota encerrada sem data e uma nota aberta com data de encerramento são
 * os dois jeitos de a lista de pendências mentir sobre o que falta fazer.
 */
export function noteStatusIsConsistent(note: MaintenanceNote): boolean {
  return note.status === 'encerrada' ? note.closedAt !== null : note.closedAt === null;
}

/**
 * Uma nota de origem `alarme` ou `ronda` precisa dizer de qual.
 *
 * Sem a referência, a origem é só um rótulo, e a tela de Notas não consegue
 * levar de volta ao registro que motivou a nota.
 */
export function noteOriginIsConsistent(note: MaintenanceNote): boolean {
  return note.origin === 'operação' ? note.originRef === null : note.originRef !== null;
}

export const MAINTENANCE_NOTE_PROVENANCE: ProvenanceNote = {
  source: 'B',
  note:
    'Campos da seção "Entidades de operação" da LISTA-BASE. O significado dos quatro níveis de ' +
    'prioridade, as quatro situações e a forma das evidências são suposição nossa — a lista pede ' +
    'os campos e não os valores.',
};
