/**
 * Geometria da MP1, em metros.
 *
 * Os valores vêm do protótipo navegável em `reference/prototypes/mp1-parte-seca-3d.html`,
 * validado pelo Felipe. As posições em X são derivadas umas das outras na mesma
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

/** Prensas — só o par de saída, que serve de contexto para a parte seca. */
export const PRESS_X_M = 8;
export const PRESS_ROLL_RADIUS_M = 0.95;
export const PRESS_BOTTOM_Y_M = 4.2;
export const PRESS_TOP_Y_M = 6.1;

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
