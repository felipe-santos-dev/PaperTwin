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

/**
 * A tolerância da gramatura é uma **fração do alvo**, não um par de números.
 *
 * O catálogo traz `AIC-902` com L/H em 73,5–76,5 e a nota "tolerância de
 * laboratório 73.5–76.5". Isso está certo para a gramatura de 75 g/m², que é o
 * alvo que o catálogo declara — e passa a estar errado no minuto seguinte a uma
 * troca para 80. A tela de Bobinas mostrava exatamente isso: depois da troca de
 * 75 para 80, a folha de 80 g/m² aparecia inteira fora de uma tolerância de
 * 73,5–76,5 que já não era a dela.
 *
 * 73,5 e 76,5 são 75 menos e mais 2 %. É essa fração que é a regra; os dois
 * números do catálogo são ela avaliada no alvo de lá. Com o alvo em vigor, a
 * tolerância segue a gramatura: 80 g/m² dá 78,4–81,6.
 */
export const GSM_TOLERANCE_FRACTION = 0.02;

/** A tolerância de uma gramatura, em g/m²: o alvo ± 2 %. */
export function gsmTolerance(gsm: number): readonly [number, number] {
  const slack = gsm * GSM_TOLERANCE_FRACTION;
  return [gsm - slack, gsm + slack];
}

/**
 * A gramatura em vigor num instante, pelas trocas registradas.
 *
 * Depois de uma troca vale a gramatura de entrada; antes da troca mais antiga
 * que se conhece, vale a de saída dela — que é o que a máquina estava fazendo.
 * Sem troca nenhuma na lista, vale o alvo que quem chama já tem (o do catálogo,
 * na prática).
 *
 * O instante de corte é o **início** da troca, e não a estabilização: a partir
 * do momento em que o setpoint muda, a folha que sai é da gramatura nova, ainda
 * que leve alguns minutos para entrar na faixa dela. É por isso que a bobina
 * que pega a transição é rebaixada em vez de medida contra a tolerância antiga.
 */
export function gradeInForceAt(
  changes: readonly GradeChange[],
  at: number,
  fallbackGsm: number,
): number {
  const ordered = [...changes].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const first = ordered[0];
  if (!first) return fallbackGsm;
  if (at < Date.parse(first.startedAt)) return first.fromGsm;

  let gsm = first.toGsm;
  for (const change of ordered) {
    if (Date.parse(change.startedAt) <= at) gsm = change.toGsm;
    else break;
  }
  return gsm;
}

export const GRADE_CHANGE_PROVENANCE: ProvenanceNote = FROM_LISTA_BASE;
