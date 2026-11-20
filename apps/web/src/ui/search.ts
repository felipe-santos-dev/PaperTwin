import { assetByTag, monitoredAssets, MP1, PROCESS_CATALOG } from '@mp1/shared';
import type { MaintenanceNote } from '@mp1/shared';

import { FIXED_VARIABLES } from '../api/fixtures';
import type { ReelView } from '../api/process';
import { hhmm } from './format';
import { SCREENS } from './screens';
import { areaOfAsset, PROCESS_AREAS } from './sections';

/**
 * O índice da busca, montado em memória.
 *
 * Nenhuma biblioteca: são pouco mais de 400 linhas de texto curto, e varrer
 * isso a cada tecla custa menos do que o navegador leva para desenhar a lista.
 * Um índice invertido aqui seria engenharia para um problema que não existe.
 *
 * O índice tem duas metades. A **estática** — telas, TAGs do catálogo, as
 * variáveis fixas do preparo e os mancais — sai do que já está no pacote e não
 * depende de rede. A **dinâmica** — bobinas e notas — depende do portão, e por
 * isso é carregada na primeira vez que alguém abre a busca: quem nunca busca
 * não paga por ela.
 */

export type SearchKind = 'tela' | 'tag' | 'mancal' | 'bobina' | 'nota';

export interface SearchItem {
  readonly kind: SearchKind;
  /**
   * O que o abridor recebe: id da tela, TAG de processo, tag do ativo, número
   * da bobina ou número da nota.
   */
  readonly id: string;
  /** O nome, como a pessoa o conhece. */
  readonly label: string;
  /** Onde isso vive: área, seção, turno. Entra na busca também. */
  readonly detail: string;
}

export const KIND_LABEL: Readonly<Record<SearchKind, string>> = {
  tela: 'Telas',
  tag: 'TAGs',
  mancal: 'Mancais',
  bobina: 'Bobinas',
  nota: 'Notas',
};

/** A ordem em que os grupos aparecem, quando a pontuação empata. */
const KIND_ORDER: readonly SearchKind[] = ['tela', 'tag', 'mancal', 'bobina', 'nota'];

const AREA_LABEL = new Map(PROCESS_AREAS.map((area) => [area.id as string, area.label]));

/**
 * Minúsculas e sem acento.
 *
 * Quem procura "pre-secagem" com o teclado no automático não pode ficar sem
 * resposta porque a área se escreve "pré-secagem".
 */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Telas, TAGs e mancais: o que não depende de rede. */
export function staticIndex(): SearchItem[] {
  const items: SearchItem[] = [];

  for (const screen of SCREENS) {
    items.push({
      kind: 'tela',
      id: screen.id,
      label: screen.label,
      // a tela sem tecla continua buscável: é o único caminho de teclado até ela
      detail: screen.key === null ? 'tela' : `tela · tecla ${screen.key}`,
    });
  }

  for (const variable of [...PROCESS_CATALOG, ...FIXED_VARIABLES]) {
    const area = AREA_LABEL.get(variable.area) ?? variable.area;
    items.push({
      kind: 'tag',
      id: variable.tag,
      label: variable.name,
      detail: `${area} · ${variable.group} · ${variable.unit}`,
    });
  }

  for (const asset of monitoredAssets(MP1)) {
    if (asset.kind !== 'bearing') continue;
    const parent = asset.parentTag ? assetByTag(MP1, asset.parentTag) : null;
    const area = areaOfAsset(asset.tag);
    const where = area ? (AREA_LABEL.get(area) ?? area) : asset.section;
    items.push({
      kind: 'mancal',
      id: asset.tag,
      label: parent ? `${parent.label} · lado ${asset.side ?? '?'}` : asset.label,
      detail: `mancal · ${where}${asset.steamGroup ? ` · ${asset.steamGroup}` : ''}`,
    });
  }

  return items;
}

/** Bobinas e notas, que vêm do portão. */
export function dynamicIndex(
  reels: readonly ReelView[],
  notes: readonly MaintenanceNote[],
): SearchItem[] {
  const items: SearchItem[] = [];

  for (const reel of reels) {
    const destino = reel.disposition ?? (reel.endedAt === null ? 'em formação' : 'sem destino');
    const janela = `${hhmm(reel.startedAt)}${reel.endedAt === null ? '' : `–${hhmm(reel.endedAt)}`}`;
    items.push({
      kind: 'bobina',
      id: String(reel.number),
      label: `Bobina ${String(reel.number)}`,
      detail: `${janela} · ${destino}`,
    });
  }

  for (const note of notes) {
    const asset = assetByTag(MP1, note.assetTag);
    items.push({
      kind: 'nota',
      id: note.number,
      label: `${note.number} · ${note.symptom}`,
      detail: `${asset?.label ?? note.assetTag} · ${note.status} · prioridade ${String(note.priority)}`,
    });
  }

  return items;
}

/**
 * Pontuação de um item para a consulta.
 *
 * Menor é melhor, e `null` é "não serve". A regra é simples de explicar, que é
 * o que importa quando alguém reclama de um resultado: **todos** os pedaços da
 * consulta têm de aparecer em algum lugar do item, e quem casa pelo começo da
 * TAG vem antes de quem casa no meio de uma descrição.
 */
export function score(item: SearchItem, terms: readonly string[]): number | null {
  const id = fold(item.id);
  const label = fold(item.label);
  const detail = fold(item.detail);
  const all = `${id} ${label} ${detail}`;

  if (!terms.every((term) => all.includes(term))) return null;

  const first = terms[0] ?? '';
  if (id === first) return 0;
  if (id.startsWith(first)) return 1;
  if (label.startsWith(first)) return 2;
  if (id.includes(first)) return 3;
  if (label.includes(first)) return 4;
  return 5;
}

/** Os melhores resultados para a consulta, já ordenados. */
export function search(
  items: readonly SearchItem[],
  query: string,
  limit = 12,
): readonly SearchItem[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const hits: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const value = score(item, terms);
    if (value !== null) hits.push({ item, score: value });
  }

  hits.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const kind = KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind);
    if (kind !== 0) return kind;
    return a.item.id.localeCompare(b.item.id, 'pt-BR', { numeric: true });
  });

  return hits.slice(0, limit).map((hit) => hit.item);
}
