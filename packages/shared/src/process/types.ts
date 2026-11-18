/**
 * Vocabulário do catálogo de variáveis de processo.
 *
 * A fonte da verdade é `reference/research/catalogo-base.csv`, a lista base do
 * simulador. `catalog.generated.ts` é escrito a partir dele pelo script de
 * geração e nunca editado à mão.
 */

/**
 * De onde vem o valor de uma variável.
 *
 * Vocabulário próprio do catálogo, separado do `Source` do modelo da máquina:
 * aqui `B` e `ISO 20816-3` dizem em qual documento o número foi lido, enquanto
 * lá `validated` significa conferido em campo contra a MP1. Um valor da
 * pesquisa B não é um valor conferido na máquina.
 */
export type VariableSource = 'B' | 'ISO 20816-3' | 'assumed';

/** Quanta confiança o valor merece enquanto a MP1 não for medida. */
export type Confidence = 'alta' | 'média' | 'baixa';

/**
 * Como o simulador produz o valor desta variável.
 *
 * A distinção não é cosmética: ela decide **o que vai para o historiador**.
 *
 * - `ligada` — a rede move: é saída de uma relação FOPDT, é malha que segue o
 *   próprio setpoint, ou é escrava de cascata. Grava.
 * - `calculada` — sai de um balanço ou de um modelo a cada passo (a superfície
 *   do cilindro, a produção, a vibração do mancal, o teor seco por ponto).
 *   Grava.
 * - `calculada-na-leitura` — é conta sobre TAGs que já gravam, no mesmo
 *   instante: temperatura de vapor a partir da pressão do grupo, consumo a
 *   partir da evaporação, receita a partir do refugo. **Não grava** — guardar
 *   seria guardar duas vezes o mesmo número, e a série se reconstrói de quem
 *   ela depende.
 * - `autônoma` — alvo, ruído e uma deriva lenta, tudo função pura de (semente,
 *   passo, canal). **Não grava**: a série de sete dias se recalcula sem
 *   arquivo nenhum.
 *
 * Dado fixo do front (o selo "ilustrativo") não aparece aqui: ele não é
 * variável do catálogo.
 */
export const VARIABLE_LEVELS = ['ligada', 'calculada', 'calculada-na-leitura', 'autônoma'] as const;

export type VariableLevel = (typeof VARIABLE_LEVELS)[number];

/** Se o nível ocupa linha no historiador. */
export function levelIsArchived(level: VariableLevel): boolean {
  return level === 'ligada' || level === 'calculada';
}

/**
 * Limites de alarme, no padrão de quatro níveis.
 *
 * `null` quando a variável não tem aquele nível. Eles **não** ficam presos à
 * faixa `min`–`max`: um `LL` abaixo do mínimo de operação é o caso normal, como
 * na vazão de óleo de lubrificação, cujo mínimo operacional é 1,5 L/min e cujo
 * alarme crítico é 1,0.
 */
export interface AlarmLimits {
  readonly ll: number | null;
  readonly l: number | null;
  readonly h: number | null;
  readonly hh: number | null;
}

/**
 * Ponto de partida da compressão do histórico, no estilo do PI.
 *
 * `excDev` é o filtro de exceção (o quanto o valor precisa mudar para ser
 * considerado) e `compDev` o desvio do swinging door (o quanto a reta pode
 * errar antes de gravar um ponto). Os dois saem da lista base e devem ser
 * reajustados depois de medir a taxa de compressão de verdade.
 */
export interface Compression {
  readonly excDev: number | null;
  readonly compDev: number | null;
}

/** Uma variável de processo do catálogo. */
export interface ProcessVariable {
  /** TAG no padrão ISA-5.1, ex.: `PIC-514`. Única no catálogo. */
  readonly tag: string;
  readonly name: string;
  /** Área do processo, ex.: `pré-secagem`. */
  readonly area: string;
  /** Agrupamento dentro da área, ex.: `vapor`. */
  readonly group: string;
  readonly unit: string;
  /** Faixa de operação normal. */
  readonly min: number;
  readonly max: number;
  /** Alvo de operação; `null` nas que não têm, como o diâmetro da bobina. */
  readonly target: number | null;
  readonly limits: AlarmLimits;
  /** Se é uma malha de controle (tem setpoint) ou só uma medição. */
  readonly controlled: boolean;
  /** Como o simulador produz o valor, e se ele vai para o historiador. */
  readonly level: VariableLevel;
  /** Variável manipulada da malha, em texto livre; `null` quando não há. */
  readonly mv: string | null;
  readonly compression: Compression;
  readonly source: VariableSource;
  readonly confidence: Confidence;
  readonly note: string | null;
  /**
   * Nº do cilindro secador, nas variáveis que vêm de um padrão por cilindro;
   * `null` nas demais.
   */
  readonly cylinder: number | null;
  /** Grupo de vapor do cilindro, quando a variável é de um cilindro. */
  readonly steamGroup: string | null;
}

/**
 * Um padrão de variável que existe uma vez por cilindro secador.
 *
 * No CSV ele aparece como uma linha só, com `nn` no lugar do número — a tag
 * `VI-51nnA` vale para os 36 cilindros. A expansão é feita em `catalog.ts`,
 * sobre os cilindros que o modelo da máquina declara, para o catálogo não poder
 * divergir da máquina. A gramática do marcador está em `per-cylinder.ts`.
 */
export interface PerCylinderPattern extends Omit<
  ProcessVariable,
  'tag' | 'name' | 'cylinder' | 'steamGroup'
> {
  /** Tag com `nn` no lugar do nº do cilindro, ex.: `VI-51nnA`. */
  readonly tagPattern: string;
  /** Nome com `nn` no lugar do nº do cilindro. */
  readonly namePattern: string;
}
