import {
  BEARING_Z_M,
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  DRYER_TOP_Y_M,
  GROUND_FLOOR_Y_M,
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
  /**
   * A máquina inteira, de dentro do prédio.
   *
   * O Z tem de ficar dentro da parede do lado comando: desde que o prédio
   * passou a ser fechado, uma câmera fora dele enquadra a parede externa, que
   * não recebe luz assada nenhuma — fica uma tela preta.
   */
  {
    id: 'overview',
    label: 'Visão geral',
    hint: '',
    position: [PRE_DRYER_HOOD.from - 14, 10.5, 19],
    target: [(PRE_DRYER_HOOD.from + POPE_X_M) / 2, 4, 0],
  },
  /**
   * As duas vistas da secagem ficam no piso de operação, à altura dos olhos e
   * do lado comando — é de onde se olha a máquina de verdade.
   *
   * O Z passa de 7,0, que é a borda externa da passarela: por dentro dela a
   * câmera cai na sombra que a passarela deixou assada no piso, e a secagem
   * vira silhueta. Daqui as portas superiores da capota aparecem abertas.
   *
   * A de mancais mira a fileira **superior**. Mirando a de baixo, a linha de
   * visada passa por baixo do tabuleiro da passarela e o que se enquadra é a
   * barriga dela.
   */
  {
    id: 'pre-dryer',
    label: 'Pré-secagem',
    hint: `${String(PRE_DRYER_PAIRS)} pares`,
    position: [PRE_DRYER_X0_M + 2, 1.75, 12],
    target: [PRE_DRYER_X0_M + 16, 7, 3],
  },
  {
    id: 'bearings',
    label: 'Mancais e juntas',
    hint: 'lado operação',
    position: [PRE_DRYER_X0_M + 6, 1.8, 12.5],
    target: [PRE_DRYER_X0_M + 10, DRYER_TOP_Y_M, BEARING_Z_M],
  },
  {
    id: 'pit',
    label: 'Porão',
    hint: 'refugo',
    position: [PRE_DRYER_HOOD.from + 0.5, -3, 0.5],
    target: [PRE_DRYER_HOOD.from + 17, -3.2, -1],
  },
  /**
   * O térreo, à altura dos olhos de quem anda nele.
   *
   * A máquina fica num piso de operação elevado e o térreo corre 6 m abaixo. A
   * vista do porão olha o vão de meia altura; esta fica no nível de baixo, de
   * onde se vê a tubulação de vapor, os pilares do mezanino e o vão aberto por
   * onde a secagem aparece de baixo.
   */
  {
    id: 'ground',
    label: 'Térreo',
    hint: 'nível de baixo',
    position: [PRE_DRYER_HOOD.from - 2, GROUND_FLOOR_Y_M + 1.7, 7],
    target: [PRE_DRYER_HOOD.from + 20, GROUND_FLOOR_Y_M + 2.4, 0],
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
