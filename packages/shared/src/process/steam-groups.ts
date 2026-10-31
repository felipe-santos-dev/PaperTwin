import type { AssetTag } from '../asset';
import { MP1 } from '../machine/mp1';
import type { Source } from '../machine/provenance';
import { dryerCylinders } from '../machine/query';
import {
  cylindersOfSteamGroup,
  DRYER_STEAM_GROUPS,
  type DryingSection,
  type SteamGroupRange,
} from '../machine/steam-groups';
import { processVariable } from './catalog';
import type { ProcessVariable, VariableSource } from './types';

/**
 * Os grupos de vapor da secagem, com as suas tags resolvidas.
 *
 * O grupo é a unidade em que a secagem é operada, e por isso é dado de primeira
 * classe e não um texto no campo `steamGroup` de um ativo: ele tem uma válvula
 * de pressão, um ΔP de sifões, um tanque separador e uma lista de cilindros.
 *
 * As tags são **resolvidas contra o catálogo** em tempo de carga, não só
 * escritas aqui. Se uma linha sair de `catalogo-base.csv` ou mudar de nome, a
 * montagem falha na importação, em vez de o grupo ficar com uma tag que não
 * existe e a tela mostrar um traço.
 *
 * A proveniência vem separada em duas, porque as duas metades do grupo têm
 * origens diferentes e vocabulários diferentes:
 *
 * - **a divisão** (quais cilindros) é suposição nossa, no vocabulário do modelo
 *   da máquina (`validated` / `assumed`);
 * - **o mapa de tags** (qual válvula, qual sifão, qual tanque) sai da pesquisa
 *   B, no vocabulário do catálogo (`B` / `ISO 20816-3` / `assumed`).
 *
 * Juntar as duas num campo só faria o mapa de tags, que é medido, herdar o
 * `assumed` da divisão, que é chute.
 */

/** Proveniência da divisão em grupos, no vocabulário do modelo da máquina. */
export interface DivisionProvenance {
  readonly source: Source;
  readonly note: string;
}

/** Proveniência do mapa de tags, no vocabulário do catálogo de processo. */
export interface TagMapProvenance {
  readonly source: VariableSource;
  readonly note: string;
}

/**
 * A divisão é suposição, e continua sendo até o mapa de rolos.
 *
 * O detalhamento está em `ARRANGEMENTS.DRYER_STEAM_GROUPS`; aqui fica a versão
 * curta que acompanha cada grupo na API e na tela.
 */
export const DIVISION_PROVENANCE: DivisionProvenance = {
  source: 'assumed',
  note:
    'A divisão em seis grupos e os seus limites são suposição do protótipo, junto com o nº de ' +
    'pares de cilindros. O único ponto fixo é o CS23 estar no G4. A divisão real sai do mapa de rolos.',
};

/** O mapa de tags sai da pesquisa B, via catálogo. */
export const TAG_MAP_PROVENANCE: TagMapProvenance = {
  source: 'B',
  note:
    'As tags de pressão, ΔP de sifões e nível de condensado saem do catálogo da lista base, ' +
    'que as lê da pesquisa B. O que a pesquisa não dá é o tanque separador da pós-secagem.',
};

/**
 * Por que a pós-secagem fica sem tag de nível de condensado.
 *
 * Não é que o G5 e o G6 não tenham tanque separador — toda alimentação de vapor
 * tem. É que a pesquisa B só dá tag de nível para os quatro tanques da
 * pré-secagem (`LIC-531`…`LIC-534`) e não dá nenhuma para a pós, embora dê o ΔP
 * dos sifões dos dois grupos (`PDIC-721`, `PDIC-722`).
 *
 * Então o campo é `null` explícito com esta nota, e não uma tag inventada:
 * inventar `LIC-731` daria ao simulador um número que ninguém mediu, com a cara
 * dos outros quatro. `null` diz a verdade — este grupo não tem essa medição no
 * catálogo — e a tela sabe mostrar "sem medição" em vez de um traço sem motivo.
 */
export const CONDENSATE_TANK_NOTE =
  'A pesquisa B não dá tag de nível para o tanque separador da pós-secagem, só o ΔP dos ' +
  'sifões. O tanque existe na máquina; a medição não está no catálogo.';

/** O mapa de tags de um grupo, antes de ser resolvido contra o catálogo. */
interface SteamGroupTags {
  readonly id: string;
  /** O papel do grupo na secagem, como a pesquisa B o nomeia. */
  readonly role: string | null;
  /** Pressão de vapor do grupo — a válvula. */
  readonly pressure: string;
  /** ΔP dos sifões, que diz se o condensado está saindo. */
  readonly siphonDeltaP: string;
  /** Nível do tanque separador de condensado; `null` quando não há tag. */
  readonly condensateLevel: string | null;
}

/**
 * As tags de cada grupo, como a lista base as numera.
 *
 * Pré-secagem: `51x` para vapor, `52x` para ΔP, `53x` para nível. Pós-secagem:
 * `71x` para vapor e `72x` para ΔP, sem nível.
 */
const TAGS: readonly SteamGroupTags[] = [
  {
    id: 'G1',
    role: 'aquecimento',
    pressure: 'PIC-511',
    siphonDeltaP: 'PDIC-521',
    condensateLevel: 'LIC-531',
  },
  {
    id: 'G2',
    role: null,
    pressure: 'PIC-512',
    siphonDeltaP: 'PDIC-522',
    condensateLevel: 'LIC-532',
  },
  {
    id: 'G3',
    role: null,
    pressure: 'PIC-513',
    siphonDeltaP: 'PDIC-523',
    condensateLevel: 'LIC-533',
  },
  {
    id: 'G4',
    role: 'grupo principal',
    pressure: 'PIC-514',
    siphonDeltaP: 'PDIC-524',
    condensateLevel: 'LIC-534',
  },
  { id: 'G5', role: null, pressure: 'PIC-711', siphonDeltaP: 'PDIC-721', condensateLevel: null },
  { id: 'G6', role: null, pressure: 'PIC-712', siphonDeltaP: 'PDIC-722', condensateLevel: null },
];

/** Um grupo de vapor com tudo que ele tem: cilindros, tags e proveniência. */
export interface SteamGroup {
  readonly id: string;
  /** Rótulo para a interface, ex.: `Grupo de vapor G4 · grupo principal`. */
  readonly label: string;
  /** O papel do grupo, quando a pesquisa o nomeia; `null` nos demais. */
  readonly role: string | null;
  readonly section: DryingSection;
  /** Nºs dos cilindros do grupo, em ordem. */
  readonly cylinders: readonly number[];
  /** Tags dos cilindros no modelo da máquina, na mesma ordem. */
  readonly cylinderTags: readonly AssetTag[];
  /** Tags dos mancais dos cilindros do grupo, LA e LC. */
  readonly bearingTags: readonly AssetTag[];
  readonly pressure: ProcessVariable;
  readonly siphonDeltaP: ProcessVariable;
  /** Nível do tanque separador; `null` no G5 e no G6. */
  readonly condensateLevel: ProcessVariable | null;
  /** Por que não há nível, quando não há; `null` quando há. */
  readonly condensateNote: string | null;
  readonly division: DivisionProvenance;
  readonly tagMap: TagMapProvenance;
}

function resolve(tag: string, groupId: string, role: string): ProcessVariable {
  const variable = processVariable(tag);
  if (!variable) {
    throw new Error(
      `O grupo de vapor ${groupId} aponta ${role} na tag ${tag}, que não existe no catálogo. ` +
        'Ou a linha voltou para catalogo-base.csv, ou o mapa de tags dos grupos é corrigido.',
    );
  }
  return variable;
}

function build(range: SteamGroupRange): SteamGroup {
  const tags = TAGS.find((item) => item.id === range.id);
  if (!tags) {
    throw new Error(
      `O grupo de vapor ${range.id} está na divisão do modelo mas não tem mapa de tags. ` +
        'Todo grupo precisa de uma válvula de pressão e de um ΔP de sifões.',
    );
  }

  const cylinders = cylindersOfSteamGroup(range.id);
  const assets = dryerCylinders(MP1).filter(({ asset }) => asset.steamGroup === range.id);

  if (assets.length !== cylinders.length) {
    throw new Error(
      `O grupo de vapor ${range.id} declara ${String(cylinders.length)} cilindros, mas o modelo ` +
        `da máquina tem ${String(assets.length)} com esse grupo.`,
    );
  }

  for (const { number, asset } of assets) {
    if (asset.section !== range.section) {
      throw new Error(
        `O cilindro ${String(number)} está no grupo ${range.id}, declarado na seção ` +
          `${range.section}, mas o ativo ${asset.tag} está na seção ${asset.section}. ` +
          'Um grupo de vapor não atravessa seção.',
      );
    }
  }

  const condensateLevel =
    tags.condensateLevel === null
      ? null
      : resolve(tags.condensateLevel, range.id, 'o nível de condensado');

  return {
    id: range.id,
    label: tags.role ? `Grupo de vapor ${range.id} · ${tags.role}` : `Grupo de vapor ${range.id}`,
    role: tags.role,
    section: range.section,
    cylinders,
    cylinderTags: assets.map(({ asset }) => asset.tag),
    bearingTags: assets.flatMap(({ asset }) => [`${asset.tag}-MLA`, `${asset.tag}-MLC`]),
    pressure: resolve(tags.pressure, range.id, 'a pressão de vapor'),
    siphonDeltaP: resolve(tags.siphonDeltaP, range.id, 'o ΔP dos sifões'),
    condensateLevel,
    condensateNote: condensateLevel === null ? CONDENSATE_TANK_NOTE : null,
    division: DIVISION_PROVENANCE,
    tagMap: TAG_MAP_PROVENANCE,
  };
}

/** Os seis grupos de vapor, na ordem do processo. */
export const STEAM_GROUPS: readonly SteamGroup[] = Object.freeze(DRYER_STEAM_GROUPS.map(build));

const BY_ID = new Map(STEAM_GROUPS.map((group) => [group.id, group]));

/** Um grupo pelo id, ou `null`. */
export function steamGroup(id: string): SteamGroup | null {
  return BY_ID.get(id) ?? null;
}

/** O grupo a que um cilindro pertence, ou `null` se o nº não existir. */
export function steamGroupOfCylinderNumber(cylinder: number): SteamGroup | null {
  return STEAM_GROUPS.find((group) => group.cylinders.includes(cylinder)) ?? null;
}

/** Os grupos de uma das duas secagens. */
export function steamGroupsOfSection(section: DryingSection): SteamGroup[] {
  return STEAM_GROUPS.filter((group) => group.section === section);
}

/**
 * As tags de processo que um grupo tem, sem as por cilindro.
 *
 * É a lista que a tela de processo pede para montar o painel de um grupo: a
 * válvula, o sifão e, quando existe, o tanque.
 */
export function steamGroupTags(id: string): ProcessVariable[] {
  const group = steamGroup(id);
  if (!group) return [];

  return [
    group.pressure,
    group.siphonDeltaP,
    ...(group.condensateLevel ? [group.condensateLevel] : []),
  ];
}
