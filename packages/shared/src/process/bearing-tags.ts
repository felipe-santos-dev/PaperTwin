import type { AssetTag, MachineSide } from '../asset';
import { MP1 } from '../machine/mp1';
import { dryerCylinders, monitoredAssets } from '../machine/query';
import { isCatalogTag } from './catalog';
import { expandCylinderTag } from './per-cylinder';

/**
 * A ponte entre a tag do ativo e as tags de processo do mancal.
 *
 * O modelo da máquina chama o mancal de `MP1-SEC-G4-CS23-MLA`; o catálogo chama
 * as medições dele de `VI-5123A`, `VE-5123A` e `TI-5323A`. São dois sistemas de
 * nomes que existem por boas razões — um é o inventário de ativos, o outro é a
 * lista de instrumentos — e alguém tem de saber que são o mesmo mancal.
 *
 * O `A`/`B` do sufixo da tag de processo é o lado, como a LISTA-BASE escreve:
 * `A` é LA (lado acionamento) e `B` é LC (lado comando, de onde o operador
 * acessa). Não confundir com o `A`/`B` das zonas da ISO 20816-3, que é outra
 * coisa inteiramente.
 */

/** Os sufixos de lado das tags por cilindro. */
const SIDE_SUFFIX: Readonly<Record<MachineSide, string>> = { LA: 'A', LC: 'B' };

/** Os padrões de tag de um mancal de cilindro secador, por medição. */
const PATTERNS = {
  vibration: 'VI-51nn',
  envelope: 'VE-51nn',
  temperature: 'TI-53nn',
} as const;

/** Um mancal de cilindro secador e as suas quatro identidades. */
export interface BearingTags {
  /** Tag do ativo no modelo da máquina. */
  readonly assetTag: AssetTag;
  readonly cylinder: number;
  readonly side: MachineSide;
  /** Vibração RMS, mm/s. */
  readonly vibration: string;
  /** Envelope de aceleração, gE. */
  readonly envelope: string;
  /** Temperatura do mancal, °C. */
  readonly temperature: string;
}

function tagsOf(cylinder: number, side: MachineSide, assetTag: AssetTag): BearingTags {
  const suffix = SIDE_SUFFIX[side];

  const resolve = (pattern: string): string => {
    const tag = expandCylinderTag(`${pattern}${suffix}`, cylinder);
    if (!isCatalogTag(tag)) {
      throw new Error(
        `O mancal ${assetTag} aponta para ${tag}, que não existe no catálogo. ` +
          'Ou o padrão por cilindro mudou, ou o nº de cilindros do modelo passou do que o CSV cobre.',
      );
    }
    return tag;
  };

  return {
    assetTag,
    cylinder,
    side,
    vibration: resolve(PATTERNS.vibration),
    envelope: resolve(PATTERNS.envelope),
    temperature: resolve(PATTERNS.temperature),
  };
}

/**
 * Os mancais dos cilindros secadores, dois por cilindro.
 *
 * São 72 — e a máquina tem mais mancais que isso. Os dos rolos de prensa, do
 * Speed Sizer, da calandra e da Pope têm classe ISO declarada no modelo, ou
 * seja, o gêmeo os acompanha, mas **não têm tag de processo no catálogo**: o
 * padrão por cilindro da lista base cobre só os cilindros secadores.
 *
 * Isso é pendência da lista base, não deste código, e está anotado como tal.
 * Inventar `VI-61nn` para o Speed Sizer daria ao simulador instrumentos que
 * ninguém especificou.
 */
function build(): BearingTags[] {
  const bearings: BearingTags[] = [];
  const monitored = new Set(monitoredAssets(MP1).map((asset) => asset.tag));

  for (const { number, asset } of dryerCylinders(MP1)) {
    for (const side of ['LA', 'LC'] as const) {
      const assetTag = `${asset.tag}-M${side}`;
      if (!monitored.has(assetTag)) {
        throw new Error(
          `O cilindro ${String(number)} não tem o mancal ${assetTag} com classe ISO no modelo.`,
        );
      }
      bearings.push(tagsOf(number, side, assetTag));
    }
  }

  return bearings;
}

export const DRYER_BEARING_TAGS: readonly BearingTags[] = Object.freeze(build());

const BY_ASSET = new Map(DRYER_BEARING_TAGS.map((item) => [item.assetTag, item]));

const BY_PROCESS_TAG = new Map(
  DRYER_BEARING_TAGS.flatMap((item) => [
    [item.vibration, item] as const,
    [item.envelope, item] as const,
    [item.temperature, item] as const,
  ]),
);

/** As tags de processo de um mancal, ou `null` se ele não tem. */
export function bearingTagsOf(assetTag: AssetTag): BearingTags | null {
  return BY_ASSET.get(assetTag) ?? null;
}

/** O mancal a que uma tag de processo pertence, ou `null`. */
export function bearingOfProcessTag(tag: string): BearingTags | null {
  return BY_PROCESS_TAG.get(tag) ?? null;
}

/** Se a tag é uma medição de mancal de cilindro secador. */
export function isBearingProcessTag(tag: string): boolean {
  return BY_PROCESS_TAG.has(tag);
}

/**
 * Os mancais monitorados que não têm tag de processo no catálogo.
 *
 * É a lista de pendências desta ponte, e existe para a tela poder dizer
 * "acompanhado, sem instrumento no catálogo" em vez de deixar um traço sem
 * explicação.
 */
export function bearingsWithoutProcessTags(): AssetTag[] {
  return monitoredAssets(MP1)
    .map((asset) => asset.tag)
    .filter((tag) => !BY_ASSET.has(tag));
}
