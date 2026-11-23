import type { ProvenanceNote } from './provenance';

/**
 * O ensaio de laboratório como **evento**.
 *
 * Até a Fase 6 o laboratório era dado fixo no front: uma tabela de resultados
 * plausíveis, com o selo de ilustrativo. Faltava o que distingue um ensaio de
 * um número numa tela — ele acontece num instante, numa amostra cortada de uma
 * bobina, e o resultado só fica pronto **depois**.
 *
 * Esses dois instantes são o que faz o sensor virtual existir. Entre a amostra
 * e o laudo o papel já foi enrolado, e entre um laudo e o próximo a operação
 * está sem medida nenhuma — é esse buraco que a estimativa preenche.
 *
 * ## Um ensaio por enquanto
 *
 * Só a tração MD (`LAB-1206`) vira evento nesta fase. É o ensaio que a
 * pesquisa liga a uma variável de processo por uma relação medida (a relação 9,
 * refino → tração), e é por isso que ele é o primeiro: sem relação declarada, a
 * estimativa não teria de onde sair. Os outros 18 continuam ilustrativos, e a
 * tela diz qual é qual.
 */

export interface LabResult {
  /** `LR-<bobina>-<tag>`: derivado, porque a amostra é uma por bobina. */
  readonly id: string;
  /** TAG do ensaio em `LAB_VARIABLES`. */
  readonly tag: string;
  /** A bobina de onde a amostra foi cortada. */
  readonly reelNumber: number;
  readonly value: number;
  readonly unit: string;
  /** Quando a amostra foi cortada — o fim da bobina. */
  readonly sampledAt: string;
  /** Quando o laudo ficou pronto. */
  readonly reportedAt: string;
  /** `null` quando o ensaio não tem faixa numérica declarada. */
  readonly withinSpec: boolean | null;
}

/**
 * Quanto tempo o ensaio leva, da amostra ao laudo.
 *
 * **Suposição.** Vinte e cinco minutos é o que leva condicionar o corpo de
 * prova e rodar o dinamômetro, com a fila da bancada. O número importa menos
 * que o fato de existir: é ele que cria o intervalo em que a operação não tem
 * medida — e é esse intervalo que a estimativa preenche.
 */
export const LAB_ANALYSIS_MINUTES = 25;

/**
 * A faixa da tração MD, em kN/m.
 *
 * **Suposição.** A §12.2 da pesquisa dá o alvo (5,2 MD) e não dá a faixa; estes
 * limites são os mesmos que a tela de Laboratório já usava como ilustrativos,
 * promovidos a número de verdade agora que o ensaio virou entidade.
 */
export const MD_TENSILE_SPEC = {
  tag: 'LAB-1206',
  unit: 'kN/m',
  lo: 4.6,
  hi: 6.0,
  target: 5.2,
} as const;

/** O id de um resultado: a bobina e o ensaio, porque é uma amostra por bobina. */
export function labResultId(reelNumber: number, tag: string): string {
  return `LR-${String(reelNumber)}-${tag}`;
}

/** Se o resultado está dentro da faixa declarada do ensaio. */
export function labWithinSpec(tag: string, value: number): boolean | null {
  if (tag !== MD_TENSILE_SPEC.tag) return null;
  return value >= MD_TENSILE_SPEC.lo && value <= MD_TENSILE_SPEC.hi;
}

/** Se o laudo já estava pronto num instante. */
export function labReported(result: LabResult, at: Date | number): boolean {
  const instant = typeof at === 'number' ? at : at.getTime();
  return Date.parse(result.reportedAt) <= instant;
}

export const LAB_RESULT_PROVENANCE: ProvenanceNote = {
  source: 'B',
  note:
    'O ensaio, a unidade e o alvo saem da §12.2 da pesquisa B. O atraso de análise de 25 min e ' +
    'os limites de 4,6 a 6,0 kN/m são suposição nossa — a pesquisa dá o alvo e não dá a faixa.',
};
