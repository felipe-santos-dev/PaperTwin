import {
  LANE_AXIS,
  LANE_GAP,
  LANE_LABEL_WIDTH,
  LANE_VALUE_WIDTH,
  laneBand,
  laneCursor,
  laneDomain,
  lanePath,
  lanesGeometry,
  type LaneValues,
} from './chart/lanes';
import { useWidth } from './useWidth';

/**
 * Faixas empilhadas: várias grandezas, um eixo de tempo só.
 *
 * É o desenho que o layout novo usa sempre que a pergunta é "o que aconteceu
 * com estas coisas ao mesmo tempo". Cada faixa tem o rótulo à esquerda, o valor
 * à direita, a banda de especificação ao fundo, a linha de base tracejada em
 * cinza, a série B tracejada em âmbar e, atravessando todas, o cursor de tempo.
 *
 * O que ele **não** faz, de propósito: não tem eixo vertical com números, não
 * tem legenda e não tem grade. Quem quer o número lê a coluna da direita; a
 * faixa mostra o formato e se a curva está dentro da banda. Essa é a diferença
 * entre empilhar quatro faixas legíveis e empilhar quatro gráficos apertados.
 *
 * ## Por que a largura é medida, e não esticada
 *
 * O SVG desenha em pixels reais, com `viewBox` do tamanho do elemento, como
 * todos os gráficos do projeto. Esticar um desenho de 900 px num painel de 520
 * engrossaria a linha em 1,7× e deformaria o texto dos rótulos, que é o que
 * mais se lê aqui. A largura vem do `useWidth`, e `ui/useWidth.ts` explica por
 * que ela é uma função de ref e não um `useRef`.
 *
 * ## Só a página rola
 *
 * O componente **declara a própria altura** (`lanesGeometry`), e não "preenche o
 * que tiver". Assim o painel cresce para caber as faixas e quem rola é a
 * página, que é a regra da casca nova. Quem quer caber numa altura conhecida
 * calcula `laneHeight` com `laneHeightFor` e passa pronto.
 */

export interface LaneDef {
  /** O nome por extenso, inteiro. Quando não cabe, a coluna sai, não o nome. */
  readonly name: string;
  /** A TAG, na segunda linha do rótulo. */
  readonly tag?: string;
  /** Uma terceira linha curta: modo da malha, origem do número, estado. */
  readonly badge?: string;
  readonly badgeColor?: string;
  /** A série principal, a de agora. */
  readonly values: LaneValues;
  /**
   * A série B, tracejada em âmbar.
   *
   * No Simulador é o cenário fixado para comparar; em Bobinas, a bobina
   * anterior. Âmbar e tracejada porque ela é a referência, não a medição.
   */
  readonly b?: LaneValues;
  /**
   * A linha de base, tracejada em cinza: o que teria acontecido sem a mudança.
   *
   * No Simulador é a segunda rodada do motor, com ruído desligado. Cinza porque
   * ela é o fundo contra o qual se lê a série principal.
   */
  readonly baseline?: LaneValues;
  /** A banda de especificação, ao fundo. */
  readonly band?: readonly [number, number] | null;
  /** Domínio de catálogo. Os dois juntos, ou nenhum. */
  readonly lo?: number | null;
  readonly hi?: number | null;
  /** O valor de agora, já formatado, na coluna da direita. */
  readonly value: string;
  /** A segunda linha da coluna da direita: desvio, unidade, origem. */
  readonly sub?: string;
  readonly color?: string;
  readonly valueColor?: string;
}

export interface LanesProps {
  readonly lanes: readonly LaneDef[];
  /** As marcas do eixo do tempo, da primeira à última. */
  readonly xLabels?: readonly string[];
  /** O cursor de tempo, de 0 a 1 do eixo. `null` não desenha cursor. */
  readonly now?: number | null;
  readonly nowColor?: string;
  /** Cursor cheio em vez de tracejado: é o "agora" do Turno, não uma marca. */
  readonly nowSolid?: boolean;
  /** A altura de cada faixa. */
  readonly laneHeight?: number;
  readonly gap?: number;
  readonly labelWidth?: number;
  readonly valueWidth?: number;
  /** Largura fixa, para teste e para quem já mediu. */
  readonly width?: number;
  /** Rótulo acessível: o desenho é uma imagem, e precisa dizer o que mostra. */
  readonly label: string;
  readonly className?: string;
}

const LANE_FILL = 'var(--color-base)';
const BAND_FILL = 'var(--color-cell)';

export function Lanes({
  lanes,
  xLabels = [],
  now = null,
  nowColor = 'var(--color-alarm-2)',
  nowSolid = false,
  laneHeight = 64,
  gap = LANE_GAP,
  labelWidth = LANE_LABEL_WIDTH,
  valueWidth = LANE_VALUE_WIDTH,
  width,
  label,
  className = '',
}: LanesProps) {
  const [ref, medida] = useWidth<HTMLDivElement>(900);
  const w = width ?? medida;
  const geo = lanesGeometry({
    width: w,
    count: lanes.length,
    laneHeight,
    gap,
    labelWidth,
    valueWidth,
    axisHeight: LANE_AXIS,
  });

  return (
    <div ref={ref} className={`min-w-0 ${className}`}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${String(w)} ${String(geo.height)}`}
        width={w}
        height={geo.height}
        className="block"
      >
        {lanes.map((lane, index) => {
          const box = geo.boxes[index];
          if (!box) return null;
          const series = [lane.values, lane.baseline ?? [], lane.b ?? []];
          const [lo, hi] = laneDomain({
            series,
            band: lane.band ?? null,
            lo: lane.lo ?? null,
            hi: lane.hi ?? null,
          });
          const faixa = lane.band ? laneBand(lane.band, box, lo, hi) : null;
          const comum = {
            left: geo.plot.left,
            right: geo.plot.right,
            top: box.top + 3,
            bottom: box.top + box.height - 3,
            lo,
            hi,
          };

          return (
            <g key={`${lane.name}-${String(index)}`}>
              <rect
                x={geo.plot.left}
                y={box.top}
                width={Math.max(0, geo.plot.right - geo.plot.left)}
                height={box.height}
                fill={LANE_FILL}
              />
              {faixa ? (
                <rect
                  x={geo.plot.left}
                  y={faixa.top}
                  width={Math.max(0, geo.plot.right - geo.plot.left)}
                  height={faixa.height}
                  fill={BAND_FILL}
                />
              ) : null}
              {lane.baseline ? (
                <path
                  d={lanePath({ ...comum, values: lane.baseline })}
                  fill="none"
                  stroke="var(--color-fg-3)"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />
              ) : null}
              {lane.b ? (
                <path
                  d={lanePath({ ...comum, values: lane.b })}
                  fill="none"
                  stroke="var(--color-alarm-2)"
                  strokeWidth={1.4}
                  strokeDasharray="5 3"
                />
              ) : null}
              <path
                d={lanePath({ ...comum, values: lane.values })}
                fill="none"
                stroke={lane.color ?? 'var(--color-fg-2)'}
                strokeWidth={1.8}
              />
              {/*
                O rótulo fica fora da faixa, à esquerda, e não dentro dela: por
                cima da linha ele some quando a curva passa por ali, e é
                justamente quando alguém está olhando.
              */}
              <text x={0} y={box.top + 15} className="fill-fg text-[12px]">
                {lane.name}
              </text>
              {lane.tag ? (
                <text x={0} y={box.top + 30} className="fill-fg-3 font-mono text-[10px]">
                  {lane.tag}
                </text>
              ) : null}
              {lane.badge ? (
                <text
                  x={0}
                  y={box.top + 45}
                  className="font-mono text-[10px]"
                  fill={lane.badgeColor ?? 'var(--color-fg-3)'}
                >
                  {lane.badge}
                </text>
              ) : null}
              <text
                x={w}
                y={box.top + box.height / 2 + 2}
                textAnchor="end"
                className="font-mono text-[13px] font-semibold"
                fill={lane.valueColor ?? lane.color ?? 'var(--color-fg)'}
              >
                {lane.value}
              </text>
              {lane.sub ? (
                <text
                  x={w}
                  y={box.top + box.height / 2 + 17}
                  textAnchor="end"
                  className="fill-fg-3 font-mono text-[10px]"
                >
                  {lane.sub}
                </text>
              ) : null}
            </g>
          );
        })}

        {xLabels.map((texto, index) => {
          const n = xLabels.length;
          const x =
            n === 1
              ? geo.plot.left
              : geo.plot.left + ((geo.plot.right - geo.plot.left) * index) / (n - 1);
          return (
            <text
              key={`${texto}-${String(index)}`}
              x={x}
              y={geo.height - 5}
              textAnchor={index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'}
              className="fill-fg-3 font-mono text-[10px]"
            >
              {texto}
            </text>
          );
        })}

        {now !== null ? (
          <line
            x1={laneCursor(now, geo.plot)}
            x2={laneCursor(now, geo.plot)}
            y1={0}
            y2={geo.height - LANE_AXIS + 4}
            stroke={nowColor}
            strokeDasharray={nowSolid ? undefined : '2 3'}
          />
        ) : null}
      </svg>
    </div>
  );
}
