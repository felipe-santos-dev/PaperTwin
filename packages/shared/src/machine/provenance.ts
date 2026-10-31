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
