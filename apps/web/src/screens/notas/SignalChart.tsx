import type { IsoLimits } from '@mp1/shared';

import { linear } from '../../ui/chart/scale';
import type { Point } from '../../ui/chart/series';
import { num } from '../../ui/format';
import { useWidth } from '../../ui/useWidth';

/**
 * O sinal de origem de uma nota: a série que a fez nascer, com a nota marcada.
 *
 * Para mancal, o fundo são as zonas ISO 20816; para TAG de processo, a faixa
 * L–H. O eixo é a janela que a API devolveu — sem esticar para um período que
 * ela não tem.
 */
export interface SignalChartProps {
  readonly points: readonly Point[];
  readonly unit: string;
  readonly iso: IsoLimits | null;
  readonly band: { readonly lo: number | null; readonly hi: number | null } | null;
  readonly marker: number | null;
  readonly windowLabel: string;
}

const H = 196;

export function SignalChart({ points, unit, iso, band, marker, windowLabel }: SignalChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>(470);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) {
    return <p className="text-[12px] text-fg-3">A API não tem série para este sinal na janela.</p>;
  }

  const values = points.map((p) => p.v);
  const top = iso
    ? Math.max(iso.cToD * 1.4, ...values)
    : Math.max(band?.hi ?? -Infinity, ...values);
  const bottom = iso ? 0 : Math.min(band?.lo ?? Infinity, ...values);
  const pad = iso ? 0 : (top - bottom) * 0.15 || 1;
  const y = linear([bottom - pad, top + pad], [H, 0]);
  const x = linear([first.t, last.t], [0, width]);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');
  // cor só para estado: cinza dentro, amarelo em C, vermelho em D ou fora da faixa
  const dot = iso
    ? last.v >= iso.cToD
      ? 'var(--color-alarm-1)'
      : last.v >= iso.bToC
        ? 'var(--color-alarm-3)'
        : 'var(--color-fg)'
    : (band?.lo != null && last.v < band.lo) || (band?.hi != null && last.v > band.hi)
      ? 'var(--color-alarm-2)'
      : 'var(--color-fg)';
  const zones = iso
    ? [
        { from: 0, to: iso.aToB, fill: 'var(--color-iso-a)' },
        { from: iso.aToB, to: iso.bToC, fill: 'var(--color-iso-b)' },
        { from: iso.bToC, to: iso.cToD, fill: 'var(--color-iso-c)' },
        { from: iso.cToD, to: top + pad, fill: 'var(--color-iso-d)' },
      ]
    : [];

  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-2">
      <div className="relative font-mono text-[10px] text-fg-3" style={{ height: H }}>
        <span className="absolute top-0">{num(top + pad, 1)}</span>
        <span className="absolute bottom-0">{num(bottom - pad, 1)}</span>
      </div>
      <div ref={ref} className="relative min-w-0" style={{ height: H }}>
        <svg role="img" aria-label="Sinal de origem" width={width} height={H} className="block">
          {zones.map((zone) => (
            <rect
              key={zone.from}
              x={0}
              width={width}
              y={y(zone.to)}
              height={Math.max(0, y(zone.from) - y(zone.to))}
              fill={zone.fill}
            />
          ))}
          {band && band.lo !== null && band.hi !== null ? (
            <rect
              x={0}
              width={width}
              y={y(band.hi)}
              height={y(band.lo) - y(band.hi)}
              fill="var(--color-track)"
            />
          ) : null}
          <path d={path} fill="none" stroke="#c9ced6" strokeWidth={1.5} strokeLinejoin="round" />
          {marker !== null && marker >= first.t && marker <= last.t ? (
            <line
              x1={x(marker)}
              x2={x(marker)}
              y1={0}
              y2={H}
              stroke="var(--color-action)"
              strokeDasharray="2 3"
            />
          ) : null}
          <circle cx={x(last.t)} cy={y(last.v)} r={3} fill={dot} />
        </svg>
        {marker !== null && marker >= first.t && marker <= last.t ? (
          <span
            className="absolute top-1 bg-panel px-1 font-mono text-[10px] leading-3 text-action"
            style={{ left: Math.min(width - 60, x(marker) + 4) }}
          >
            nota aberta
          </span>
        ) : null}
      </div>
      <span />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-fg-3">
        <span>{windowLabel}</span>
        <span>
          <span className="text-[13px]" style={{ color: dot }}>
            {num(last.v, 1)}
          </span>{' '}
          <span className="text-fg-2">{unit} agora</span>
        </span>
      </div>
    </div>
  );
}
