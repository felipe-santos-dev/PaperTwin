import { useCallback } from 'react';
import type { SetpointChange } from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import { linear, type Linear } from '../../ui/chart/scale';
import { seriesOf } from '../../ui/chart/series';
import { hhmm, num, tagValue } from '../../ui/format';
import { Illustrative, Panel } from '../../ui/Panel';
import { ResourceState } from '../../ui/ResourceState';
import { tagScale } from '../../ui/tagScale';
import { useResource } from '../../ui/useResource';
import { useWidth } from '../../ui/useWidth';

/**
 * Efeito do refino na folha: a energia de refino (`JIC-101`, real) e, embaixo,
 * dois ensaios que o refino move — Gurley e tração MD —, um ponto por bobina.
 *
 * Os ensaios são dado fixo e o painel leva o selo. Os dois tipos de dado ficam
 * em faixas separadas, com a fonte de cada uma escrita, e não no mesmo gráfico.
 */

const ENERGY = 'JIC-101';
const TESTS = [
  { tag: 'LAB-1205', label: 'Gurley' },
  { tag: 'LAB-1206', label: 'Tração MD' },
] as const;
const WINDOW = 8 * 3_600_000;

export function RefiningEffect({
  gateway,
  now,
  setpoints,
  className = '',
}: {
  readonly gateway: DataGateway;
  readonly now: number;
  readonly setpoints: readonly SetpointChange[];
  readonly className?: string;
}) {
  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const query = { from: new Date(now - WINDOW), to: new Date(now), buckets: 240 };
        const [trend, lab] = await Promise.all([
          gateway.tagTrend(ENERGY, query, signal),
          gateway.labResults({}, signal),
        ]);
        return { trend, lab };
      },
      [gateway, now],
    ),
  );
  const [ref, width] = useWidth<HTMLDivElement>(560);

  return (
    <Panel
      help="processo.refino"
      title="Efeito do refino na folha"
      aside={
        <span className="flex items-center gap-2">
          pontos = bobinas{' '}
          <Illustrative title="Ensaios de laboratório: dado fixo de demonstração. A energia de refino é leitura real." />
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      <ResourceState resource={data} label="o efeito do refino">
        {({ trend, lab }) => {
          const points = seriesOf(trend, now);
          const from = Math.min(Date.parse(trend.from), now - WINDOW);
          const x = linear([from, now], [0, width]);
          const change = setpoints.find(
            (item) => item.tag === ENERGY && Date.parse(item.changedAt) >= from,
          );
          const energy = tagScale(ENERGY);
          const values = points.map((p) => p.v);
          const lo = Math.min(...values);
          const hi = Math.max(...values);
          const pad = (hi - lo) * 0.4 || 2;
          const y = linear([lo - pad, hi + pad], [52, 4]);
          const path = points
            .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
            .join(' ');
          const last = points.at(-1);

          return (
            <div className="flex flex-col gap-2">
              <Strip label={ENERGY} unit={energy?.unit ?? ''} source="DCS · real">
                <div ref={ref} className="relative h-14">
                  <svg
                    role="img"
                    aria-label="Energia específica de refino"
                    width={width}
                    height={56}
                  >
                    <rect width={width} height={56} fill="#161b22" />
                    {change ? (
                      <line
                        x1={x(Date.parse(change.changedAt))}
                        x2={x(Date.parse(change.changedAt))}
                        y1={0}
                        y2={56}
                        stroke="var(--color-action)"
                        strokeDasharray="2 3"
                      />
                    ) : null}
                    <path d={path} fill="none" stroke="#c9ced6" strokeWidth={1.3} />
                  </svg>
                  {change ? (
                    <span
                      className="absolute top-0.5 font-mono text-[10px] text-action"
                      style={{ left: Math.min(width - 120, x(Date.parse(change.changedAt)) + 4) }}
                    >
                      SP {num(change.previousValue, 0)}→{num(change.newValue, 0)} ·{' '}
                      {hhmm(change.changedAt)}
                    </span>
                  ) : null}
                  {last ? (
                    <span className="absolute top-0.5 right-1 font-mono text-[12px]">
                      {tagValue(last.v, energy?.unit ?? '')}{' '}
                      <span className="text-[10px] text-fg-2">{energy?.unit}</span>
                    </span>
                  ) : null}
                </div>
              </Strip>
              {TESTS.map((test) => {
                const spec = lab.specs.find((item) => item.tag === test.tag);
                const results = lab.results.filter(
                  (r) => r.tag === test.tag && Date.parse(r.analyzedAt) >= from,
                );
                return (
                  <Strip
                    key={test.tag}
                    label={test.label}
                    unit={spec?.unit ?? ''}
                    source="laboratório · ilustrativo"
                  >
                    <LabDots
                      x={x}
                      width={width}
                      lo={spec?.lo ?? 0}
                      hi={spec?.hi ?? 1}
                      results={results}
                    />
                  </Strip>
                );
              })}
              <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-3">
                <span />
                <div className="relative h-4 font-mono text-[10px] text-fg-3">
                  {[0, 2, 4, 6, 8].map((h) => {
                    const t = from + h * 3_600_000;
                    return (
                      <span key={h} className="absolute -translate-x-1/2" style={{ left: x(t) }}>
                        {hhmm(new Date(t).toISOString())}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }}
      </ResourceState>
    </Panel>
  );
}

function Strip({
  label,
  unit,
  source,
  children,
}: {
  readonly label: string;
  readonly unit: string;
  readonly source: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-x-3">
      <div>
        <div className="text-[12px] text-fg-2">{label}</div>
        <div className="text-[10px] text-fg-3">{unit}</div>
        <div className="text-[9px] text-fg-3">{source}</div>
      </div>
      {children}
    </div>
  );
}

function LabDots({
  x,
  width,
  lo,
  hi,
  results,
}: {
  readonly x: Linear;
  readonly width: number;
  readonly lo: number;
  readonly hi: number;
  readonly results: readonly { reelNumber: number; value: number; analyzedAt: string }[];
}) {
  const pad = (hi - lo) * 0.3;
  const y = linear([lo - pad, hi + pad], [48, 4]);
  const edge = (hi - lo) * 0.1;
  return (
    <svg role="img" aria-label="Ensaios por bobina" width={width} height={52}>
      <rect width={width} height={52} fill="#161b22" />
      <rect width={width} y={y(hi)} height={y(lo) - y(hi)} fill="var(--color-track)" />
      {results.map((r) => {
        const out = r.value < lo || r.value > hi;
        const near = !out && (r.value < lo + edge || r.value > hi - edge);
        return (
          <circle
            key={r.reelNumber}
            cx={x(Date.parse(r.analyzedAt))}
            cy={y(r.value)}
            r={3.5}
            fill={
              out
                ? 'var(--color-spec-out)'
                : near
                  ? 'var(--color-spec-edge-line)'
                  : 'var(--color-fg)'
            }
          >
            <title>{`bobina ${String(r.reelNumber)}: ${num(r.value, 1)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
