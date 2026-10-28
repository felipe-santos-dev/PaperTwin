import { useId, useMemo, useState } from 'react';
import type { IsoLimits, VibrationBucket } from '@mp1/shared';

/**
 * Tendência da vibração do mancal, com as fronteiras da ISO 20816-3.
 *
 * Uma série só, então não há legenda: o título já diz o que a linha é, e a cor
 * não carrega identidade nenhuma. As duas linhas de limite são anotações, não
 * séries — vão tracejadas e com rótulo escrito, para não dependerem de cor.
 *
 * O eixo Y inclui a fronteira C→D mesmo quando a série fica abaixo dela: um
 * gráfico que reescala para caber só os dados faz uma vibração normal parecer
 * alarmante, porque a curva sempre enche o quadro.
 */

export interface VibrationTrendProps {
  readonly buckets: readonly VibrationBucket[];
  readonly limits: IsoLimits | null;
  readonly label: string;
}

const WIDTH = 288;
const PLOT_HEIGHT = 104;
const AXIS_BAND = 16;
const HEIGHT = PLOT_HEIGHT + AXIS_BAND;
const PAD_LEFT = 26;
const PAD_RIGHT = 6;
const PAD_TOP = 8;

const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function VibrationTrend({ buckets, limits, label }: VibrationTrendProps) {
  const titleId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (buckets.length < 2) return null;

    const values = buckets.map((bucket) => bucket.rmsAvgMmS);
    const ceiling = Math.max(...values, limits?.cToD ?? 0) * 1.12;
    const floor = 0;

    const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerHeight = PLOT_HEIGHT - PAD_TOP;

    const x = (i: number) => PAD_LEFT + (i / (buckets.length - 1)) * innerWidth;
    const y = (v: number) =>
      PAD_TOP + innerHeight - ((v - floor) / (ceiling - floor)) * innerHeight;

    const line = buckets
      .map((bucket, i) => `${i === 0 ? 'M' : 'L'}${String(x(i))},${String(y(bucket.rmsAvgMmS))}`)
      .join(' ');

    const area = `${line} L${String(x(buckets.length - 1))},${String(PLOT_HEIGHT)} L${String(PAD_LEFT)},${String(PLOT_HEIGHT)} Z`;

    return { x, y, line, area, ceiling };
  }, [buckets, limits]);

  if (!chart) {
    return (
      <p className="py-6 text-center text-xs text-mill-muted">
        Sem leituras suficientes para traçar a tendência.
      </p>
    );
  }

  const last = buckets.at(-1);
  const first = buckets[0];
  const active = hovered === null ? null : buckets[hovered];

  /** Converte a posição do ponteiro na janela mais próxima. */
  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const svgX = ratio * WIDTH;
    const step = (WIDTH - PAD_LEFT - PAD_RIGHT) / (buckets.length - 1);
    const index = Math.round((svgX - PAD_LEFT) / step);
    setHovered(Math.min(buckets.length - 1, Math.max(0, index)));
  };

  return (
    <figure className="mt-1">
      <figcaption id={titleId} className="mb-1 text-[11px] text-mill-muted">
        {label}
      </figcaption>

      <svg
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        className="w-full touch-none"
        role="img"
        aria-labelledby={titleId}
        onPointerMove={pick}
        onPointerLeave={() => {
          setHovered(null);
        }}
      >
        {/* fronteiras da norma: anotação, não série */}
        {limits && chart.y(limits.cToD) > PAD_TOP && (
          <g>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={chart.y(limits.cToD)}
              y2={chart.y(limits.cToD)}
              stroke="var(--color-mill-critical)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={WIDTH - PAD_RIGHT}
              y={chart.y(limits.cToD) - 3}
              textAnchor="end"
              className="fill-mill-critical text-[8px]"
            >
              C|D {limits.cToD}
            </text>
          </g>
        )}
        {limits && chart.y(limits.bToC) > PAD_TOP && (
          <g>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={chart.y(limits.bToC)}
              y2={chart.y(limits.bToC)}
              stroke="var(--color-mill-attention)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={WIDTH - PAD_RIGHT}
              y={chart.y(limits.bToC) - 3}
              textAnchor="end"
              className="fill-mill-attention text-[8px]"
            >
              B|C {limits.bToC}
            </text>
          </g>
        )}

        {/* eixo Y: só os extremos, em hairline recessivo */}
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={PLOT_HEIGHT}
          y2={PLOT_HEIGHT}
          stroke="var(--color-mill-line)"
          strokeWidth="1"
        />
        <text x={0} y={PAD_TOP + 7} className="fill-mill-muted text-[8px] tabular-nums">
          {chart.ceiling.toFixed(1)}
        </text>
        <text x={0} y={PLOT_HEIGHT - 1} className="fill-mill-muted text-[8px] tabular-nums">
          0
        </text>

        <path d={chart.area} fill="var(--color-mill-accent)" opacity="0.14" />
        <path
          d={chart.line}
          fill="none"
          stroke="var(--color-mill-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* ponto final rotulado: o valor que importa fica legível sem hover */}
        {last && (
          <circle
            cx={chart.x(buckets.length - 1)}
            cy={chart.y(last.rmsAvgMmS)}
            r="3"
            fill="var(--color-mill-accent)"
            stroke="var(--color-mill-panel)"
            strokeWidth="2"
          />
        )}

        {active && hovered !== null && (
          <g>
            <line
              x1={chart.x(hovered)}
              x2={chart.x(hovered)}
              y1={PAD_TOP}
              y2={PLOT_HEIGHT}
              stroke="var(--color-mill-muted)"
              strokeWidth="1"
            />
            <circle
              cx={chart.x(hovered)}
              cy={chart.y(active.rmsAvgMmS)}
              r="3.5"
              fill="var(--color-mill-fg)"
              stroke="var(--color-mill-panel)"
              strokeWidth="2"
            />
          </g>
        )}

        <text x={PAD_LEFT} y={HEIGHT - 3} className="fill-mill-muted text-[8px] tabular-nums">
          {first ? hora.format(new Date(first.bucketStart)) : ''}
        </text>
        <text
          x={WIDTH - PAD_RIGHT}
          y={HEIGHT - 3}
          textAnchor="end"
          className="fill-mill-muted text-[8px] tabular-nums"
        >
          {last ? hora.format(new Date(last.bucketStart)) : ''}
        </text>
      </svg>

      <p className="mt-0.5 h-4 text-center font-mono text-[10px] text-mill-muted">
        {active
          ? `${dataHora.format(new Date(active.bucketStart))} · ${active.rmsAvgMmS.toFixed(2)} mm/s · pico ${active.rmsMaxMmS.toFixed(2)}`
          : last
            ? `agora ${last.rmsAvgMmS.toFixed(2)} mm/s`
            : ''}
      </p>
    </figure>
  );
}
