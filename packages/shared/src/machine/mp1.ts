import type { SectionId } from '../asset';
import { DRYER_BEARING_ISO, type IsoClass } from '../iso20816';
import {
  BEARING_Z_M,
  CALENDER_NIP_Y_M,
  CALENDER_ROLL_RADIUS_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  DRYER_BOTTOM_Y_M,
  DRYER_RADIUS_M,
  DRYER_TOP_Y_M,
  dryerPairX,
  FORMING_ROLLS,
  FORMING_TRANSFER_INDEX,
  HEADBOX,
  POPE_DRUM_RADIUS_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  PRESS_NIPS,
  pressRollsOf,
  SCANNER_1_X_M,
  SCANNER_2_X_M,
  SCANNER_2_Y_M,
  SIZER_ROLL_RADIUS_M,
  SIZER_X_M,
  WEB_WIDTH_M,
} from './geometry';
import type { Source } from './provenance';
import { steamGroupOfCylinder } from './steam-groups';
import type { MachineAsset, MachineModel, MachineSection, Point3 } from './types';

/**
 * Modelo declarativo da MP1 — a fonte da verdade das tags.
 *
 * A cena 3D é gerada a partir daqui e a tabela `asset` do banco é semeada daqui,
 * então uma tag só existe se existir neste arquivo.
 *
 * Padrão de tag: `MP1-<SEÇÃO>-[<GRUPO>-]<ATIVO>[-M<LADO>]`, como em
 * `MP1-SEC-G4-CS23-MLA` — mancal do lado acionamento do cilindro secador 23,
 * no grupo de vapor 4 da secagem.
 */

/**
 * Classe da ISO 20816-3 dos mancais.
 *
 * Provisoriamente a mesma de todos: grupo 2 com apoio rígido. O enquadramento
 * correto depende da potência de acionamento dos cilindros, que ainda falta.
 */
const BEARING_ISO: IsoClass = DRYER_BEARING_ISO;

/** Os dois mancais de um corpo girante, um por lado da máquina. */
function bearingsOf(parent: MachineAsset): MachineAsset[] {
  return (['LA', 'LC'] as const).map((side) => ({
    tag: `${parent.tag}-M${side}`,
    kind: 'bearing' as const,
    label: `Mancal ${side} · ${parent.label}`,
    section: parent.section,
    position: [
      parent.position[0],
      parent.position[1],
      side === 'LA' ? -BEARING_Z_M : BEARING_Z_M,
    ] as const satisfies Point3,
    radius: null,
    lengthM: null,
    side,
    parentTag: parent.tag,
    steamGroup: parent.steamGroup,
    iso: BEARING_ISO,
    // Um mancal não existe mais nem menos que o corpo que ele sustenta.
    source: parent.source,
  }));
}

/** Acompanha cada corpo girante dos seus dois mancais. */
function withBearings(bodies: readonly MachineAsset[]): MachineAsset[] {
  return bodies.flatMap((body) => [body, ...bearingsOf(body)]);
}

interface BodySpec {
  readonly tag: string;
  readonly kind: MachineAsset['kind'];
  readonly label: string;
  readonly section: SectionId;
  readonly position: Point3;
  readonly radius: number;
  readonly steamGroup?: string;
  readonly source: Source;
}

function body(spec: BodySpec): MachineAsset {
  return {
    tag: spec.tag,
    kind: spec.kind,
    label: spec.label,
    section: spec.section,
    position: spec.position,
    radius: spec.radius,
    lengthM: WEB_WIDTH_M,
    side: null,
    parentTag: null,
    steamGroup: spec.steamGroup ?? null,
    iso: null,
    source: spec.source,
  };
}

/** Um nip não gira: é o ponto de contato entre dois corpos, onde o papel é prensado. */
function nip(
  tag: string,
  label: string,
  section: SectionId,
  position: Point3,
  source: Source,
): MachineAsset {
  return {
    tag,
    kind: 'nip',
    label,
    section,
    position,
    radius: null,
    lengthM: WEB_WIDTH_M,
    side: null,
    parentTag: null,
    steamGroup: null,
    iso: null,
    source,
  };
}

function scanner(tag: string, label: string, section: SectionId, x: number, y: number) {
  return {
    tag,
    kind: 'scanner' as const,
    label,
    section,
    position: [x, y, 0] as const satisfies Point3,
    radius: null,
    lengthM: WEB_WIDTH_M + 3.6,
    side: null,
    parentTag: null,
    steamGroup: null,
    iso: null,
    // Os dois scanners e a sua posição na ordem do processo foram confirmados.
    source: 'validated' as const,
  };
}

/** Os cilindros de uma secagem, numerados em sequência contínua na máquina. */
function dryerCylinders(
  section: Extract<SectionId, 'pre-dryer' | 'post-dryer'>,
  x0: number,
  pairs: number,
  firstCylinder: number,
): MachineAsset[] {
  const cylinders: MachineAsset[] = [];

  for (let pair = 0; pair < pairs; pair += 1) {
    const x = dryerPairX(x0, pair);
    const topNumber = firstCylinder + pair * 2;

    for (const [number, cx, cy] of [
      [topNumber, x.top, DRYER_TOP_Y_M],
      [topNumber + 1, x.bottom, DRYER_BOTTOM_Y_M],
    ] as const) {
      const group = steamGroupOfCylinder(number);
      cylinders.push(
        body({
          // dois dígitos para a tag ordenar certo: sem o zero à esquerda,
          // a ordem alfabética daria CS1, CS10, CS11, …, CS2
          tag: `MP1-SEC-${group}-CS${String(number).padStart(2, '0')}`,
          kind: 'dryer-cylinder',
          label: `Cilindro secador ${String(number)}`,
          section,
          position: [cx, cy, 0],
          radius: DRYER_RADIUS_M,
          steamGroup: group,
          // Existe porque supusemos 13 e 5 pares; o número real falta.
          source: 'assumed',
        }),
      );
    }
  }

  return cylinders;
}

/**
 * Caixa de entrada.
 *
 * Um ativo só, e sem mancal: o corpo pressurizado, o lábio e o tubulão de
 * distribuição são uma peça para quem opera, e nenhum deles gira. O que se
 * mede nela — pressão, consistência, abertura do lábio — está no catálogo de
 * processo, não aqui.
 */
const headboxSection: MachineSection = {
  id: 'headbox',
  label: 'Caixa de entrada',
  order: 1,
  assets: [
    {
      tag: 'MP1-CXE-CE',
      kind: 'headbox',
      label: 'Caixa de entrada',
      section: 'headbox',
      position: [HEADBOX.x, HEADBOX.y, 0],
      radius: null,
      lengthM: WEB_WIDTH_M + 0.8,
      side: null,
      parentTag: null,
      steamGroup: null,
      iso: null,
      source: 'assumed',
    },
  ],
};

/**
 * Formador de duas telas.
 *
 * As tags vão numeradas por tela — `MP1-FOR-T1-R3` é o terceiro rolo da tela
 * inferior — porque é assim que a folha se forma: entre as duas telas, drenando
 * pelos dois lados. Dois rolos ganham nome de função: o de peito, onde o jato
 * toca a tela, e o de transferência, de onde a folha sai para a primeira prensa.
 */
const formingSection: MachineSection = {
  id: 'forming',
  label: 'Formação',
  order: 2,
  assets: withBearings(
    FORMING_ROLLS.map((roll, index) => {
      const onWire = FORMING_ROLLS.filter((r) => r.wire === roll.wire).indexOf(roll) + 1;

      return body({
        tag: `MP1-FOR-T${String(roll.wire)}-R${String(onWire)}`,
        kind: 'roll',
        label:
          index === 0
            ? 'Rolo de peito'
            : index === FORMING_TRANSFER_INDEX
              ? 'Rolo de transferência'
              : `Rolo da tela ${roll.wire === 1 ? 'inferior' : 'superior'} ${String(onWire)}`,
        section: 'forming',
        position: [roll.x, roll.y, 0],
        radius: roll.radiusM,
        source: 'assumed',
      });
    }),
  ),
};

/**
 * Prensas: três nips, seis rolos.
 *
 * Cada nip carrega a sua tag própria em vez de haver um nip só para a seção —
 * uma nota de manutenção, um alarme de carga ou uma troca de feltro são sempre
 * de *uma* prensa, e "nip de prensa" não diria qual.
 */
const pressSection: MachineSection = {
  id: 'press',
  label: 'Prensas',
  order: 3,
  assets: PRESS_NIPS.flatMap((press, index) => {
    const number = index + 1;
    const prefix = `MP1-PRE-P${String(number)}`;
    const rolls = pressRollsOf(press);

    return [
      ...withBearings([
        body({
          tag: `${prefix}-RI`,
          kind: 'roll',
          label: `Rolo inferior · ${press.label}`,
          section: 'press',
          position: [rolls.bottom.x, rolls.bottom.y, 0],
          radius: rolls.bottom.radiusM,
          source: 'assumed',
        }),
        body({
          tag: `${prefix}-RS`,
          kind: 'roll',
          label: `Rolo superior · ${press.label}`,
          section: 'press',
          position: [rolls.top.x, rolls.top.y, 0],
          radius: rolls.top.radiusM,
          source: 'assumed',
        }),
      ]),
      nip(`${prefix}-NIP`, `Nip da ${press.label}`, 'press', [press.x, press.nipY, 0], 'assumed'),
    ];
  }),
};

const sizerSection: MachineSection = {
  id: 'speed-sizer',
  label: 'Speed Sizer',
  order: 6,
  assets: withBearings([
    body({
      tag: 'MP1-SZR-RS',
      kind: 'roll',
      label: 'Rolo aplicador superior',
      section: 'speed-sizer',
      position: [SIZER_X_M, DRY_SECTION_WEB_Y_M + SIZER_ROLL_RADIUS_M, 0],
      radius: SIZER_ROLL_RADIUS_M,
      source: 'validated',
    }),
    body({
      tag: 'MP1-SZR-RI',
      kind: 'roll',
      label: 'Rolo aplicador inferior',
      section: 'speed-sizer',
      position: [SIZER_X_M, DRY_SECTION_WEB_Y_M - SIZER_ROLL_RADIUS_M, 0],
      radius: SIZER_ROLL_RADIUS_M,
      source: 'validated',
    }),
  ]).concat(
    nip(
      'MP1-SZR-NIP',
      'Nip do Speed Sizer',
      'speed-sizer',
      [SIZER_X_M, DRY_SECTION_WEB_Y_M, 0],
      'validated',
    ),
  ),
};

const calenderSection: MachineSection = {
  id: 'calender',
  label: 'Calandra',
  order: 8,
  assets: withBearings([
    body({
      tag: 'MP1-CAL-RT',
      kind: 'roll',
      label: 'Rolo térmico',
      section: 'calender',
      position: [CALENDER_X_M, CALENDER_NIP_Y_M + CALENDER_ROLL_RADIUS_M, 0],
      radius: CALENDER_ROLL_RADIUS_M,
      // Nº de nips e qual rolo fica em cima ainda não foram confirmados.
      source: 'assumed',
    }),
    body({
      tag: 'MP1-CAL-RR',
      kind: 'roll',
      label: 'Rolo revestido',
      section: 'calender',
      position: [CALENDER_X_M, CALENDER_NIP_Y_M - CALENDER_ROLL_RADIUS_M, 0],
      radius: CALENDER_ROLL_RADIUS_M,
      source: 'assumed',
    }),
  ]).concat(
    nip(
      'MP1-CAL-NIP',
      'Nip da calandra',
      'calender',
      [CALENDER_X_M, CALENDER_NIP_Y_M, 0],
      'assumed',
    ),
  ),
};

/**
 * A MP1, na ordem do processo.
 *
 * Da caixa de entrada à enroladeira. A parte úmida é a que tem menos
 * sustentação documental — o arranjo todo saiu do protótipo navegável — e por
 * isso cada ativo dela está marcado como suposto.
 */
export const MP1: MachineModel = {
  id: 'MP1',
  label: 'Máquina de papel MP1',
  webWidthM: WEB_WIDTH_M,
  sections: [
    headboxSection,
    formingSection,
    pressSection,
    {
      id: 'pre-dryer',
      label: 'Pré-secagem',
      order: 4,
      assets: withBearings(dryerCylinders('pre-dryer', PRE_DRYER_X0_M, PRE_DRYER_PAIRS, 1)),
    },
    {
      id: 'scanner-1',
      label: 'Scanner 1',
      order: 5,
      assets: [
        scanner(
          'MP1-QCS-SC1',
          'Scanner 1 · entrada do Speed Sizer',
          'scanner-1',
          SCANNER_1_X_M,
          DRY_SECTION_WEB_Y_M,
        ),
      ],
    },
    sizerSection,
    {
      id: 'post-dryer',
      label: 'Pós-secagem',
      order: 7,
      assets: withBearings(
        dryerCylinders('post-dryer', POST_DRYER_X0_M, POST_DRYER_PAIRS, PRE_DRYER_PAIRS * 2 + 1),
      ),
    },
    calenderSection,
    {
      id: 'scanner-2',
      label: 'Scanner final',
      order: 9,
      assets: [
        scanner('MP1-QCS-SC2', 'Scanner final · QCS', 'scanner-2', SCANNER_2_X_M, SCANNER_2_Y_M),
      ],
    },
    {
      id: 'pope-reel',
      label: 'Enroladeira Pope',
      order: 10,
      assets: withBearings([
        body({
          tag: 'MP1-POP-TBR',
          kind: 'reel-drum',
          label: 'Tambor da enroladeira',
          section: 'pope-reel',
          position: [POPE_X_M, POPE_DRUM_Y_M, 0],
          radius: POPE_DRUM_RADIUS_M,
          source: 'validated',
        }),
      ]),
    },
  ],
};
