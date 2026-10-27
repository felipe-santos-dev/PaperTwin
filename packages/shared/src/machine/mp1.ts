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
  POPE_DRUM_RADIUS_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  PRESS_BOTTOM_Y_M,
  PRESS_ROLL_RADIUS_M,
  PRESS_TOP_Y_M,
  PRESS_X_M,
  SCANNER_1_X_M,
  SCANNER_2_X_M,
  SCANNER_2_Y_M,
  SIZER_ROLL_RADIUS_M,
  SIZER_X_M,
  WEB_WIDTH_M,
} from './geometry';
import type { Source } from './provenance';
import type { MachineAsset, MachineModel, MachineSection, Point3 } from './types';

/**
 * Modelo declarativo da MP1 — a fonte da verdade das tags.
 *
 * A cena 3D é gerada a partir daqui e a tabela `asset` do banco é semeada daqui,
 * então uma tag só existe se existir neste arquivo.
 *
 * Padrão de tag: `MP1-<SEÇÃO>-[<GRUPO>-]<ATIVO>[-M<LADO>]`, como em
 * `MP1-SEC-G4-CS23-MLA` — mancal do lado acionamento do cilindro secador 23,
 * no grupo de acionamento 4 da secagem.
 */

/**
 * Classe da ISO 20816-3 dos mancais.
 *
 * Provisoriamente a mesma de todos: grupo 2 com apoio rígido. O enquadramento
 * correto depende da potência de acionamento de cada grupo, que ainda falta.
 */
const BEARING_ISO: IsoClass = DRYER_BEARING_ISO;

/**
 * Grupos de acionamento da secagem, por faixa de cilindro.
 *
 * Provisório: a divisão real sai do mapa de rolos. O que está fixo é que o CS23
 * pertence ao G4, como no conceito de tela de monitoramento.
 */
const DRYER_DRIVE_GROUPS = [
  { id: 'G1', from: 1, to: 6 },
  { id: 'G2', from: 7, to: 12 },
  { id: 'G3', from: 13, to: 18 },
  { id: 'G4', from: 19, to: 26 },
  { id: 'G5', from: 27, to: 32 },
  { id: 'G6', from: 33, to: 36 },
] as const;

function driveGroupOfCylinder(cylinder: number): string {
  const group = DRYER_DRIVE_GROUPS.find((g) => cylinder >= g.from && cylinder <= g.to);
  if (!group) throw new Error(`Cilindro secador ${String(cylinder)} fora dos grupos conhecidos`);
  return group.id;
}

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
    driveGroup: parent.driveGroup,
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
  readonly driveGroup?: string;
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
    driveGroup: spec.driveGroup ?? null,
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
    driveGroup: null,
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
    driveGroup: null,
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
      const group = driveGroupOfCylinder(number);
      cylinders.push(
        body({
          tag: `MP1-SEC-${group}-CS${String(number)}`,
          kind: 'dryer-cylinder',
          label: `Cilindro secador ${String(number)}`,
          section,
          position: [cx, cy, 0],
          radius: DRYER_RADIUS_M,
          driveGroup: group,
          // Existe porque supusemos 13 e 5 pares; o número real falta.
          source: 'assumed',
        }),
      );
    }
  }

  return cylinders;
}

const pressSection: MachineSection = {
  id: 'press',
  label: 'Prensas',
  order: 3,
  assets: withBearings([
    body({
      tag: 'MP1-PRE-R1',
      kind: 'roll',
      label: 'Rolo de prensa inferior',
      section: 'press',
      position: [PRESS_X_M, PRESS_BOTTOM_Y_M, 0],
      radius: PRESS_ROLL_RADIUS_M,
      source: 'assumed',
    }),
    body({
      tag: 'MP1-PRE-R2',
      kind: 'roll',
      label: 'Rolo de prensa superior',
      section: 'press',
      position: [PRESS_X_M, PRESS_TOP_Y_M, 0],
      radius: PRESS_ROLL_RADIUS_M,
      source: 'assumed',
    }),
  ]).concat(
    nip(
      'MP1-PRE-NIP',
      'Nip de prensa',
      'press',
      [PRESS_X_M, (PRESS_BOTTOM_Y_M + PRESS_TOP_Y_M) / 2, 0],
      'assumed',
    ),
  ),
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
 * A caixa de entrada e a formação ainda não têm ativos: o protótipo da parte
 * úmida usa um referencial próprio, e amarrar os dois depende do mapa de rolos.
 */
export const MP1: MachineModel = {
  id: 'MP1',
  label: 'Máquina de papel MP1',
  webWidthM: WEB_WIDTH_M,
  sections: [
    { id: 'headbox', label: 'Caixa de entrada', order: 1, assets: [] },
    { id: 'forming', label: 'Formação', order: 2, assets: [] },
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
