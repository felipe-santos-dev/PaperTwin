/**
 * Geometria da MP1, em metros.
 *
 * Os valores vêm do protótipo navegável em `reference/prototypes/mp1-parte-seca-3d.html`,
 * validado em campo. As posições em X são derivadas umas das outras na mesma
 * ordem do protótipo, para a cena continuar coerente se um trecho mudar de tamanho.
 *
 * Eixos: X corre no sentido do papel, Y é a altura a partir do piso da sala de
 * máquinas e Z atravessa a máquina — Z negativo é o lado acionamento (LA),
 * Z positivo é o lado comando (LC), de onde o operador acessa os mancais.
 *
 * Os números ainda são aproximados: os diâmetros e posições reais saem do mapa
 * de rolos, que é documento interno e não entra no repositório.
 */

/** Largura da folha e face dos rolos. */
export const WEB_WIDTH_M = 8;

/** Cilindros secadores. */
export const DRYER_RADIUS_M = 1.05;
export const DRYER_PITCH_M = 2.2;
export const DRYER_TOP_Y_M = 6.1;
export const DRYER_BOTTOM_Y_M = 3.0;

/**
 * Altura do papel no trecho horizontal que liga a pré-secagem à pós-secagem,
 * passando pelo scanner 1 e pelo nip do Speed Sizer.
 */
export const DRY_SECTION_WEB_Y_M = 4.8;

/** Distância do centro da máquina até o plano dos mancais. */
export const BEARING_Z_M = WEB_WIDTH_M / 2 + 0.3;

/** Raio da carcaça do mancal, como fração do raio do corpo que ele sustenta. */
export const BEARING_RADIUS_RATIO = 0.55;

/**
 * Raio mínimo para um corpo ter acionamento próprio.
 *
 * O protótipo põe cardã, redutor e motor no lado acionamento de todo rolo com
 * raio a partir deste valor, e deixa os menores girando puxados pela folha ou
 * pela tela. É o que separa um rolo principal de um rolo guia, e vale também
 * para decidir quem entra no modelo como ativo com tag.
 */
export const DRIVEN_ROLL_MIN_RADIUS_M = 0.38;

/** Um corpo cilíndrico da parte úmida: centro no plano XY e raio, em metros. */
export interface WetRoll {
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
}

/**
 * Caixa de entrada: o corpo pressurizado, o lábio e o tubulão de distribuição.
 *
 * `jet` é onde o jato de massa toca a tela — o começo do caminho da folha.
 */
export const HEADBOX = {
  x: -9.6,
  y: 2.2,
  widthM: 2.6,
  heightM: 2.2,
  sliceX: -8.2,
  sliceY: 1.9,
  sliceWidthM: 1.2,
  sliceHeightM: 1,
  manifoldX: -11,
  manifoldY: 1.4,
  manifoldRadiusM: 0.6,
  jet: { x: -8, y: 1.9 },
} as const;

/** Um rolo do formador de duas telas. */
export interface FormingRoll extends WetRoll {
  /** 1 = tela inferior, a que recebe o jato; 2 = tela superior. */
  readonly wire: 1 | 2;
  /** Revestido de borracha, em vez de aço nu. */
  readonly covered: boolean;
  /** 1 gira no sentido do papel; -1 no contrário. */
  readonly direction: 1 | -1;
}

/**
 * Os dez rolos do formador, cinco por tela.
 *
 * O arranjo é o do protótipo: as duas telas se encontram na altura do jato e
 * sobem até o terceiro nível, cada uma voltando pelos seus rolos de retorno. Em
 * que ordem a folha passa por cada um é desenho, não processo — o mapa de rolos
 * é que dirá.
 */
export const FORMING_ROLLS: readonly FormingRoll[] = [
  { x: -7.2, y: 2.6, radiusM: 0.55, wire: 1, covered: true, direction: -1 },
  { x: -2.6, y: 3.4, radiusM: 0.45, wire: 1, covered: false, direction: 1 },
  { x: -1.6, y: 7.6, radiusM: 0.4, wire: 1, covered: false, direction: -1 },
  { x: -4.8, y: 9.3, radiusM: 0.4, wire: 1, covered: true, direction: 1 },
  { x: -7.4, y: 6.2, radiusM: 0.4, wire: 1, covered: false, direction: -1 },
  { x: -5.6, y: 3.9, radiusM: 0.45, wire: 2, covered: false, direction: 1 },
  { x: 0.2, y: 4.2, radiusM: 0.45, wire: 2, covered: true, direction: -1 },
  { x: -0.8, y: 8.6, radiusM: 0.4, wire: 2, covered: false, direction: 1 },
  { x: -2.8, y: 11, radiusM: 0.4, wire: 2, covered: false, direction: -1 },
  { x: -5.2, y: 7.2, radiusM: 0.35, wire: 2, covered: true, direction: 1 },
] as const;

/**
 * O rolo de onde a folha sai do formador para a primeira prensa.
 *
 * É o último da tela superior com acionamento próprio, e o caminho do papel o
 * abraça antes de entrar nas prensas.
 */
export const FORMING_TRANSFER_INDEX = 6;

/** Um nip de prensa: os dois rolos são derivados dele, tangentes por construção. */
export interface PressNip {
  readonly label: string;
  readonly x: number;
  /** Altura do ponto de contato — por onde a folha passa. */
  readonly nipY: number;
  readonly radiusM: number;
}

/**
 * As três prensas, da saída do formador até a entrada da pré-secagem.
 *
 * O protótipo desenhou os dois rolos de cada prensa com 10 cm de folga entre
 * eles. Aqui eles encostam: um nip é por definição o ponto de contato, e dois
 * rolos afastados não prensam nada. O que se preserva é o X, o raio e a altura
 * média do par; as duas alturas saem do nip e do raio.
 */
export const PRESS_NIPS: readonly PressNip[] = [
  { label: '1ª prensa', x: 3.6, nipY: 4.2, radiusM: 0.85 },
  { label: '2ª prensa', x: 7.2, nipY: 4.55, radiusM: 0.9 },
  { label: '3ª prensa', x: 11, nipY: 5.4, radiusM: 0.95 },
] as const;

/** Os dois rolos de um nip: o inferior é revestido, o superior é de aço. */
export function pressRollsOf(nip: PressNip): { bottom: WetRoll; top: WetRoll } {
  return {
    bottom: { x: nip.x, y: nip.nipY - nip.radiusM, radiusM: nip.radiusM },
    top: { x: nip.x, y: nip.nipY + nip.radiusM, radiusM: nip.radiusM },
  };
}

/**
 * Os rolos que guiam e esticam os feltros das prensas e as telas do formador.
 *
 * Não são ativos do modelo, e é uma decisão: eles estão abaixo do raio de
 * acionamento, giram puxados pelo feltro e nenhum mapa de rolos os nomeia. Dar
 * tag e dois mancais monitorados a cada um encheria a tela de Mancais com 28
 * pontos que ninguém mede.
 */
export const FELT_ROLLS: readonly WetRoll[] = [
  { x: 0.85, y: 4.9, radiusM: 0.3 },
  { x: 2, y: 8.4, radiusM: 0.3 },
  { x: 4, y: 10.4, radiusM: 0.3 },
  { x: 5.2, y: 8.8, radiusM: 0.3 },
  { x: 8.6, y: 1.2, radiusM: 0.3 },
  { x: 4.2, y: 1, radiusM: 0.3 },
  { x: 9.2, y: 9.6, radiusM: 0.3 },
  { x: 7.2, y: 10.8, radiusM: 0.3 },
  { x: 6.4, y: 8.4, radiusM: 0.3 },
  { x: 12.8, y: 9.6, radiusM: 0.3 },
  { x: 11, y: 11, radiusM: 0.3 },
  { x: 12.6, y: 5, radiusM: 0.35 },
  { x: 12.6, y: 1.4, radiusM: 0.3 },
  { x: 10.2, y: 0.8, radiusM: 0.3 },
] as const;

/** Um feltro de prensa: o laço fechado que ele descreve em volta de alguns rolos. */
export interface FeltLoop {
  readonly label: string;
  /** Rolos de prensa que ele abraça: índice em `PRESS_NIPS` e qual dos dois. */
  readonly press: readonly { readonly nip: number; readonly roll: 'bottom' | 'top' }[];
  /** Rolos guia que ele abraça: índices em `FELT_ROLLS`. */
  readonly guides: readonly number[];
}

/**
 * Os cinco feltros das prensas.
 *
 * Cada laço é desenhado como a envoltória convexa dos rolos que ele abraça, que
 * é o que um feltro esticado faz: corre reto entre dois rolos e se enrola no
 * contorno de cada um.
 */
export const FELT_LOOPS: readonly FeltLoop[] = [
  {
    label: 'Feltro de pick-up · 1ª prensa',
    press: [{ nip: 0, roll: 'top' }],
    guides: [0, 1, 2, 3],
  },
  {
    label: 'Feltro inferior · 1ª e 2ª prensas',
    press: [
      { nip: 0, roll: 'bottom' },
      { nip: 1, roll: 'bottom' },
    ],
    guides: [4, 5],
  },
  {
    label: 'Feltro superior · 2ª prensa',
    press: [{ nip: 1, roll: 'top' }],
    guides: [6, 7, 8],
  },
  {
    label: 'Feltro superior · 3ª prensa',
    press: [{ nip: 2, roll: 'top' }],
    guides: [9, 10],
  },
  {
    label: 'Feltro inferior · 3ª prensa',
    press: [{ nip: 2, roll: 'bottom' }],
    guides: [11, 12, 13],
  },
] as const;

/** Distância do centro da máquina até as colunas da parte úmida. */
export const WET_END_HALF_WIDTH_M = WEB_WIDTH_M / 2 + 0.7;

/** Alturas dos três pisos de operação em volta do formador e das prensas. */
export const WET_END_LEVELS: readonly [number, number, number] = [3.4, 6.8, 10.2];

/** X das colunas da estrutura da parte úmida. */
export const WET_END_FRAME_X_M: readonly number[] = [
  -11.4, -7.4, -3.4, 0.6, 4.6, 8.6, 12.6,
] as const;

/** Altura das travessas de topo da estrutura da parte úmida. */
export const WET_END_FRAME_TOP_Y_M = 12.4;

/** Pré-secagem. */
export const PRE_DRYER_X0_M = 15;
export const PRE_DRYER_PAIRS = 13;

/** Pós-secagem. */
export const POST_DRYER_PAIRS = 5;

/** Speed Sizer — dois rolos empilhados, nip horizontal na altura do papel. */
export const SIZER_ROLL_RADIUS_M = 1.15;

/** Calandra — rolo térmico em cima, revestido embaixo, um nip. */
export const CALENDER_ROLL_RADIUS_M = 0.8;
export const CALENDER_NIP_Y_M = 3.4;

/** Enroladeira Pope. */
export const POPE_DRUM_RADIUS_M = 0.8;
export const POPE_DRUM_Y_M = 3.6;

/** Extensão coberta por uma capota de secagem, em X. */
export interface HoodSpan {
  readonly from: number;
  readonly to: number;
}

const hoodSpan = (x0: number, pairs: number): HoodSpan => ({
  from: x0 - 1.8,
  to: x0 + pairs * DRYER_PITCH_M + 0.6,
});

export const PRE_DRYER_HOOD: HoodSpan = hoodSpan(PRE_DRYER_X0_M, PRE_DRYER_PAIRS);

/** Scanner 1, na entrada do Speed Sizer. */
export const SCANNER_1_X_M = PRE_DRYER_HOOD.to + 4;

export const SIZER_X_M = SCANNER_1_X_M + 5;

export const POST_DRYER_X0_M = SIZER_X_M + 5.5;

export const POST_DRYER_HOOD: HoodSpan = hoodSpan(POST_DRYER_X0_M, POST_DRYER_PAIRS);

export const CALENDER_X_M = POST_DRYER_HOOD.to + 4.2;

/** Scanner final (QCS), depois da calandra. */
export const SCANNER_2_X_M = CALENDER_X_M + 4.5;
export const SCANNER_2_Y_M = CALENDER_NIP_Y_M;

export const POPE_X_M = SCANNER_2_X_M + 5.5;

/**
 * X do cilindro de um par da secagem.
 * O cilindro inferior fica meio passo adiante do superior, formando a serpentina.
 */
export function dryerPairX(x0: number, pairIndex: number): { top: number; bottom: number } {
  const top = x0 + pairIndex * DRYER_PITCH_M;
  return { top, bottom: top + DRYER_PITCH_M / 2 };
}
