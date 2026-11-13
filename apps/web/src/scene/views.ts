import {
  BEARING_Z_M,
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  GROUND_FLOOR_Y_M,
  HEADBOX_X_M,
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

/** Meio da máquina em X, da caixa de entrada à enroladeira. */
const MACHINE_CENTER_X = (HEADBOX_X_M + POPE_X_M) / 2;

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
   * A máquina inteira, da caixa de entrada à enroladeira.
   *
   * Sem galpão em volta, a câmera recua o quanto precisa: são uns 100 m de
   * máquina, e é de longe e do alto que ela cabe no quadro.
   */
  {
    id: 'overview',
    label: 'Visão geral',
    hint: '',
    position: [MACHINE_CENTER_X - 8, 30, 78],
    target: [MACHINE_CENTER_X, 3, 0],
  },
  {
    id: 'pre-dryer',
    label: 'Pré-secagem',
    hint: `${String(PRE_DRYER_PAIRS)} pares`,
    position: [PRE_DRYER_X0_M + 6, 7.5, 22],
    target: [PRE_DRYER_X0_M + 15, 4.5, 0],
  },
  /**
   * Do lado de fora da passarela, por cima do guarda-corpo, mirando a fileira
   * de cima. Em cima da passarela a câmera cai entre as mangueiras e o coletor
   * de vapor, e o que enche o quadro é mangueira.
   */
  {
    id: 'bearings',
    label: 'Mancais e juntas',
    hint: 'lado operação',
    position: [PRE_DRYER_X0_M + 4, 6.4, 10.5],
    target: [PRE_DRYER_X0_M + 9, 5.6, BEARING_Z_M],
  },
  {
    id: 'pit',
    label: 'Porão',
    hint: 'refugo',
    // fora da fileira central de pilares do mezanino, que corre em z ≈ 0,5:
    // em cima dela, o primeiro pilar cortava a vista ao meio
    position: [PRE_DRYER_HOOD.from + 0.5, -3, 3.2],
    target: [PRE_DRYER_HOOD.from + 17, -3.2, -0.5],
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
    position: [PRE_DRYER_HOOD.from - 6, GROUND_FLOOR_Y_M + 1.7, 16],
    target: [PRE_DRYER_HOOD.from + 20, GROUND_FLOOR_Y_M + 2.6, 0],
  },
  // As vistas de estação recuam e sobem um pouco: sem parede atrás da câmera,
  // dá para enquadrar a estação inteira com o que vem antes e depois dela.
  {
    id: 'scanner-1',
    label: 'Scanner 1',
    hint: 'entrada',
    position: [SCANNER_1_X_M - 5, 8.5, 17],
    target: [SCANNER_1_X_M, DRY_SECTION_WEB_Y_M, 0],
  },
  {
    id: 'speed-sizer',
    label: 'Speed Sizer',
    hint: 'colagem',
    position: [SIZER_X_M - 5, 8.5, 18],
    target: [SIZER_X_M, 4.4, 0],
  },
  {
    id: 'post-dryer',
    label: 'Pós-secagem',
    hint: `${String(POST_DRYER_PAIRS)} pares`,
    position: [POST_DRYER_X0_M - 1, 7.5, 21],
    target: [POST_DRYER_X0_M + 6, 4.5, 0],
  },
  {
    id: 'calender',
    label: 'Calandra',
    hint: 'nip',
    // de jusante e de cima: de frente pelo lado comando a chapa do castelo
    // esconde os rolos e o nip
    position: [CALENDER_X_M + 6, 7, 11],
    target: [CALENDER_X_M, CALENDER_NIP_Y_M, 0],
  },
  {
    id: 'scanner-2',
    label: 'Scanner final',
    hint: 'QCS',
    position: [SCANNER_2_X_M - 5, 8, 17],
    target: [SCANNER_2_X_M, CALENDER_NIP_Y_M, 0],
  },
  {
    id: 'pope-reel',
    label: 'Enroladeira Pope',
    hint: 'jumbo',
    position: [POPE_X_M + 9, 8, 17],
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
