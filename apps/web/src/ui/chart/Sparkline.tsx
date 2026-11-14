import { extent, linear, padded, polyline } from './scale';

/**
 * Minigráfico com a banda L–H ao fundo.
 *
 * É o "última 1 h" das linhas de instrumento e os 30 dias das linhas de mancal.
 * A banda é a faixa operacional: com a linha dentro dela, nada a ver; a linha
 * saindo da banda é o que o olho pega. O último ponto ganha uma marca, porque é
 * o valor que a coluna ao lado mostra.
 *
 * Sem eixo e sem número: quem quer ler o valor olha a coluna; o minigráfico
 * mostra só o formato.
 */
export interface SparklineProps {
  readonly values: readonly number[];
  /** Faixa operacional L–H, desenhada ao fundo. */
  readonly band?: { readonly lo: number; readonly hi: number } | null;
  /** Domínio vertical; por padrão, os valores e a banda com folga. */
  readonly domain?: readonly [number, number];
  /** Cor da linha. */
  readonly color?: string;
  /** Cor da última marca: é ela que assume a cor do estado, a linha não. */
  readonly lastColor?: string;
  /** Cor da banda: a operacional é cinza; em mancal, a faixa da zona C é âmbar. */
  readonly bandColor?: string;
  /** Marcas de ponto (ensaio de laboratório, por exemplo), em índices da série. */
  readonly marks?: readonly number[];
  readonly width?: number;
  readonly height?: number;
  readonly className?: string;
  readonly label?: string;
}

export function Sparkline({
  values,
  band = null,
  domain,
  color = 'var(--color-fg-2)',
  lastColor,
  bandColor = 'var(--color-track)',
  marks = [],
  width = 240,
  height = 22,
  className = '',
  label,
}: SparklineProps) {
  const finite = values.filter(Number.isFinite);
  const range = extent(band ? [...finite, band.lo, band.hi] : finite);
  if (!range || finite.length < 2) {
    return (
      <svg
        role="img"
        aria-label={label ?? 'sem dados'}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        preserveAspectRatio="none"
        className={className}
      >
        <line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="var(--color-track)" />
      </svg>
    );
  }

  const [lo, hi] = domain ?? padded(range, 0.15);
  const x = linear([0, values.length - 1], [1, width - 3]);
  const y = linear([lo, hi], [height - 2, 2]);
  const points = values
    .map((value, index) => [index, value] as const)
    .filter(([, value]) => Number.isFinite(value))
    .map(([index, value]) => [x(index), y(value)] as const);
  const last = points.at(-1);

  return (
    <svg
      role="img"
      aria-label={label ?? 'minigráfico'}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      preserveAspectRatio="none"
      className={className}
    >
      {band ? (
        <rect
          x={0}
          width={width}
          y={y(band.hi)}
          height={Math.max(0, y(band.lo) - y(band.hi))}
          fill={bandColor}
        />
      ) : null}
      <polyline
        points={polyline(points)}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      {marks.map((index) => {
        const value = values[index];
        if (value === undefined || !Number.isFinite(value)) return null;
        return (
          <circle
            key={index}
            cx={x(index)}
            cy={y(value)}
            r={2.5}
            fill="var(--color-panel)"
            stroke={color}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {last ? <circle cx={last[0]} cy={last[1]} r={2} fill={lastColor ?? color} /> : null}
    </svg>
  );
}
