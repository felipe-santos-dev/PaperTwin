/**
 * De onde vem o desenho de cada entidade de operação.
 *
 * Este é o **terceiro** vocabulário de proveniência do projeto, e os três são
 * separados de propósito:
 *
 * - `machine/provenance.ts` → `validated` / `assumed`: se a medida foi conferida
 *   contra a MP1 de verdade.
 * - `process/types.ts` → `B` / `ISO 20816-3` / `assumed`: em qual documento o
 *   número da variável foi lido. É o vocabulário da coluna `fonte` do CSV, e
 *   só pode ter os valores que o CSV tem — o gerador valida contra isso.
 * - aqui → `B` / `ISA-18.2` / `assumed`: de onde veio o **campo** da entidade.
 *
 * O que força a separação é o alarme. Os seus estados e horários saem da
 * LISTA-BASE, mas a taxa de inundação e a exigência de banda morta saem da
 * ISA-18.2 — norma que o catálogo de variáveis nunca cita, porque lá a norma
 * que aparece é a ISO 20816-3, de vibração. Juntar os dois vocabulários daria
 * uma lista de fontes em que metade dos valores nunca ocorre num dos lados.
 */
export type OperationSource = 'B' | 'ISA-18.2' | 'assumed';

export interface ProvenanceNote {
  readonly source: OperationSource;
  readonly note: string;
}

/** Atalho para o caso comum: campo lido da LISTA-BASE. */
export const FROM_LISTA_BASE: ProvenanceNote = {
  source: 'B',
  note: 'Campos da seção "Entidades de operação" da LISTA-BASE.',
};

/** A proveniência de cada entidade, para a lista de pendências do README. */
export interface EntityProvenance extends ProvenanceNote {
  /** Nome da entidade em português, ex.: `Bobina jumbo`. */
  readonly entity: string;
}
