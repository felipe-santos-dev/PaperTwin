/**
 * De onde vem cada número e cada agrupamento do modelo.
 *
 * Parte da MP1 foi conferida contra a máquina real; parte é suposição tirada do
 * protótipo, à espera do mapa de rolos. Misturar as duas sem marcar qual é qual
 * faz uma suposição virar fato com o tempo — então aqui elas ficam separadas, e
 * um teste garante que nenhuma medida escapa da marcação.
 *
 * Duas coisas distintas carregam proveniência:
 *
 * - **medidas** (este registro): onde o ativo está, qual o seu raio, qual o passo.
 * - **existência** (`MachineAsset.source`): se o ativo existe com aquela tag e
 *   naquele ponto do processo.
 *
 * Um ativo pode ter existência confirmada e posição suposta — é o caso do
 * scanner 1, confirmado em campo na entrada do Speed Sizer, mas cuja
 * distância exata até a pré-secagem ainda é chute do protótipo.
 */

/** Origem de um dado do modelo. */
export type Source = 'validated' | 'assumed';

export interface Provenance {
  readonly source: Source;
  /** O que o dado representa, em português, para a lista de pendências. */
  readonly label: string;
  /** Por que está assim e o que falta para virar `validated`. */
  readonly note: string;
}

const validated = (label: string, note: string): Provenance => ({
  source: 'validated',
  label,
  note,
});

const assumed = (label: string, note: string): Provenance => ({ source: 'assumed', label, note });

const FROM_PROTOTYPE = 'Tirado do protótipo navegável; falta conferir no mapa de rolos.';
const WET_PROTOTYPE =
  'Tirado de reference/prototypes/mp1-parte-umida.html, que serve de referência de forma; a parte úmida entra só como geometria, sem ativo.';
const BUILDING_LAYOUT =
  'Níveis decididos para a cena: piso de operação elevado, térreo 6 m abaixo, sem galpão em volta. Não reproduz o layout da planta além disso.';
const WALKWAY_NOTE = 'O nível que o protótipo de teste já usa, mantido de propósito.';
const CONFIRMED = 'Conferido em campo contra a máquina.';

/**
 * Proveniência de cada medida exportada por `geometry.ts`.
 *
 * As chaves são os nomes das constantes. `provenance.test.ts` compara este
 * registro com os exports reais do módulo, então uma constante nova sem entrada
 * aqui quebra o teste.
 */
export const MEASUREMENTS = {
  // --- confirmado ---
  DRYER_RADIUS_M: validated('Raio dos cilindros secadores (1,05 m)', CONFIRMED),
  DRYER_PITCH_M: validated('Passo entre cilindros secadores (2,2 m)', CONFIRMED),
  DRYER_TOP_Y_M: validated('Altura da fileira superior de secadores (6,1 m)', CONFIRMED),
  DRYER_BOTTOM_Y_M: validated('Altura da fileira inferior de secadores (3,0 m)', CONFIRMED),
  DRY_SECTION_WEB_Y_M: validated(
    'Altura do papel entre a pré-secagem e a pós-secagem (4,8 m)',
    'Confirmado: o papel sai do último cilindro superior da pré-secagem e corre horizontal até a pós-secagem.',
  ),
  SIZER_ROLL_RADIUS_M: validated(
    'Raio dos rolos do Speed Sizer (1,15 m)',
    'Confirmado: dois rolos grossos empilhados, nip horizontal na altura do papel.',
  ),

  // --- suposto ---
  WEB_WIDTH_M: assumed('Largura da folha (8 m)', FROM_PROTOTYPE),
  BEARING_Z_M: assumed('Distância do centro da máquina até o plano dos mancais', FROM_PROTOTYPE),
  BEARING_RADIUS_RATIO: assumed(
    'Raio da carcaça do mancal como fração do corpo',
    'Proporção escolhida para o desenho; não é medida de projeto.',
  ),
  PRE_DRYER_PAIRS: assumed(
    'Nº de pares de cilindros na pré-secagem (13)',
    'O protótipo usou 13 pares. Falta o número real.',
  ),
  POST_DRYER_PAIRS: assumed(
    'Nº de pares de cilindros na pós-secagem (5)',
    'O protótipo usou 5 pares. Falta o número real.',
  ),
  PRE_DRYER_X0_M: assumed('X do primeiro cilindro da pré-secagem', FROM_PROTOTYPE),
  POST_DRYER_X0_M: assumed('X do primeiro cilindro da pós-secagem', FROM_PROTOTYPE),
  PRE_DRYER_HOOD: assumed('Extensão da capota da pré-secagem', FROM_PROTOTYPE),
  POST_DRYER_HOOD: assumed('Extensão da capota da pós-secagem', FROM_PROTOTYPE),
  SCANNER_1_X_M: assumed(
    'X do scanner 1',
    'A posição na ordem do processo é confirmada; a distância até a pré-secagem não.',
  ),
  SIZER_X_M: assumed(
    'X do Speed Sizer',
    'O Speed Sizer e o seu nip são confirmados; a distância até o scanner 1 não.',
  ),
  SCANNER_2_X_M: assumed('X do scanner final', FROM_PROTOTYPE),
  SCANNER_2_Y_M: assumed('Altura do papel no scanner final', FROM_PROTOTYPE),
  CALENDER_X_M: assumed('X da calandra', FROM_PROTOTYPE),
  CALENDER_NIP_Y_M: assumed('Altura do nip da calandra', FROM_PROTOTYPE),
  CALENDER_ROLL_RADIUS_M: assumed('Raio dos rolos da calandra (0,8 m)', FROM_PROTOTYPE),
  POPE_X_M: assumed('X da enroladeira Pope', FROM_PROTOTYPE),
  POPE_DRUM_Y_M: assumed('Altura do tambor da enroladeira', FROM_PROTOTYPE),
  POPE_DRUM_RADIUS_M: assumed('Raio do tambor da enroladeira (0,8 m)', FROM_PROTOTYPE),
  PRESS_X_M: assumed('X do par de prensas de saída', FROM_PROTOTYPE),
  PRESS_ROLL_RADIUS_M: assumed('Raio dos rolos de prensa (0,95 m)', FROM_PROTOTYPE),
  PRESS_BOTTOM_Y_M: assumed('Altura do rolo de prensa inferior', FROM_PROTOTYPE),
  PRESS_TOP_Y_M: assumed('Altura do rolo de prensa superior', FROM_PROTOTYPE),
  // --- suposto: telas da secagem ---
  FELT_ROLL_RADIUS_M: assumed(
    'Raio do rolo de retorno das telas (0,15 m)',
    'Escolhido para caber: com passo 2,2 e raio 1,05 o rolo não entra no vão entre cilindros do mesmo nível e sobe para fora dele.',
  ),
  FELT_ROLL_RISE_M: assumed(
    'Altura do rolo de retorno acima da linha de centro do nível (0,62 m)',
    'Mínimo geométrico para o rolo não tocar os dois cilindros vizinhos, com 4,7 cm de folga; dá 90° de abraço por cilindro.',
  ),
  FELT_CLEARANCE_M: assumed(
    'Folga da tela sobre o cilindro',
    'Afastamento de desenho para a tela não coincidir com a face do cilindro; não é medida de projeto.',
  ),
  PAPER_CLEARANCE_M: assumed(
    'Folga da folha sobre o cilindro',
    'Afastamento de desenho para a folha ficar entre o cilindro e a tela; não é medida de projeto.',
  ),

  // --- suposto: parte úmida (só geometria, sem ativo) ---
  HEADBOX_X_M: assumed('X da caixa de entrada', WET_PROTOTYPE),
  HEADBOX_Y_M: assumed('Altura da caixa de entrada', WET_PROTOTYPE),
  FORMING_X0_M: assumed('X do rolo de peito do gap former', WET_PROTOTYPE),
  FORMING_LENGTH_M: assumed('Comprimento do formador de duas telas', WET_PROTOTYPE),
  FORMING_ROLL_RADIUS_M: assumed('Raio dos rolos do formador (0,55 m)', WET_PROTOTYPE),
  FORMING_WIRE_Y_M: assumed('Altura da tela de formação', WET_PROTOTYPE),
  FIRST_PRESS_X_M: assumed('X da primeira prensa', WET_PROTOTYPE),
  FIRST_PRESS_ROLL_RADIUS_M: assumed('Raio dos rolos da primeira prensa (0,9 m)', WET_PROTOTYPE),
  SHOE_PRESS_NIP_LENGTH_M: assumed(
    'Comprimento do nip da prensa de sapata (0,25 m)',
    'Desenhado como prensa de sapata no par de PRESS_X_M, a pedido; o comprimento real do nip falta.',
  ),
  WET_PLATFORM_Y_M: assumed('Os três níveis de plataforma da parte úmida', WET_PROTOTYPE),
  WET_PLATFORM_Z0_M: assumed('Borda interna das plataformas da parte úmida', WET_PROTOTYPE),
  WET_PLATFORM_Z1_M: assumed('Borda externa das plataformas da parte úmida', WET_PROTOTYPE),

  // --- suposto: prédio em níveis ---
  GROUND_FLOOR_Y_M: assumed(
    'Altura do térreo abaixo do piso de operação (−6,0 m)',
    BUILDING_LAYOUT,
  ),
  OPERATING_FLOOR_THICKNESS_M: assumed('Espessura da laje do piso de operação', BUILDING_LAYOUT),
  FLOOR_OPENING_MARGIN_M: assumed('Avanço da borda do vão além da capota', BUILDING_LAYOUT),
  POPE_PIT_HALF_M: assumed('Meio comprimento do vão sob a enroladeira', BUILDING_LAYOUT),
  OPERATING_FLOOR_OPENINGS: assumed(
    'Onde o piso de operação é aberto até o térreo',
    'Decidido assim: aberto sob a secagem, a pós-secagem e a Pope; fechado sob a parte úmida. Derivado das capotas e da Pope, não escrito à mão.',
  ),
  BUILDING_X0_M: assumed('Borda do piso de operação antes da caixa de entrada', BUILDING_LAYOUT),
  BUILDING_X1_M: assumed('Borda do piso de operação depois da enroladeira', BUILDING_LAYOUT),
  BUILDING_Z_LA_M: assumed('Borda do piso de operação no lado acionamento', BUILDING_LAYOUT),
  BUILDING_Z_LC_M: assumed('Borda do piso de operação no lado comando', BUILDING_LAYOUT),
  MEZZANINE_COLUMN_PITCH_M: assumed('Passo dos pilares do mezanino', BUILDING_LAYOUT),
  GROUND_STAIR_X_M: assumed('X da escada entre o térreo e o piso de operação', BUILDING_LAYOUT),
  WALKWAY_Y_M: assumed('Altura da passarela de operação da secagem', WALKWAY_NOTE),
  WALKWAY_Z0_M: assumed('Borda interna da passarela da secagem', WALKWAY_NOTE),
  WALKWAY_Z1_M: assumed('Borda externa da passarela da secagem', WALKWAY_NOTE),
} as const satisfies Record<string, Provenance>;

export type MeasurementId = keyof typeof MEASUREMENTS;

/** Proveniência das decisões de arranjo, que não são um número só. */
export const ARRANGEMENTS = {
  SECTION_ORDER: validated(
    'Ordem das seções do processo',
    'Confirmado: pré-secagem → scanner 1 → Speed Sizer → pós-secagem → calandra → scanner final → Pope.',
  ),
  DRYER_STEAM_GROUPS: assumed(
    'Divisão dos secadores em grupos de vapor (G1–G6)',
    'Inventado para o modelo, junto com o nº de pares de cilindros que fixa as faixas. O único ponto fixo é o CS23 estar no G4, porque a tag MP1-SEC-G4-CS23-MLA aparece no conceito de tela. A divisão real sai do mapa de rolos.',
  ),
  CALENDER_NIP_COUNT: assumed(
    'Calandra com um único nip',
    'O protótipo usou 1 nip. Falta confirmar quantos são.',
  ),
  CALENDER_THERMAL_POSITION: assumed(
    'Rolo térmico da calandra em cima',
    'O protótipo pôs o térmico em cima e o revestido embaixo. Falta confirmar.',
  ),
  BEARING_SIDES: assumed(
    'Dois mancais por corpo girante, um por lado',
    'Vale para os cilindros secadores; falta confirmar para os demais rolos.',
  ),
} as const satisfies Record<string, Provenance>;

export type ArrangementId = keyof typeof ARRANGEMENTS;

/** Tudo que ainda é suposição, para a lista de pendências do README. */
export function assumptions(): (Provenance & { readonly id: string })[] {
  return [...Object.entries(MEASUREMENTS), ...Object.entries(ARRANGEMENTS)]
    .filter(([, p]) => p.source === 'assumed')
    .map(([id, p]) => ({ id, ...p }));
}
