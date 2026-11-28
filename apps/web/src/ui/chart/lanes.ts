import { clamp } from './scale';

/**
 * A geometria das faixas empilhadas.
 *
 * Fica separada do componente porque é tudo o que `Lanes` tem de lógica, e
 * lógica em função pura é lógica que se testa sem montar nada. O desenho em si
 * está em `ui/Lanes.tsx`, e não decide nada: ele lê o que está aqui.
 *
 * A implementação de referência é a função `lanes()` do protótipo
 * (`reference/design/papertwin-layout-v2.html`, linha 606). As contas são as
 * dela; o que muda é que aqui elas têm nome, tipo e teste.
 *
 * ## Uma geometria, três usos
 *
 * As faixas aparecem em três lugares das fases seguintes, e os três pedem coisa
 * diferente do mesmo desenho:
 *
 * - **a linha do tempo do Turno** (fase 3) tem faixas de alturas diferentes e
 *   precisa preencher o painel: ela chama `laneHeightFor` e passa a altura que
 *   sobrou;
 * - **o perfil MD de Bobinas** (fase 4) tem uma faixa só, com banda de
 *   especificação de catálogo: ela passa `lo`/`hi` e `band`, e a escala não se
 *   ajusta aos dados;
 * - **a "Resposta no tempo" do Simulador** (fase 7) tem a série A, a série B
 *   fixada para comparar e a linha de base do cenário sem mudança: três séries
 *   na mesma faixa, e o cursor de tempo andando com a reprodução.
 *
 * É por isso que a altura da faixa, o domínio e as séries são três decisões
 * separadas aqui, e não um `desenhe isto` só.
 */

/** Uma série dentro de uma faixa. `null` é buraco: a linha não passa por lá. */
export type LaneValues = readonly (number | null)[];

/** O espaço vertical de uma faixa, em pixels, dentro do desenho. */
export interface LaneBox {
  readonly top: number;
  readonly height: number;
}

export interface LanesGeometry {
  /** Altura total do SVG, com o eixo do tempo embaixo. */
  readonly height: number;
  /** Onde cada faixa começa e quanto ocupa, na ordem das faixas. */
  readonly boxes: readonly LaneBox[];
  /** Onde o desenho das séries começa e termina na horizontal. */
  readonly plot: { readonly left: number; readonly right: number };
}

export interface LanesLayout {
  /** Largura total disponível. */
  readonly width: number;
  /** Quantas faixas empilhar. */
  readonly count: number;
  /** Altura de cada faixa. */
  readonly laneHeight: number;
  /** Respiro entre uma faixa e a seguinte. */
  readonly gap?: number;
  /** A coluna do rótulo, à esquerda do desenho. */
  readonly labelWidth?: number;
  /** A coluna do valor, à direita do desenho. */
  readonly valueWidth?: number;
  /** A tira do eixo do tempo, embaixo de tudo. */
  readonly axisHeight?: number;
}

export const LANE_GAP = 12;
export const LANE_AXIS = 22;
export const LANE_LABEL_WIDTH = 170;
export const LANE_VALUE_WIDTH = 90;

/**
 * Onde cada faixa cai, e quanto o desenho inteiro mede.
 *
 * O protótipo calcula isto no meio do laço que monta o SVG. Separado, ele
 * responde à pergunta que o componente precisa fazer **antes** de desenhar:
 * qual é a altura do SVG. Sem essa resposta o elemento teria de ser medido
 * depois de desenhado, e a primeira pintura sairia com a altura errada.
 */
export function lanesGeometry({
  width,
  count,
  laneHeight,
  gap = LANE_GAP,
  labelWidth = LANE_LABEL_WIDTH,
  valueWidth = LANE_VALUE_WIDTH,
  axisHeight = LANE_AXIS,
}: LanesLayout): LanesGeometry {
  const lanes = Math.max(0, Math.trunc(count));
  const height = lanes === 0 ? axisHeight : lanes * (laneHeight + gap) - gap + axisHeight;

  const boxes: LaneBox[] = [];
  for (let index = 0; index < lanes; index += 1) {
    boxes.push({ top: index * (laneHeight + gap), height: laneHeight });
  }

  /**
   * A coluna do valor nunca engole o desenho.
   *
   * Em painel estreito, `width - valueWidth` pode cair abaixo de `labelWidth` —
   * e aí `right < left`, o caminho sai com largura negativa e a linha vira um
   * rabisco para a esquerda. Preso em `labelWidth`, o desenho encolhe a zero
   * mas nada se desenha errado, que é o comportamento honesto.
   */
  const right = Math.max(labelWidth, width - valueWidth);

  return { height, boxes, plot: { left: labelWidth, right } };
}

/**
 * A altura de faixa que couber numa caixa de altura conhecida.
 *
 * É a conta que o protótipo faz quando ninguém passa `laneH`: o que sobra da
 * caixa depois do eixo e dos respiros, dividido pelo número de faixas. Serve ao
 * uso "preenche o painel", que é a linha do tempo do Turno; quem quer faixa de
 * altura fixa passa `laneHeight` e não chama isto.
 *
 * O piso de 24 px é onde o rótulo de 12 px e a linha ainda convivem. Abaixo
 * dele o desenho não informa mais nada, e é melhor o painel rolar junto com a
 * página do que mostrar vinte faixas de 6 px.
 */
export function laneHeightFor(
  available: number,
  count: number,
  gap = LANE_GAP,
  axisHeight = LANE_AXIS,
): number {
  const lanes = Math.max(1, Math.trunc(count));
  const livre = available - axisHeight - gap * (lanes - 1);
  return Math.max(24, livre / lanes);
}

export interface LaneDomainInput {
  /** As séries da faixa, na ordem em que entram na conta. */
  readonly series: readonly LaneValues[];
  /** A banda de especificação, que também tem de caber. */
  readonly band?: readonly [number, number] | null;
  /** Domínio fixo, quando a faixa tem escala de catálogo. */
  readonly lo?: number | null;
  readonly hi?: number | null;
  /** Quanto abrir o domínio de cada lado, em fração da largura dele. */
  readonly pad?: number;
}

/**
 * O domínio vertical de uma faixa.
 *
 * Três regras, e a ordem importa:
 *
 * 1. **`lo` e `hi` dados juntos ganham.** Quando a faixa tem escala de
 *    catálogo, é ela que vale — duas faixas da mesma grandeza precisam de
 *    escalas comparáveis, e deixar cada uma se ajustar aos próprios dados é a
 *    maneira mais fácil de fazer duas curvas idênticas parecerem diferentes.
 * 2. **Senão, os dados e a banda.** A banda entra na conta porque uma banda
 *    fora do domínio é uma banda que não aparece — e aí a faixa mostra a curva
 *    sem mostrar o que ela deveria respeitar.
 * 3. **Domínio degenerado abre um de cada lado.** Série constante tem
 *    `hi - lo = 0`, e dividir por isso põe a linha em `NaN`. Um a mais e um a
 *    menos deixam a linha reta no meio da faixa, que é a verdade.
 */
export function laneDomain({
  series,
  band = null,
  lo = null,
  hi = null,
  pad = 0.12,
}: LaneDomainInput): [number, number] {
  if (lo !== null && hi !== null && hi > lo) return [lo, hi];

  const todos: number[] = [];
  for (const serie of series) {
    for (const value of serie) {
      if (value !== null && Number.isFinite(value)) todos.push(value);
    }
  }
  if (band) todos.push(band[0], band[1]);
  if (lo !== null && Number.isFinite(lo)) todos.push(lo);
  if (hi !== null && Number.isFinite(hi)) todos.push(hi);

  if (todos.length === 0) return [-1, 1];

  let baixo = Math.min(...todos);
  let alto = Math.max(...todos);
  if (alto - baixo < 1e-9) {
    baixo -= 1;
    alto += 1;
  }
  const folga = (alto - baixo) * pad;
  return [baixo - folga, alto + folga];
}

export interface LanePathInput {
  readonly values: LaneValues;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly lo: number;
  readonly hi: number;
  /**
   * Quanto um valor pode passar do domínio antes de ser preso à borda, em
   * fração da largura do domínio.
   *
   * O protótipo usa 10 %: o valor que sai um pouco continua subindo na tela, e
   * o que sai muito encosta na borda em vez de desenhar fora da faixa e invadir
   * a faixa de cima. Zero prenderia tudo na borda e esconderia o quanto saiu.
   */
  readonly overshoot?: number;
}

/**
 * O caminho SVG de uma série dentro de uma faixa.
 *
 * `null` corta a linha: o segmento seguinte recomeça com `M`, e não com `L`.
 * Sem isso um buraco de dez minutos vira uma reta de dez minutos atravessando o
 * gráfico — o jeito mais barato de inventar um dado que ninguém mediu.
 */
export function lanePath({
  values,
  left,
  right,
  top,
  bottom,
  lo,
  hi,
  overshoot = 0.1,
}: LanePathInput): string {
  const n = values.length;
  if (n === 0) return '';
  const span = hi - lo || 1;
  const limite = span * overshoot;
  const x = (index: number): number => (n === 1 ? left : left + ((right - left) * index) / (n - 1));
  const y = (value: number): number => {
    const preso = clamp(value, lo - limite, hi + limite);
    return bottom - ((bottom - top) * (preso - lo)) / span;
  };

  let saida = '';
  let desenhando = false;
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      desenhando = false;
      return;
    }
    const comando = desenhando ? 'L' : 'M';
    saida += comando + x(index).toFixed(1) + ',' + y(value).toFixed(1);
    desenhando = true;
  });
  return saida;
}

/**
 * O retângulo da banda de especificação dentro de uma faixa, ou `null`.
 *
 * `null` quando a banda cai inteira fora do que a faixa mostra: desenhar um
 * retângulo de altura negativa é o que faz a banda aparecer de cabeça para
 * baixo, cobrindo a faixa toda. O protótipo tem o mesmo `if (b > a)`.
 */
export function laneBand(
  band: readonly [number, number],
  box: LaneBox,
  lo: number,
  hi: number,
): { readonly top: number; readonly height: number } | null {
  const span = hi - lo || 1;
  const at = (value: number): number => box.top + box.height - (box.height * (value - lo)) / span;
  const alto = Math.max(at(Math.max(band[0], band[1])), box.top);
  const baixo = Math.min(at(Math.min(band[0], band[1])), box.top + box.height);
  if (baixo - alto <= 0) return null;
  return { top: alto, height: baixo - alto };
}

/**
 * A posição horizontal do cursor de tempo, de 0 a 1 do desenho.
 *
 * Preso entre as pontas: o Simulador anda com a reprodução e pode pedir 1,02
 * no último quadro, e um cursor desenhado fora do gráfico é um cursor em cima
 * da coluna do valor.
 */
export function laneCursor(now: number, plot: { left: number; right: number }): number {
  return plot.left + (plot.right - plot.left) * clamp(now, 0, 1);
}
