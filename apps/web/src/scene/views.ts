import {
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  POST_DRYER_HOOD,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  PRE_DRYER_HOOD,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
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
    position: [PRE_DRYER_HOOD.from - 8, 15, 32],
    target: [(PRE_DRYER_HOOD.from + POPE_X_M) / 2, 2, 0],
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

/** Onde termina a máquina, para o alcance da câmera e do nevoeiro. */
export const MACHINE_END_X = POST_DRYER_HOOD.to;
