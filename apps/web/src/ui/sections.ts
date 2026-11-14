import {
  assetByTag,
  bearingOfProcessTag,
  MP1,
  processVariable,
  type Alarm,
  type SectionId,
} from '@mp1/shared';

import { designPriority, type DesignPriority } from './priority';

/**
 * As dez seções da faixa do processo, na ordem da máquina.
 *
 * São as áreas do catálogo de processo, e não as seções do modelo 3D: o design
 * começa no preparo de massa, que não tem ativo na cena, e trata o QCS como
 * seção. O `id` é a área como o catálogo a escreve, e é por ele que a tela de
 * Processo filtra.
 */
export const PROCESS_AREAS = [
  { id: 'preparo', label: 'Preparo e refino' },
  { id: 'caixa', label: 'Caixa de entrada' },
  { id: 'formação', label: 'Formação' },
  { id: 'prensas', label: 'Prensas' },
  { id: 'pré-secagem', label: 'Pré-secagem' },
  { id: 'speed sizer', label: 'Speed Sizer' },
  { id: 'pós-secagem', label: 'Pós-secagem' },
  { id: 'calandra', label: 'Calandra' },
  { id: 'qcs', label: 'QCS' },
  { id: 'pope', label: 'Enroladeira' },
] as const;

export type ProcessArea = (typeof PROCESS_AREAS)[number]['id'];

const AREA_IDS = new Set<string>(PROCESS_AREAS.map((area) => area.id));

/** A área da faixa que corresponde a uma seção do modelo 3D. */
const AREA_OF_SECTION: Readonly<Partial<Record<SectionId, ProcessArea>>> = {
  headbox: 'caixa',
  forming: 'formação',
  press: 'prensas',
  'pre-dryer': 'pré-secagem',
  'scanner-1': 'qcs',
  'speed-sizer': 'speed sizer',
  'post-dryer': 'pós-secagem',
  calender: 'calandra',
  'scanner-2': 'qcs',
  'pope-reel': 'pope',
};

/**
 * A seção de uma TAG de processo.
 *
 * TAG do catálogo vai pela área dela. Medição de mancal (`VI-51nnB`, `TI-53nnA`)
 * fica na área `mancais` do catálogo, que não é seção da máquina — essa vai pela
 * seção do cilindro a que o mancal pertence, e é assim que o `VI-5123B` aparece
 * na pré-secagem.
 */
export function areaOfTag(tag: string): ProcessArea | null {
  const bearing = bearingOfProcessTag(tag);
  if (bearing) {
    const section = assetByTag(MP1, bearing.assetTag)?.section;
    return section ? (AREA_OF_SECTION[section] ?? null) : null;
  }

  const area = processVariable(tag)?.area;
  return area && AREA_IDS.has(area) ? (area as ProcessArea) : null;
}

/** Um alarme ainda em pé: ativo ou reconhecido, sem ter normalizado. */
export function isStanding(alarm: Alarm): boolean {
  return alarm.state !== 'normalizado' && alarm.clearedAt === null;
}

export interface SectionState {
  readonly id: ProcessArea;
  readonly label: string;
  /** O que está fora, uma entrada por TAG, da prioridade mais alta para a mais baixa. */
  readonly out: readonly { readonly tag: string; readonly priority: DesignPriority }[];
}

/**
 * O estado de cada seção a partir dos alarmes em pé.
 *
 * Uma TAG com mais de um alarme (H e HH, por exemplo) conta uma vez, pela pior
 * prioridade. Empate de prioridade sai pelo alarme mais antigo primeiro, que é
 * o que está há mais tempo pedindo atenção.
 */
export function sectionStates(alarms: readonly Alarm[]): SectionState[] {
  const byArea = new Map<ProcessArea, Map<string, { priority: DesignPriority; since: number }>>();

  for (const alarm of alarms) {
    if (!isStanding(alarm)) continue;
    const area = areaOfTag(alarm.tag);
    if (!area) continue;

    const tags = byArea.get(area) ?? new Map();
    const priority = designPriority(alarm.priority);
    const since = Date.parse(alarm.raisedAt);
    const known = tags.get(alarm.tag);
    if (
      !known ||
      priority < known.priority ||
      (priority === known.priority && since < known.since)
    ) {
      tags.set(alarm.tag, { priority, since });
    }
    byArea.set(area, tags);
  }

  return PROCESS_AREAS.map(({ id, label }) => {
    const tags = byArea.get(id) ?? new Map<string, { priority: DesignPriority; since: number }>();
    const out = [...tags.entries()]
      .sort(([, a], [, b]) => a.priority - b.priority || a.since - b.since)
      .map(([tag, { priority }]) => ({ tag, priority }));
    return { id, label, out };
  });
}

/** Quantos alarmes em pé há em cada prioridade, para os contadores do topo. */
export function alarmCounts(alarms: readonly Alarm[]): Record<DesignPriority, number> {
  const counts: Record<DesignPriority, number> = { 1: 0, 2: 0, 3: 0 };
  for (const alarm of alarms) {
    if (isStanding(alarm)) counts[designPriority(alarm.priority)] += 1;
  }
  return counts;
}
