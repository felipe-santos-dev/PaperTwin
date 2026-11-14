import { useCallback } from 'react';
import {
  estimateRemainingLife,
  type IsoLimits,
  type MaintenanceNote,
  type Round,
} from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import { linear } from '../../ui/chart/scale';
import { num } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { ResourceState } from '../../ui/ResourceState';
import { useResource } from '../../ui/useResource';
import { useWidth } from '../../ui/useWidth';
import { TEMP_LIMITS, temperatureLife, type BearingRow } from './derive';

/**
 * O mancal escolhido: vibração sobre as zonas ISO, temperatura embaixo e a
 * projeção linear das duas, com as rondas e as notas marcadas.
 *
 * A janela é a que a rota de vibração devolve (72 h ao vivo). A projeção vai
 * para a frente o mesmo tanto que a janela tem para trás — projetar 60 dias
 * a partir de 3 seria desenhar mais suposição que medida.
 */

const DAY = 24 * 3_600_000;

export function BearingDetail({
  gateway,
  row,
  rounds,
  notes,
  className = '',
}: {
  readonly gateway: DataGateway;
  readonly row: BearingRow;
  readonly rounds: readonly Round[];
  readonly notes: readonly MaintenanceNote[];
  readonly className?: string;
}) {
  const series = useResource(
    useCallback(
      (signal: AbortSignal) => gateway.vibration(row.assetTag, {}, signal),
      [gateway, row.assetTag],
    ),
  );
  const title = row.side
    ? `${row.label.replace(/^Mancal (LA|LC) · /, '')} · lado ${row.side}`
    : row.label;

  return (
    <Panel
      title={title}
      context={
        <span className="font-mono text-[11px] text-fg-3">
          {[row.vibrationTag, row.temperatureTag].filter(Boolean).join(' · ') || row.assetTag}
          {series.data ? ` · ${windowText(series.data.from, series.data.to)} + projeção` : ''}
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      <ResourceState resource={series} label="a vibração do mancal">
        {(data) => {
          const limits = data.limits ?? row.limits;
          if (!limits || data.buckets.length === 0) {
            return <p className="text-[12px] text-fg-3">Sem leitura de vibração na janela.</p>;
          }
          const life = estimateRemainingLife(data.buckets, limits);
          const temp = temperatureLife(data.buckets);
          const end = Date.parse(data.to);
          const crossing = (days: number | null) =>
            days === null
              ? null
              : new Date(end + days * DAY).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                });
          return (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Next
                  label="próximo limite de vibração"
                  days={life.daysToZoneD}
                  detail={
                    life.daysToZoneD === null
                      ? 'sem tendência de subida significativa'
                      : life.daysToZoneD < 0.5
                        ? `já em zona D (${num(limits.cToD, 1)} mm/s)`
                        : `zona D (${num(limits.cToD, 1)} mm/s) em ${crossing(life.daysToZoneD) ?? ''}`
                  }
                />
                <Next
                  label="próximo limite de temperatura"
                  days={temp.daysToZoneD}
                  detail={
                    temp.daysToZoneD === null
                      ? 'sem tendência de subida significativa'
                      : temp.daysToZoneD < 0.5
                        ? `já acima de ${String(TEMP_LIMITS.attention)} °C`
                        : `${String(TEMP_LIMITS.attention)} °C em ${crossing(temp.daysToZoneD) ?? ''}`
                  }
                />
              </div>
              <Plot
                buckets={data.buckets}
                limits={limits}
                from={Date.parse(data.from)}
                to={end}
                rounds={rounds}
                notes={notes}
                assetTag={row.assetTag}
                vSlope={life.trendMmSPerDay}
                tSlope={temp.trendMmSPerDay}
              />
            </>
          );
        }}
      </ResourceState>
    </Panel>
  );
}

function windowText(from: string, to: string): string {
  const hours = (Date.parse(to) - Date.parse(from)) / 3_600_000;
  return hours >= 48 ? `${String(Math.round(hours / 24))} dias` : `${String(Math.round(hours))} h`;
}

function Next({
  label,
  days,
  detail,
}: {
  readonly label: string;
  readonly days: number | null;
  readonly detail: string;
}) {
  return (
    <div className="border border-line bg-base/40 px-3 py-2">
      <div className="text-[11px] text-fg-3">{label}</div>
      <div className="flex items-baseline gap-2">
        <span
          className={`font-mono text-[20px] ${days !== null && days < 30 ? 'text-alarm-3' : 'text-fg'}`}
        >
          {days === null ? '—' : days < 0.5 ? '0' : `~${num(days, days < 10 ? 1 : 0)}`}
        </span>
        <span className="text-[12px] text-fg-2">{days === null ? '' : 'd'}</span>
        <span className="truncate text-[11px] text-fg-2">{detail}</span>
      </div>
    </div>
  );
}

function Plot({
  buckets,
  limits,
  from,
  to,
  rounds,
  notes,
  assetTag,
  vSlope,
  tSlope,
}: {
  readonly vSlope: number;
  readonly tSlope: number;
  readonly buckets: readonly { bucketStart: string; rmsAvgMmS: number; tempAvgC: number }[];
  readonly limits: IsoLimits;
  readonly from: number;
  readonly to: number;
  readonly rounds: readonly Round[];
  readonly notes: readonly MaintenanceNote[];
  readonly assetTag: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(600);
  const L = 40;
  const horizon = to + (to - from);
  const x = linear([from, horizon], [L, width - 4]);
  const vib = buckets.map((b) => ({ t: Date.parse(b.bucketStart), v: b.rmsAvgMmS }));
  const tmp = buckets.map((b) => ({ t: Date.parse(b.bucketStart), v: b.tempAvgC }));
  const lastV = vib.at(-1);
  const lastT = tmp.at(-1);
  // a mesma inclinação do rul.ts, a partir da última leitura
  const vEnd = lastV ? lastV.v + vSlope * ((horizon - lastV.t) / DAY) : 0;
  const tEnd = lastT ? lastT.v + tSlope * ((horizon - lastT.t) / DAY) : 0;
  const vTop = Math.max(limits.cToD * 1.4, ...vib.map((p) => p.v), vEnd);
  const VH = 190;
  const vy = linear([0, vTop], [VH, 6]);
  const tLo = Math.min(40, ...tmp.map((p) => p.v));
  const tHi = Math.max(TEMP_LIMITS.alarm + 5, ...tmp.map((p) => p.v), tEnd);
  const T0 = VH + 16;
  const TH = 80;
  const ty = linear([tLo, tHi], [T0 + TH, T0]);
  const line = (pts: { t: number; v: number }[], y: (v: number) => number) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const zones = [
    { lo: 0, hi: limits.aToB, fill: 'var(--color-iso-a)' },
    { lo: limits.aToB, hi: limits.bToC, fill: 'var(--color-iso-b)' },
    { lo: limits.bToC, hi: limits.cToD, fill: 'var(--color-iso-c)' },
    { lo: limits.cToD, hi: vTop, fill: 'var(--color-iso-d)' },
  ];
  const points = rounds.flatMap((round) =>
    round.points
      .filter((p) => p.assetTag === assetTag && p.fieldTempC !== null)
      .map((p) => ({ t: Date.parse(round.startedAt), v: p.fieldTempC ?? 0 })),
  );
  const noteTimes = notes
    .filter((n) => n.assetTag === assetTag)
    .map((n) => Date.parse(n.createdAt));
  const fmt = (t: number) =>
    new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const H = T0 + TH + 22;

  return (
    <div ref={ref} className="mt-3 min-h-0 flex-1">
      <svg role="img" aria-label="Vibração e temperatura do mancal" width={width} height={H}>
        <text
          x={0}
          y={10}
          fill="var(--color-fg-3)"
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
        >
          mm/s
        </text>
        {zones.map((z) => (
          <rect
            key={z.lo}
            x={L}
            width={width - L - 4}
            y={vy(z.hi)}
            height={Math.max(0, vy(z.lo) - vy(z.hi))}
            fill={z.fill}
          />
        ))}
        {[limits.bToC, limits.cToD].map((v) => (
          <text
            key={v}
            x={0}
            y={vy(v) + 3}
            fill="var(--color-fg-3)"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
          >
            {num(v, 1)}
          </text>
        ))}
        <path d={line(vib, vy)} fill="none" stroke="#c9ced6" strokeWidth={1.5} />
        {lastV ? (
          <line
            x1={x(lastV.t)}
            y1={vy(lastV.v)}
            x2={x(horizon)}
            y2={vy(Math.max(0, vEnd))}
            stroke="var(--color-fg-2)"
            strokeDasharray="4 3"
          />
        ) : null}
        {noteTimes.map((t) =>
          t >= from && t <= horizon ? (
            <rect key={t} x={x(t) - 4} y={8} width={8} height={8} fill="var(--color-action)">
              <title>nota</title>
            </rect>
          ) : null,
        )}

        <rect x={L} width={width - L - 4} y={T0} height={TH} fill="#161b22" />
        <text
          x={0}
          y={T0 + 8}
          fill="var(--color-fg-3)"
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
        >
          °C
        </text>
        {[TEMP_LIMITS.alarm, TEMP_LIMITS.attention].map((v) => (
          <g key={v}>
            <line
              x1={L}
              x2={width - 4}
              y1={ty(v)}
              y2={ty(v)}
              stroke="var(--color-fg-3)"
              strokeDasharray={v === TEMP_LIMITS.attention ? '2 3' : undefined}
            />
            <text
              x={0}
              y={ty(v) + 3}
              fill="var(--color-fg-3)"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
            >
              {v}
            </text>
          </g>
        ))}
        <path d={line(tmp, ty)} fill="none" stroke="#c9ced6" strokeWidth={1.3} />
        {lastT ? (
          <line
            x1={x(lastT.t)}
            y1={ty(lastT.v)}
            x2={x(horizon)}
            y2={ty(tEnd)}
            stroke="var(--color-fg-2)"
            strokeDasharray="4 3"
          />
        ) : null}
        {points.map((p) => (
          <circle
            key={p.t}
            cx={x(p.t)}
            cy={ty(p.v)}
            r={3.5}
            fill="var(--color-panel)"
            stroke="var(--color-fg)"
            strokeWidth={1.3}
          >
            <title>{`ronda: ${num(p.v, 1)} °C no campo`}</title>
          </circle>
        ))}

        <line x1={x(to)} x2={x(to)} y1={6} y2={T0 + TH} stroke="var(--color-fg-2)" />
        {[from, (from + to) / 2].map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            fill="var(--color-fg-3)"
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
          >
            {fmt(t)}
          </text>
        ))}
        <text
          x={x(to)}
          y={H - 4}
          textAnchor="middle"
          fill="var(--color-fg)"
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
        >
          hoje
        </text>
        <text
          x={width - 4}
          y={H - 4}
          textAnchor="end"
          fill="var(--color-fg-3)"
          fontSize={10}
          fontFamily="JetBrains Mono, monospace"
        >
          {fmt(horizon)}
        </text>
      </svg>
      <div className="flex gap-4 text-[11px] text-fg-2">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border border-fg" />
          ronda (campo)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 bg-action" />
          nota
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-fg-2" />
          projeção linear
        </span>
      </div>
    </div>
  );
}
