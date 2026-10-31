import type { SectionId } from '../asset';
import { POST_DRYER_PAIRS, PRE_DRYER_PAIRS } from './geometry';

/**
 * A divisão dos cilindros secadores em grupos de vapor.
 *
 * Um grupo é o conjunto de cilindros alimentado pela mesma válvula de vapor,
 * com o seu próprio ΔP de sifões e o seu tanque separador de condensado. É a
 * unidade em que a secagem é operada: ninguém ajusta um cilindro, ajusta um
 * grupo.
 *
 * Aqui mora só a **divisão** — quais cilindros, em qual seção. As tags de
 * processo de cada grupo ficam em `process/steam-groups.ts`, resolvidas contra
 * o catálogo, porque as duas coisas têm proveniência diferente: a divisão é
 * suposição nossa, o mapa de tags sai da pesquisa B.
 *
 * Este módulo não importa o modelo da máquina, e por isso pode ser importado
 * por ele: `mp1.ts` precisa de `steamGroupOfCylinder` para montar as tags dos
 * cilindros.
 */

/** Seção em que um grupo de vapor pode estar. */
export type DryingSection = Extract<SectionId, 'pre-dryer' | 'post-dryer'>;

/** Um grupo de vapor como faixa de cilindros. */
export interface SteamGroupRange {
  /** Id curto, como aparece na tag do ativo: `G4` em `MP1-SEC-G4-CS23`. */
  readonly id: string;
  /** Primeiro cilindro do grupo, inclusive. */
  readonly from: number;
  /** Último cilindro do grupo, inclusive. */
  readonly to: number;
  readonly section: DryingSection;
}

/**
 * Nº de cilindros secadores: dois por par, numerados em sequência contínua da
 * pré-secagem para a pós-secagem.
 *
 * Derivado dos pares em vez de escrito como 36: o nº de pares é suposição, e
 * quando ele mudar a numeração e as faixas dos grupos têm de acompanhar juntas
 * — é o que a verificação de cobertura abaixo cobra.
 */
export const DRYER_CYLINDER_COUNT = (PRE_DRYER_PAIRS + POST_DRYER_PAIRS) * 2;

/** Último cilindro da pré-secagem; o seguinte já é da pós. */
export const LAST_PRE_DRYER_CYLINDER = PRE_DRYER_PAIRS * 2;

/**
 * As faixas dos seis grupos, como a lista base do simulador escreve.
 *
 * **Suposição**, junto com o nº de pares que fixa os limites. O único ponto fixo
 * é o CS23 estar no G4, porque a tag `MP1-SEC-G4-CS23-MLA` aparece no conceito
 * de tela de monitoramento. A divisão real sai do mapa de rolos.
 */
export const DRYER_STEAM_GROUPS: readonly SteamGroupRange[] = Object.freeze([
  { id: 'G1', from: 1, to: 6, section: 'pre-dryer' },
  { id: 'G2', from: 7, to: 12, section: 'pre-dryer' },
  { id: 'G3', from: 13, to: 18, section: 'pre-dryer' },
  { id: 'G4', from: 19, to: 26, section: 'pre-dryer' },
  { id: 'G5', from: 27, to: 32, section: 'post-dryer' },
  { id: 'G6', from: 33, to: 36, section: 'post-dryer' },
] as const satisfies readonly SteamGroupRange[]);

/**
 * A seção a que um nº de cilindro pertence, pela numeração.
 *
 * A fronteira é o nº de pares da pré-secagem, e não uma lista escrita à mão: a
 * numeração é contínua e muda junto com os pares.
 */
export function sectionOfCylinder(cylinder: number): DryingSection {
  return cylinder <= LAST_PRE_DRYER_CYLINDER ? 'pre-dryer' : 'post-dryer';
}

/**
 * Duas invariantes que precisam valer para o modelo fazer sentido, verificadas
 * ao carregar o módulo.
 *
 * 1. **Cobertura contígua de 1 a `DRYER_CYLINDER_COUNT`.** Sem isso um cilindro
 *    ficaria sem grupo — e `mp1.ts` monta a tag dele a partir do grupo, então o
 *    ativo simplesmente não existiria, ou existiria com uma tag duplicada se
 *    duas faixas se sobrepusessem.
 * 2. **Grupo contido numa seção.** Um grupo é alimentado por uma válvula de
 *    vapor, que fica numa das duas secagens: `PIC-51x` na pré, `PIC-71x` na
 *    pós. Uma faixa que atravessasse a fronteira não teria tag de pressão.
 *
 * Falhar no carregamento é de propósito: estes dois erros são de edição do
 * modelo, não de entrada do usuário, e um modelo incoerente não deve chegar a
 * subir um servidor.
 */
function assertCoverage(groups: readonly SteamGroupRange[]): void {
  if (groups.length === 0) throw new Error('Nenhum grupo de vapor declarado.');

  let expected = 1;

  for (const group of groups) {
    if (group.from !== expected) {
      throw new Error(
        `Grupos de vapor com furo ou sobreposição: ${group.id} começa no cilindro ` +
          `${String(group.from)}, e o esperado era ${String(expected)}. ` +
          'As faixas precisam cobrir 1 a ' +
          `${String(DRYER_CYLINDER_COUNT)} sem buraco e sem repetir.`,
      );
    }
    if (group.to < group.from) {
      throw new Error(`Grupo de vapor ${group.id} termina antes de começar.`);
    }
    if (
      sectionOfCylinder(group.from) !== group.section ||
      sectionOfCylinder(group.to) !== group.section
    ) {
      throw new Error(
        `Grupo de vapor ${group.id} (cilindros ${String(group.from)}–${String(group.to)}) ` +
          `está declarado na seção ${group.section}, mas atravessa a fronteira entre ` +
          `pré-secagem e pós-secagem, que está no cilindro ${String(LAST_PRE_DRYER_CYLINDER)}. ` +
          'Um grupo é uma válvula de vapor, e a válvula fica numa seção só.',
      );
    }
    expected = group.to + 1;
  }

  if (expected - 1 !== DRYER_CYLINDER_COUNT) {
    throw new Error(
      `Os grupos de vapor cobrem até o cilindro ${String(expected - 1)}, mas a secagem tem ` +
        `${String(DRYER_CYLINDER_COUNT)} cilindros (${String(PRE_DRYER_PAIRS)} + ` +
        `${String(POST_DRYER_PAIRS)} pares). Mudar o nº de pares exige refazer as faixas.`,
    );
  }
}

assertCoverage(DRYER_STEAM_GROUPS);

const BY_CYLINDER = new Map<number, SteamGroupRange>();
for (const group of DRYER_STEAM_GROUPS) {
  for (let cylinder = group.from; cylinder <= group.to; cylinder += 1) {
    BY_CYLINDER.set(cylinder, group);
  }
}

const BY_ID = new Map(DRYER_STEAM_GROUPS.map((group) => [group.id, group]));

/** O id do grupo de vapor de um cilindro, ex.: 23 → `G4`. */
export function steamGroupOfCylinder(cylinder: number): string {
  const group = BY_CYLINDER.get(cylinder);
  if (!group) throw new Error(`Cilindro secador ${String(cylinder)} fora dos grupos conhecidos`);
  return group.id;
}

/** A faixa de um grupo pelo id, ou `null` se não existir. */
export function steamGroupRange(id: string): SteamGroupRange | null {
  return BY_ID.get(id) ?? null;
}

/** Os nºs de cilindro de um grupo, em ordem. */
export function cylindersOfSteamGroup(id: string): number[] {
  const group = steamGroupRange(id);
  if (!group) return [];

  return Array.from({ length: group.to - group.from + 1 }, (_, index) => group.from + index);
}
