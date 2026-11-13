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

/**
 * Telas e folha: raio do rolo de retorno das telas e as folgas de desenho.
 *
 * Com o passo de 2,2 m e o raio de 1,05 m sobram **0,10 m** entre dois
 * cilindros do mesmo nível — não cabe rolo nenhum ali. O rolo de retorno da
 * tela sai do vão e sobe: fica a `FELT_ROLL_RISE_M` acima da linha de centro do
 * nível superior (e o mesmo abaixo da do inferior), a meio vão. Isso dá 90° de
 * abraço por cilindro com 4,7 cm de folga, contra 98° do protótipo de teste,
 * que pôde usar passo maior.
 */
export const FELT_ROLL_RADIUS_M = 0.15;
export const FELT_ROLL_RISE_M = 0.62;

/** Folga da tela e da folha sobre o cilindro, para as duas não coincidirem. */
export const FELT_CLEARANCE_M = 0.016;
export const PAPER_CLEARANCE_M = 0.004;

/**
 * Parte úmida — só geometria, sem ativo nem tag.
 *
 * As formas vêm de `reference/prototypes/mp1-parte-umida.html`, deslocadas em X
 * para o referencial da parte seca: o terceiro par de prensas daquele protótipo
 * é o par que já mora em `PRESS_X_M`, e o deslocamento sai dessa coincidência.
 *
 * O par de `PRESS_X_M` é desenhado como prensa de sapata — o rolo de cima ganha
 * a sapata e a correia —, e a primeira prensa fica em `FIRST_PRESS_X_M`.
 */
export const HEADBOX_X_M = -12.6;
export const HEADBOX_Y_M = 2.2;

/** Rolo de peito, onde o jato encontra a tela de formação. */
export const FORMING_X0_M = -10.2;
export const FORMING_LENGTH_M = 8.4;
export const FORMING_ROLL_RADIUS_M = 0.55;
export const FORMING_WIRE_Y_M = 2.6;

export const FIRST_PRESS_X_M = 4.2;
export const FIRST_PRESS_ROLL_RADIUS_M = 0.9;

/** Comprimento do nip da sapata: é o que distingue a prensa de sapata de um nip comum. */
export const SHOE_PRESS_NIP_LENGTH_M = 0.25;

/** Os três níveis de plataforma da parte úmida, acima do piso de operação. */
export const WET_PLATFORM_Y_M = [3.4, 6.8, 10.2] as const;
export const WET_PLATFORM_Z0_M = 4.7;
export const WET_PLATFORM_Z1_M = 7.1;

/**
 * Prédio em níveis.
 *
 * A máquina fica num piso de operação elevado, que continua sendo o `Y = 0` de
 * todas as medidas acima. O térreo fica em `GROUND_FLOOR_Y_M`.
 *
 * Sob a secagem, a pós-secagem e a Pope o piso de operação é **aberto**: o vão
 * desce até o térreo, e é por ele que se vê o refugo, os pilares e a tubulação.
 * Sob a parte úmida o piso é fechado, e as plataformas da úmida ficam acima dele.
 */
export const GROUND_FLOOR_Y_M = -6.0;
export const OPERATING_FLOOR_THICKNESS_M = 0.35;

/** Quanto a borda do vão avança além da capota que ela acompanha. */
export const FLOOR_OPENING_MARGIN_M = 0.6;

/** Meio comprimento do vão sob a enroladeira, onde cai o refugo da troca de bobina. */
export const POPE_PIT_HALF_M = 3.2;

const floorOpening = (span: HoodSpan): HoodSpan => ({
  from: span.from - FLOOR_OPENING_MARGIN_M,
  to: span.to + FLOOR_OPENING_MARGIN_M,
});

/** Os vãos abertos no piso de operação, na ordem da máquina. */
export const OPERATING_FLOOR_OPENINGS: readonly HoodSpan[] = Object.freeze([
  floorOpening(PRE_DRYER_HOOD),
  floorOpening(POST_DRYER_HOOD),
  { from: POPE_X_M - POPE_PIT_HALF_M, to: POPE_X_M + POPE_PIT_HALF_M },
]);

/**
 * Até onde o piso de operação se estende.
 *
 * Não há mais galpão em volta: a cena é a máquina sobre o seu piso, com luz de
 * estúdio. O piso avança cerca de 12 m além da máquina para cada lado, que é o
 * recuo de que a câmera precisa para enquadrá-la inteira. Os nomes guardam o
 * `BUILDING` de quando isto era a planta de um prédio.
 */
export const BUILDING_X0_M = HEADBOX_X_M - 14;
export const BUILDING_X1_M = POPE_X_M + 20;

/** Bordas do piso: Z negativo é o lado acionamento, Z positivo o lado comando. */
export const BUILDING_Z_LA_M = -18;
export const BUILDING_Z_LC_M = 19;

/** Passo dos pilares e das vigas do mezanino que sustenta o piso de operação. */
export const MEZZANINE_COLUMN_PITCH_M = 6;

/** Escada entre o térreo e o piso de operação, num trecho de piso fechado. */
export const GROUND_STAIR_X_M = PRE_DRYER_HOOD.from - 3.5;

/** Passarela de operação da secagem, no nível que o protótipo de teste já usa. */
export const WALKWAY_Y_M = 3.35;
export const WALKWAY_Z0_M = 5.75;
export const WALKWAY_Z1_M = 7.0;
