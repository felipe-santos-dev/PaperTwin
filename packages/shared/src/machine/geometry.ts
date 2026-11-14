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
 * Prensa de sapata, a última prensa antes da secagem.
 *
 * Contra-rolo embaixo e, em cima, o rolo de sapata com a manta — maior que o
 * contra-rolo, que é o que a distingue da primeira prensa à primeira vista.
 */
export const PRESS_X_M = 8;
export const PRESS_ROLL_RADIUS_M = 0.95;
export const SHOE_ROLL_RADIUS_M = 1.25;
export const PRESS_BOTTOM_Y_M = 4.2;
export const PRESS_TOP_Y_M = PRESS_BOTTOM_Y_M + PRESS_ROLL_RADIUS_M + SHOE_ROLL_RADIUS_M;

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
 * Parte úmida, na ordem do processo.
 *
 * Caixa de entrada, gap former, pick-up, primeira prensa e prensa de sapata. O
 * par de `PRESS_X_M` é desenhado como prensa de sapata — o rolo de cima ganha
 * a sapata e a correia —, e a primeira prensa fica em `FIRST_PRESS_X_M`.
 *
 * Gap former: as duas telas se encontram sobre o rolo formador, com o jato da
 * caixa de entrada entrando na cunha entre elas. A tela de baixo envolve o
 * rolo formador e o couch; a de cima chega do rolo cabeceira, corre junto até
 * se separar antes do pick-up. Entre os dois rolos as telas correm juntas e na
 * horizontal, em `WIRE_RUN_Y_M`, e é nessa linha que o pick-up tira a folha.
 */
/**
 * Caixa de entrada: centro do corpo e inclinação.
 *
 * O corpo fica embaixo da tela de cima, inclinado com ela, e o bocal entra na
 * cunha entre a tela de cima e o rolo formador. `tools/scene-bake/wet.py`
 * calcula esta pose a partir dos rolos e confere que o lábio caiu na cunha.
 */
export const HEADBOX_X_M = -12.41;
export const HEADBOX_Y_M = 1.56;
export const HEADBOX_TILT_DEG = 20.9;

/** Rolo formador de sucção: as duas telas se encontram sobre ele. */
export const FORMING_ROLL_X_M = -9.8;
export const FORMING_ROLL_Y_M = 2.3;
export const FORMING_ROLL_RADIUS_M = 0.8;

/** Altura em que as duas telas correm juntas, do rolo formador ao couch. */
export const WIRE_RUN_Y_M = FORMING_ROLL_Y_M + FORMING_ROLL_RADIUS_M;

/**
 * Rolo cabeceira da tela de cima, atrás e abaixo do ponto de encontro.
 *
 * A tela de cima precisa chegar **subindo** ao rolo formador para tocá-lo antes
 * do topo; vinda de cima, ela só encostaria depois do topo e daria a volta no
 * rolo. Por isso o cabeceira fica baixo, atrás da caixa de entrada.
 */
export const BREAST_ROLL_X_M = -14.0;
export const BREAST_ROLL_Y_M = 2.0;
export const BREAST_ROLL_RADIUS_M = 0.4;

/** Rolo couch, fim da tela de baixo, com o topo na linha das telas. */
export const COUCH_ROLL_X_M = -3.0;
export const COUCH_ROLL_RADIUS_M = 0.8;
export const COUCH_ROLL_Y_M = WIRE_RUN_Y_M - COUCH_ROLL_RADIUS_M;

/**
 * Pick-up: encosta na folha sobre a tela, pouco antes do couch.
 *
 * Fica uma folga de desenho acima da linha das telas — a mesma das telas da
 * secagem —, para tela, folha e feltro caberem empilhados sob ele.
 */
export const PICKUP_ROLL_X_M = -3.9;
export const PICKUP_ROLL_RADIUS_M = 0.4;
export const PICKUP_ROLL_Y_M = WIRE_RUN_Y_M + FELT_CLEARANCE_M + PICKUP_ROLL_RADIUS_M;

/** Primeira prensa: dois rolos encostados, nip entre eles. */
export const FIRST_PRESS_X_M = 4.2;
export const FIRST_PRESS_ROLL_RADIUS_M = 0.9;
export const FIRST_PRESS_BOTTOM_Y_M = 3.6;
export const FIRST_PRESS_TOP_Y_M = FIRST_PRESS_BOTTOM_Y_M + 2 * FIRST_PRESS_ROLL_RADIUS_M;

/** Comprimento do nip da sapata: é o que distingue a prensa de sapata de um nip comum. */
export const SHOE_PRESS_NIP_LENGTH_M = 0.25;

/** Rolos-guia das telas e dos feltros da parte úmida. */
export const WET_GUIDE_ROLL_RADIUS_M = 0.3;

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

/**
 * Passarela de operação, no nível que o protótipo de teste já usa.
 *
 * Corre no lado acionamento — `WALKWAY_Z0_M` e `WALKWAY_Z1_M` são distâncias ao
 * centro da máquina, e o lado é o do acionamento. O lado comando fica livre
 * para quem olha os mancais. Na parte úmida a mesma passarela serve de
 * plataforma de acesso, contínua até a pré-secagem.
 */
export const WALKWAY_Y_M = 3.35;
export const WALKWAY_Z0_M = 5.75;
export const WALKWAY_Z1_M = 7.0;
