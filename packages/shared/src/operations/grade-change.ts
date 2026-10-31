import { FROM_LISTA_BASE, type ProvenanceNote } from './provenance';

/**
 * A troca de gramatura — a transição que custa papel.
 *
 * Da LISTA-BASE: de/para, início, estabilização e bobinas afetadas.
 *
 * Os dois instantes são distintos e nenhum dos dois é dispensável. O início é
 * quando o setpoint muda; a estabilização é quando o QCS volta a ficar dentro
 * da tolerância. Entre os dois a folha existe, é enrolada e vai para uma
 * bobina que depois é rebaixada — por isso a lista de bobinas afetadas é campo
 * da troca, e não um cálculo feito na tela: quem decide se a bobina foi
 * afetada é quem a inspecionou.
 *
 * O tempo entre os dois é o que as relações da pesquisa B explicam: a gramatura
 * responde à válvula de massa com 75 s de tempo morto e τ de 23 s (relação 1),
 * mas a umidade vai atrás com τ de 45 s na pós-secagem (relação 5), e é a
 * última a entrar na faixa que define a estabilização.
 */

/** Uma troca de gramatura. */
export interface GradeChange {
  /** Id determinístico: `TG-<instante em segundos>`. */
  readonly id: string;
  readonly shiftId: string;
  /** Gramatura de saída, em g/m². */
  readonly fromGsm: number;
  /** Gramatura de entrada, em g/m². */
  readonly toGsm: number;
  readonly startedAt: string;
  /** Quando o QCS voltou à tolerância; `null` enquanto a transição corre. */
  readonly stabilizedAt: string | null;
  /** Números das bobinas jumbo que pegaram a transição. */
  readonly affectedReels: readonly number[];
}

/** Quanto a gramatura mudou, em g/m². Negativo quando a folha ficou mais leve. */
export function gradeChangeStepGsm(change: GradeChange): number {
  return change.toGsm - change.fromGsm;
}

/** Quanto levou para estabilizar, em segundos; `null` enquanto não estabilizou. */
export function stabilizationS(change: GradeChange): number | null {
  if (change.stabilizedAt === null) return null;
  return (Date.parse(change.stabilizedAt) - Date.parse(change.startedAt)) / 1000;
}

export const GRADE_CHANGE_PROVENANCE: ProvenanceNote = FROM_LISTA_BASE;
