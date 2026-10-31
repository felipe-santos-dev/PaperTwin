import {
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  HEADBOX,
  POST_DRYER_HOOD,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  PRE_DRYER_HOOD,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  PRESS_NIPS,
  SCANNER_1_X_M,
  SCANNER_2_X_M,
  SIZER_X_M,
} from '@mp1/shared';

/** Um ponto de vista da máquina: onde a câmera fica e para onde olha. */
export interface SceneView {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/**
 * Os pontos de vista da cena, derivados do modelo.
 *
 * Como as posições saem das mesmas constantes que geram a máquina, mover uma
 * seção move a câmera junto — não há lista de coordenadas para esquecer de
 * atualizar.
 */
export const SCENE_VIEWS: readonly SceneView[] = [
  {
    id: 'overview',
    label: 'Visão geral',
    hint: '',
    /**
     * De longe e de cima, mas **por baixo do teto**.
     *
     * O protótipo olha de 26 m de altura, e pode: lá o teto está a 34 m. Aqui
     * ele está a 19, e uma câmera acima dele só não mostra o telhado por fora
     * porque o plano do teto tem uma face só. Depender disso é depender de um
     * descuido — basta alguém tornar o teto visível dos dois lados para a vista
     * principal ficar preta.
     */
    position: [0, 16, 78],
    target: [(PRE_DRYER_HOOD.from + POPE_X_M) / 2, 2, 0],
  },
  {
    id: 'headbox',
    label: 'Caixa de entrada',
    hint: 'jato',
    /**
     * Câmera baixa, e de trás da máquina.
     *
     * A caixa de entrada fica a 2,2 m do chão e o primeiro piso de operação a
     * 3,4 m: de qualquer ponto mais alto, o piso de grade fica na frente dela.
     * Daqui a linha de visada passa por baixo do piso, que começa só depois do
     * tubulão.
     */
    position: [HEADBOX.manifoldX - 4.4, 3.2, 13],
    target: [HEADBOX.sliceX + 0.8, 2.4, 0],
  },
  {
    id: 'forming',
    label: 'Formação',
    hint: 'duas telas',
    position: [-19, 7, 24],
    target: [0.6, 5, 0],
  },
  {
    id: 'press',
    label: 'Prensas',
    hint: `${String(PRESS_NIPS.length)} nips`,
    position: [(PRESS_NIPS[0]?.x ?? 0) - 4, 7.5, 16],
    target: [(PRESS_NIPS[1]?.x ?? 0) + 1, 4.6, 0],
  },
  {
    id: 'wet-to-dry',
    label: 'Úmida → seca',
    hint: 'transição',
    position: [6, 8, 15],
    target: [13, 5, 0],
  },
  {
    id: 'pre-dryer',
    label: 'Pré-secagem',
    hint: `${String(PRE_DRYER_PAIRS)} pares`,
    position: [PRE_DRYER_X0_M + 5, 6.5, 13],
    target: [PRE_DRYER_X0_M + 15, 4.2, -1],
  },
  {
    id: 'bearings',
    label: 'Mancais e juntas',
    hint: 'lado operação',
    position: [PRE_DRYER_X0_M + 6, 5.5, 11],
    target: [PRE_DRYER_X0_M + 12, 3.8, 3],
  },
  {
    id: 'drive-side',
    label: 'Lado acionamento',
    hint: 'motores',
    /**
     * A câmera fica **entre** a fileira de motores e a parede do fundo.
     *
     * É o enquadramento do protótipo, e ele só cabe porque a parede do fundo
     * recuou junto: os acionamentos ocupam até cerca de 10 m para fora do
     * centro, e uma parede logo atrás deles tapa a cena inteira.
     */
    position: [2, 9, -21],
    target: [PRE_DRYER_X0_M + 5, 4.5, -7],
  },
  {
    id: 'pit',
    label: 'Porão',
    hint: 'refugo',
    position: [PRE_DRYER_HOOD.from + 0.5, -3, 0.5],
    target: [PRE_DRYER_HOOD.from + 17, -3.2, -1],
  },
  {
    id: 'scanner-1',
    label: 'Scanner 1',
    hint: 'entrada',
    position: [SCANNER_1_X_M - 2, 7.5, 14],
    target: [SCANNER_1_X_M, DRY_SECTION_WEB_Y_M, 0],
  },
  {
    id: 'speed-sizer',
    label: 'Speed Sizer',
    hint: 'colagem',
    position: [SIZER_X_M - 1, 6, 16],
    target: [SIZER_X_M, 4.2, 0],
  },
  {
    id: 'post-dryer',
    label: 'Pós-secagem',
    hint: `${String(POST_DRYER_PAIRS)} pares`,
    position: [POST_DRYER_X0_M + 4, 6.5, 13],
    target: [POST_DRYER_X0_M + 8, 4, -1],
  },
  {
    id: 'calender',
    label: 'Calandra',
    hint: 'nip',
    position: [CALENDER_X_M - 1, 6.5, 14],
    target: [CALENDER_X_M, CALENDER_NIP_Y_M, 0],
  },
  {
    id: 'scanner-2',
    label: 'Scanner final',
    hint: 'QCS',
    position: [SCANNER_2_X_M - 1.5, 7.5, 13.5],
    target: [SCANNER_2_X_M, CALENDER_NIP_Y_M, 0],
  },
  {
    id: 'pope-reel',
    label: 'Enroladeira Pope',
    hint: 'jumbo',
    position: [POPE_X_M + 4, 6, 12],
    target: [POPE_X_M + 1.5, POPE_DRUM_Y_M, 0],
  },
] as const;

/** Enquadramento usado quando a cena abre. */
export const DEFAULT_VIEW = SCENE_VIEWS[0] as SceneView;

/**
 * Um enquadramento montado em volta de um ativo, para abrir um link direto nele.
 *
 * A câmera fica do mesmo lado da máquina em que o ativo está: um mancal do lado
 * acionamento só é visível de Z negativo, e enquadrá-lo do lado errado mostraria
 * a estrutura na frente dele.
 */
export function viewForAsset(asset: {
  readonly tag: string;
  readonly label: string;
  readonly position: readonly [number, number, number];
}): SceneView {
  const [x, y, z] = asset.position;
  const side = z >= 0 ? 1 : -1;

  return {
    id: `asset:${asset.tag}`,
    label: asset.label,
    hint: asset.tag,
    position: [x - 2.5, y + 2, z + side * 6.5],
    target: [x, y, z],
  };
}

/** Onde termina a máquina, para o alcance da câmera e do nevoeiro. */
export const MACHINE_END_X = POST_DRYER_HOOD.to;
