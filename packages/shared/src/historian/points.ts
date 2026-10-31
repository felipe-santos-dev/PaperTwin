import { PROCESS_CATALOG } from '../process/catalog';
import { isLabTag } from '../process/lab';
import type { HistorianPoint } from './types';

/**
 * Os pontos do historiador, um por variável do catálogo.
 *
 * A lista sai do catálogo de processo, na ordem dele, e os ids são o índice
 * começando em 1. Dois motivos para derivar em vez de declarar:
 *
 * - **o catálogo é a fonte da verdade das tags**, e uma segunda lista escrita à
 *   mão divergiria na primeira tag nova;
 * - **o id tem de ser o mesmo em todo ambiente.** Se ele viesse de uma
 *   sequência do banco, a ordem de semeadura decidiria os ids, e o instantâneo
 *   do modo de demonstração — gerado numa máquina, servido de outra — passaria
 *   a apontar para os pontos errados.
 *
 * Os ensaios de laboratório **não** são pontos. A lista base diz: "sem malha,
 * sem compressão". Eles têm valor real e contínuo na simulação, mas o que o
 * laboratório conhece é a amostra do ensaio, não uma série arquivada.
 *
 * Hoje eles nunca estiveram no catálogo — moram na lista própria de `lab.ts` —
 * então o filtro abaixo não remove nada. Ele fica como guarda: se um dia uma
 * tag `LAB-` entrar no CSV, ela não vira ponto por acidente.
 */

function build(): HistorianPoint[] {
  const points: HistorianPoint[] = [];

  for (const variable of PROCESS_CATALOG) {
    if (isLabTag(variable.tag)) continue;

    points.push({
      pointId: points.length + 1,
      tag: variable.tag,
      unit: variable.unit,
      excDev: variable.compression.excDev,
      compDev: variable.compression.compDev,
    });
  }

  return points;
}

export const HISTORIAN_POINTS: readonly HistorianPoint[] = Object.freeze(build());

/**
 * O `point_id` é `smallint` na tabela, e um `smallint` chega a 32.767.
 *
 * A verificação é na carga porque o número de pontos cresce com o nº de
 * cilindros: 7 padrões por cilindro vezes o nº de cilindros do modelo. Com 36
 * cilindros são 320 pontos; o teto só chegaria com uns 4.600 cilindros, mas um
 * dia alguém expande o catálogo e é melhor falhar na importação do que estourar
 * a coluna numa inserção.
 */
const SMALLINT_MAX = 32_767;

if (HISTORIAN_POINTS.length > SMALLINT_MAX) {
  throw new Error(
    `O historiador tem ${String(HISTORIAN_POINTS.length)} pontos, e point_id é smallint ` +
      `(teto ${String(SMALLINT_MAX)}). Mude a coluna para integer na migration.`,
  );
}

const BY_TAG = new Map(HISTORIAN_POINTS.map((point) => [point.tag, point]));
const BY_ID = new Map(HISTORIAN_POINTS.map((point) => [point.pointId, point]));

/** O ponto de uma tag, ou `null` se a tag não é arquivada. */
export function historianPoint(tag: string): HistorianPoint | null {
  return BY_TAG.get(tag) ?? null;
}

/** O ponto de um id, ou `null`. */
export function historianPointById(pointId: number): HistorianPoint | null {
  return BY_ID.get(pointId) ?? null;
}

/** Se a tag é arquivada pelo historiador. */
export function isHistorianTag(tag: string): boolean {
  return BY_TAG.has(tag);
}

/** Os pontos que têm compressão configurada. */
export function compressedPoints(): HistorianPoint[] {
  return HISTORIAN_POINTS.filter((point) => point.excDev !== null || point.compDev !== null);
}
